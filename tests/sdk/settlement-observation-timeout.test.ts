import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { bytesToHex, SignetRequestResponseReader } from "@sig-net/midnight";
import { JsonRpcProvider, TransactionReceipt } from "ethers";
import { expect, it, vi } from "vitest";

import { pollBackoffMs, runDeposit, SettlementObservationTimeout } from "@/lib/midnight/vault";

import { createProgressRecorder } from "./flow-progress-fixture";
import {
  createPendingDeposit,
  createSignatureResponse,
  createVaultCircuitFixture,
} from "./vault-circuit-fixture";

const MINUTE = 60_000;
const OBSERVATION_LIMIT = 20 * MINUTE;
const UNITS = 1000000n;

/**
 * @returns A recoverable pending deposit whose ledger state is already published.
 */
async function createRecoverableDeposit(): Promise<{
  fixture: Awaited<ReturnType<typeof createVaultCircuitFixture>>;
  tokenAddress: string;
  requestId: string;
  request: Awaited<ReturnType<typeof createPendingDeposit>>["request"];
}> {
  const fixture = await createVaultCircuitFixture();
  const token = new Uint8Array(20).fill(9);
  const { pendingState, requestId, request } = await createPendingDeposit(fixture, token, UNITS);
  const state = new ContractState();
  state.data = pendingState;
  vi.spyOn(fixture.binding.providers.publicDataProvider, "queryContractState").mockResolvedValue(
    state,
  );
  return { fixture, tokenAddress: `0x${bytesToHex(token)}`, requestId, request };
}

it("reports an unfinished signature observation as a live request", async () => {
  const { fixture, tokenAddress, requestId } = await createRecoverableDeposit();
  const { binding } = fixture;
  const polls = vi
    .spyOn(SignetRequestResponseReader.prototype, "getVerifiedSignatureRespondedEvent")
    .mockResolvedValue({ verified: undefined, verdicts: [] });
  const start = vi.spyOn(binding.contract.callTx, "startDeposit");
  const complete = vi.spyOn(binding.contract.callTx, "completeDeposit");
  const broadcast = vi.spyOn(JsonRpcProvider.prototype, "broadcastTransaction");
  const recorder = createProgressRecorder();
  vi.useFakeTimers();
  try {
    const settled = vi.fn();
    const failed = vi.fn<(failure: unknown) => void>();
    const deposit = runDeposit(
      recorder.progress,
      binding.providers,
      binding.contract,
      binding.environment,
      binding.identity,
      tokenAddress,
      UNITS,
      vi.fn(),
      undefined,
      requestId,
    ).then(settled, failed);

    await vi.advanceTimersByTimeAsync(6 * MINUTE);
    expect(settled).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    const pollsAfterSix = polls.mock.calls.length;

    await vi.advanceTimersByTimeAsync(9 * MINUTE);
    expect(failed).not.toHaveBeenCalled();
    expect(polls.mock.calls.length).toBeGreaterThan(pollsAfterSix);

    await vi.advanceTimersByTimeAsync(OBSERVATION_LIMIT);
    await deposit;
    expect(settled).not.toHaveBeenCalled();
    const failure: unknown = failed.mock.calls[0]?.[0];
    expect(failure).toBeInstanceOf(SettlementObservationTimeout);
    const described = failure instanceof Error ? failure.message : "";
    expect(described).toContain(requestId);
    expect(described).toContain("still live on chain");
    expect(described).toContain("20 minutes of observation");
    expect(described).not.toContain("failed");

    // Nothing was requested or completed a second time while the observation ran out.
    expect(start).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(recorder.eventNames()).toEqual(["request-confirmed", "signature-wait"]);
  } finally {
    vi.useRealTimers();
  }
});

