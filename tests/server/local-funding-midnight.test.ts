import { addressFromKey, signatureVerifyingKey } from "@midnightntwrk/ledger-v9";
import { InMemoryTransactionHistoryStorage } from "@midnightntwrk/wallet-sdk-abstractions";
import { MidnightBech32m, UnshieldedAddress } from "@midnightntwrk/wallet-sdk-address-format";
import { mergeWalletEntries, WalletEntrySchema } from "@midnightntwrk/wallet-sdk-facade";
import * as unshielded from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import * as deployment from "@sig-net/midnight-contract-deploy";
import { beforeEach, expect, it, vi } from "vitest";

import { POST } from "@/app/api/local-funding/midnight/route";
import { getEvmChainConfig } from "@/lib/config/evm";
import * as local from "@/lib/config/local-demo";
import { getMidnightChainConfig } from "@/lib/config/midnight";
import { LOCAL_NIGHT_GRANT } from "@/lib/wallet-funding";

import { configureLocalDemo } from "../config/local-demo-fixture";
import { createWalletFacadeFixture } from "../sdk/wallet-facade-fixture";
import { attestedRequest } from "./request-fixture";

vi.mock("@midnightntwrk/wallet-sdk-unshielded-wallet", { spy: true });
vi.mock("@sig-net/midnight-contract-deploy", { spy: true });

beforeEach(() => {
  configureLocalDemo();
  vi.mocked(unshielded.UnshieldedWallet).mockReset();
  vi.stubEnv("LOCAL_MIDNIGHT_GENESIS_SEED", "07".repeat(32));
});

it("grants only the NIGHT deficit, serialises repeats and closes observers and registry", async () => {
  const configuration = getMidnightChainConfig();
  const publicKey = signatureVerifyingKey({ tag: "schnorr", value: "01".repeat(32) });
  const addressHex = addressFromKey(publicKey);
  const address = MidnightBech32m.encode(
    "undeployed",
    new UnshieldedAddress(Buffer.from(addressHex, "hex")),
  ).toString();
  const walletClass = unshielded.UnshieldedWallet({
    networkId: "undeployed",
    indexerClientConnection: {
      indexerHttpUrl: configuration.indexerUrl,
      indexerWsUrl: configuration.indexerWsUrl,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
  });
  const observer = walletClass.startWithPublicKey({ publicKey, address, addressHex });
  const observed = Promise.withResolvers<unshielded.UnshieldedWalletState>();
  const subscription = observer.state.subscribe({
    next: (state) => {
      observed.resolve(state);
    },
    error: (error: Error) => {
      observed.reject(error);
    },
  });
  const observerState = await observed.promise;
  subscription.unsubscribe();
  const controls = { eligible: true, night: 7n };
  vi.spyOn(observerState, "balances", "get").mockImplementation(() => ({ night: controls.night }));
  vi.spyOn(observer, "waitForSyncedState").mockResolvedValue(observerState);
  vi.spyOn(observer, "start").mockResolvedValue(undefined);
  const stopped = vi.spyOn(observer, "stop");
  vi.spyOn(walletClass, "startWithPublicKey").mockReturnValue(observer);
  vi.mocked(unshielded.UnshieldedWallet).mockReturnValue(walletClass);
  vi.spyOn(local, "requireLocalDemo").mockImplementation(() =>
    controls.eligible
      ? Promise.resolve({
          midnight: configuration,
          evm: getEvmChainConfig(),
          rpc: () => Promise.resolve(null),
        })
      : Promise.reject(new Error("not eligible")),
  );
  const { facade, keys, state: facadeState } = await createWalletFacadeFixture(configuration);
  vi.spyOn(facade, "waitForSyncedState").mockResolvedValue(facadeState);
  vi.spyOn(deployment.WalletRegistry.prototype, "wallet").mockResolvedValue({
    label: "fixture",
    keys,
    facade,
  });
  const closed = vi
    .spyOn(deployment.WalletRegistry.prototype, "close")
    .mockResolvedValue(undefined);
  const funded = vi.mocked(deployment.assertRootFunded).mockResolvedValue({
    addresses: deployment.deriveWalletAddresses("07".repeat(32), configuration),
    night: LOCAL_NIGHT_GRANT,
    dust: 10000000000000000n,
  });
  const transfer = vi
    .mocked(deployment.transferNight)
    .mockImplementation((_facade, _keys, _state, _recipient, _network, amount) => {
      controls.night += amount;
      return Promise.resolve("fixture-transfer");
    });
  const request = (): Parameters<typeof POST>[0] =>
    attestedRequest("/api/local-funding/midnight", JSON.stringify({ address, publicKey }));
  try {
    expect((await POST(request())).status).toBe(200);
    expect(controls.night).toBe(LOCAL_NIGHT_GRANT);
    expect(transfer).toHaveBeenCalledWith(
      facade,
      keys,
      facadeState,
      address,
      "undeployed",
      LOCAL_NIGHT_GRANT - 7n,
    );
    const repeated = await Promise.all([POST(request()), POST(request())]);
    expect(repeated.map((response) => response.status)).toStrictEqual([200, 200]);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(funded).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(3);
    expect(stopped).toHaveBeenCalledTimes(3);
    controls.eligible = false;
    expect((await POST(request())).status).toBe(403);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(
      (
        await POST(
          attestedRequest(
            "/api/local-funding/midnight",
            JSON.stringify({ address, publicKey, seed: "reject" }),
          ),
        )
      ).status,
    ).toBe(400);
  } finally {
    await observer.stop();
    await facade.stop();
  }
});
