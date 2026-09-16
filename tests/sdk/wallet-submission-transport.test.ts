import { Transaction } from "@midnightntwrk/ledger-v9";
import {
  NodeClient,
  NodeClientError,
  SubmissionEvent,
} from "@midnightntwrk/wallet-sdk-node-client/effect";
import * as polkadot from "@polkadot/api";
import { Effect } from "effect";
import { afterEach, expect, it, type MockInstance, vi } from "vitest";

import { NETWORK_DEFAULTS } from "@/lib/config/runtime";
import type { WalletFacade } from "@/lib/midnight/seedlib";

import { createWalletFacadeFixture } from "./wallet-facade-fixture";

vi.mock(import("@polkadot/api"), { spy: true });
vi.mock(import("@midnightntwrk/wallet-sdk-node-client/effect"), async (original) => {
  const actual = await original();
  return { ...actual, NodeClient: { ...actual.NodeClient } };
});
afterEach(() => {
  vi.useRealTimers();
});

interface ApiRecord {
  api: polkadot.ApiPromise;
  ready: PromiseWithResolvers<polkadot.ApiPromise>;
  closed: MockInstance<polkadot.ApiPromise["disconnect"]>;
}

function controlApi(api: polkadot.ApiPromise, handshake: boolean): ApiRecord {
  const ready = Promise.withResolvers<polkadot.ApiPromise>();
  vi.spyOn(api, "isReadyOrError", "get").mockReturnValue(
    handshake ? ready.promise : Promise.resolve(api),
  );
  const closed = vi.spyOn(api, "disconnect");
  return { api, ready, closed };
}

async function fixture(handshake = false): Promise<{
  facade: WalletFacade;
  apis: ApiRecord[];
  submit: MockInstance<typeof NodeClient.sendMidnightTransactionAndWait>;
}> {
  const actual = await vi.importActual<typeof polkadot>("@polkadot/api");
  const apis: ApiRecord[] = [];
  vi.spyOn(polkadot.WsProvider.prototype, "connect").mockResolvedValue(undefined);
  vi.mocked(polkadot.ApiPromise).mockImplementation(
    class extends actual.ApiPromise {
      override disconnect = vi.fn<polkadot.ApiPromise["disconnect"]>().mockResolvedValue(undefined);

      constructor(options?: ConstructorParameters<typeof polkadot.ApiPromise>[0]) {
        super(options);
        apis.push(controlApi(this, handshake));
      }
    },
  );
  const submit = vi
    .spyOn(NodeClient, "sendMidnightTransactionAndWait")
    .mockImplementation((tx, status) => {
      const txHash = `0x${"01".repeat(32)}`;
      const blockHash = `0x${"02".repeat(32)}`;
      switch (status) {
        case "Submitted":
          return Effect.succeed(SubmissionEvent.Submitted({ tx, txHash }));
        case "InBlock":
          return Effect.succeed(
            SubmissionEvent.InBlock({ tx, txHash, blockHash, blockHeight: 1n }),
          );
        case "Finalized":
          return Effect.succeed(
            SubmissionEvent.Finalized({ tx, txHash, blockHash, blockHeight: 1n }),
          );
      }
    });
  const { facade } = await createWalletFacadeFixture(NETWORK_DEFAULTS.midnight.undeployed);
  return { facade, apis, submit };
}

it("keeps unused transports closed and gives each concurrent status request one fresh API", async () => {
  const unused = await fixture();
  const tx = Transaction.fromParts("undeployed").mockProve();
  expect(unused.apis).toHaveLength(0);
  await unused.facade.submissionService.close();
  await unused.facade.submissionService.close();
  await expect(unused.facade.submissionService.submitTransaction(tx)).rejects.toThrow(
    "disconnected",
  );
  expect(unused.apis).toHaveLength(0);
  await unused.facade.stop();
  const f = await fixture();
  const service = f.facade.submissionService;
  try {
    const results = await Promise.all([
      service.submitTransaction(tx),
      service.submitTransaction(tx, "Submitted"),
      service.submitTransaction(tx, "InBlock"),
      service.submitTransaction(tx, "Finalized"),
    ]);
    expect(results.map((result) => result._tag)).toStrictEqual([
      "InBlock",
      "Submitted",
      "InBlock",
      "Finalized",
    ]);
    expect(f.apis).toHaveLength(4);
    expect(new Set(f.apis.map((record) => record.api)).size).toBe(4);
    expect(f.submit.mock.calls.map((call) => call[1])).toStrictEqual([
      "InBlock",
      "Submitted",
      "InBlock",
      "Finalized",
    ]);
    for (const api of f.apis) expect(api.closed).toHaveBeenCalledTimes(1);
    const closing = service.close();
    expect(service.close()).toBe(closing);
    await closing;
    await expect(service.submitTransaction(tx)).rejects.toThrow("disconnected");
    expect(f.apis).toHaveLength(4);
  } finally {
    await f.facade.stop();
  }
});

it("propagates submission failure without retry and disconnects its API", async () => {
  const f = await fixture();
  f.submit.mockImplementation((tx) =>
    Effect.fail(
      new NodeClientError.SubmissionError({ message: "fixture submission rejection", txData: tx }),
    ),
  );
  try {
    await expect(
      f.facade.submissionService.submitTransaction(Transaction.fromParts("undeployed").mockProve()),
    ).rejects.toThrow("fixture submission rejection");
    expect(f.submit).toHaveBeenCalledTimes(1);
    expect(f.apis).toHaveLength(1);
    expect(f.apis[0]?.closed).toHaveBeenCalledTimes(1);
  } finally {
    await f.facade.stop();
  }
});

it.each(["handshake", "submission"] as const)(
  "cancels pending %s and excludes a late ready continuation",
  async (phase) => {
    const f = await fixture(phase === "handshake");
    const entered = Promise.withResolvers<undefined>();
    f.submit.mockImplementation(() => {
      entered.resolve(undefined);
      return Effect.never;
    });
    const service = f.facade.submissionService;
    const pending = service.submitTransaction(Transaction.fromParts("undeployed").mockProve());
    const settled = pending.then(
      () => true,
      () => false,
    );
    if (phase === "submission") await entered.promise;
    await vi.waitFor(() => {
      expect(f.apis).toHaveLength(1);
    });
    const api = f.apis[0];
    if (!api) throw new Error("Expected owned API");
    const calls = f.submit.mock.calls.length;
    await service.close();
    await expect(settled).resolves.toBe(false);
    await expect(pending).rejects.toThrow("disconnected");
    api.ready.resolve(api.api);
    await Promise.resolve();
    expect(api.closed).toHaveBeenCalledTimes(1);
    expect(f.submit).toHaveBeenCalledTimes(calls);
    await f.facade.stop();
  },
);

it("times out a pending handshake and clears the owned timer", async () => {
  const f = await fixture(true);
  vi.useFakeTimers();
  const service = f.facade.submissionService;
  const pending = service.submitTransaction(Transaction.fromParts("undeployed").mockProve());
  const settled = pending.then(
    () => true,
    () => false,
  );
  await vi.advanceTimersByTimeAsync(120000);
  await expect(settled).resolves.toBe(false);
  await expect(pending).rejects.toThrow("connection timed out");
  expect(f.apis).toHaveLength(1);
  expect(f.apis[0]?.closed).toHaveBeenCalledTimes(1);
  expect(f.submit).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  await service.close();
  await f.facade.stop();
});