it("reports an unfinished attestation observation without resending the broadcast sweep", async () => {
  const { fixture, tokenAddress, requestId, request } = await createRecoverableDeposit();
  const { binding } = fixture;
  const { signer, signature } = createSignatureResponse(request, `0x${"01".repeat(32)}`);
  vi.spyOn(
    SignetRequestResponseReader.prototype,
    "getVerifiedSignatureRespondedEvent",
  ).mockResolvedValue({ verified: signature, verdicts: [] });
  vi.spyOn(SignetRequestResponseReader.prototype, "getSignatureRequest").mockResolvedValue(request);
  const respondEvents = vi
    .spyOn(SignetRequestResponseReader.prototype, "getRespondBidirectionalEvents")
    .mockResolvedValue([]);
  const provider = new JsonRpcProvider(binding.environment.evmRpcUrl);
  vi.spyOn(JsonRpcProvider.prototype, "getTransactionReceipt").mockImplementation((hash) =>
    Promise.resolve(
      new TransactionReceipt(
        {
          to: signer.address,
          from: signer.address,
          contractAddress: null,
          hash,
          index: 0,
          blockHash: `0x${"02".repeat(32)}`,
          blockNumber: 11701696,
          logsBloom: `0x${"00".repeat(256)}`,
          logs: [],
          gasUsed: 21000n,
          cumulativeGasUsed: 21000n,
          gasPrice: 1n,
          type: 0,
          status: 1,
          root: null,
        },
        provider,
      ),
    ),
  );
  const broadcast = vi.spyOn(JsonRpcProvider.prototype, "broadcastTransaction");
  const complete = vi.spyOn(binding.contract.callTx, "completeDeposit");
  const recorder = createProgressRecorder();
  vi.useFakeTimers();
  try {
    const failed = vi.fn<(failure: unknown) => void>();
    const deposit = runDeposit(
      recorder.progress,
      binding.providers,
      binding.contract,
      binding.environment,
      binding.identity,
      tokenAddress,
      UNITS,
      vi.fn(),
      undefined,
      requestId,
    ).then(vi.fn(), failed);

    await vi.advanceTimersByTimeAsync(15 * MINUTE + 30_000);
    expect(failed).not.toHaveBeenCalled();
    expect(recorder.eventNames()).toEqual([
      "request-confirmed",
      "signature-wait",
      "evm-broadcast",
      "evm-receipt",
      "attestation-wait",
    ]);

    await vi.advanceTimersByTimeAsync(OBSERVATION_LIMIT);
    await deposit;
    const failure: unknown = failed.mock.calls[0]?.[0];
    expect(failure).toBeInstanceOf(SettlementObservationTimeout);
    expect(failure instanceof Error ? failure.message : "").toContain(
      "MPC attestation of the EVM execution",
    );
    expect(broadcast).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(respondEvents.mock.calls.length).toBeGreaterThan(1);
    // The published checkpoints stay exactly where the evidence stopped arriving.
    expect(recorder.eventNames()).toEqual([
      "request-confirmed",
      "signature-wait",
      "evm-broadcast",
      "evm-receipt",
      "attestation-wait",
    ]);
  } finally {
    vi.useRealTimers();
  }
});

it("ends the wait with the session rejection when the captured session is replaced", async () => {
  const { fixture, tokenAddress, requestId } = await createRecoverableDeposit();
  const { binding } = fixture;
  vi.spyOn(
    SignetRequestResponseReader.prototype,
    "getVerifiedSignatureRespondedEvent",
  ).mockResolvedValue({ verified: undefined, verdicts: [] });
  const environment = {
    ...binding.environment,
    assertActive: vi.fn(binding.environment.assertActive),
  };
  vi.useFakeTimers();
  try {
    const failed = vi.fn<(failure: unknown) => void>();
    const deposit = runDeposit(
      createProgressRecorder().progress,
      binding.providers,
      binding.contract,
      environment,
      binding.identity,
      tokenAddress,
      UNITS,
      vi.fn(),
      undefined,
      requestId,
    ).then(vi.fn(), failed);

    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(failed).not.toHaveBeenCalled();
    environment.assertActive.mockImplementation(() => {
      throw new Error("Vault session superseded.");
    });
    await vi.advanceTimersByTimeAsync(MINUTE);
    await deposit;
    const failure: unknown = failed.mock.calls[0]?.[0];
    expect(failure).not.toBeInstanceOf(SettlementObservationTimeout);
    expect(failure instanceof Error ? failure.message : "").toBe("Vault session superseded.");
  } finally {
    vi.useRealTimers();
  }
});

it("absorbs transient read failures and reports a read that keeps failing as itself", async () => {
  const { fixture, tokenAddress, requestId } = await createRecoverableDeposit();
  const { binding } = fixture;
  let failuresLeft = 3;
  const polls = vi
    .spyOn(SignetRequestResponseReader.prototype, "getVerifiedSignatureRespondedEvent")
    .mockImplementation(() => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        return Promise.reject(new Error("indexer unavailable"));
      }
      return Promise.resolve({ verified: undefined, verdicts: [] });
    });
  const recorder = createProgressRecorder();
  vi.useFakeTimers();
  try {
    const failed = vi.fn<(failure: unknown) => void>();
    const deposit = runDeposit(
      recorder.progress,
      binding.providers,
      binding.contract,
      binding.environment,
      binding.identity,
      tokenAddress,
      UNITS,
      vi.fn(),
      undefined,
      requestId,
    ).then(vi.fn(), failed);

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(failed).not.toHaveBeenCalled();
    expect(polls.mock.calls.length).toBeGreaterThan(3);
    // Only reads that returned move the freshness reading forward.
    expect(recorder.observationCount()).toBeGreaterThan(0);

    failuresLeft = Number.MAX_SAFE_INTEGER;
    await vi.advanceTimersByTimeAsync(MINUTE);
    await deposit;
    const failure: unknown = failed.mock.calls[0]?.[0];
    expect(failure).not.toBeInstanceOf(SettlementObservationTimeout);
    expect(failure instanceof Error ? failure.message : "").toBe("indexer unavailable");
  } finally {
    vi.useRealTimers();
  }
});

it("backs a long wait off from one second without stopping its feedback", () => {
  expect(pollBackoffMs(0)).toBe(1000);
  expect(pollBackoffMs(29_999)).toBe(1000);
  expect(pollBackoffMs(30_000)).toBe(2000);
  expect(pollBackoffMs(2 * MINUTE - 1)).toBe(2000);
  expect(pollBackoffMs(2 * MINUTE)).toBe(5000);
  expect(pollBackoffMs(15 * MINUTE)).toBe(5000);
});
