import { LedgerParameters } from "@midnightntwrk/ledger-v9";
import {
  DustAddress,
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from "@midnightntwrk/wallet-sdk-address-format";
import type { FacadeState } from "@midnightntwrk/wallet-sdk-facade";
import { HDWallet } from "@midnightntwrk/wallet-sdk-hd";
import { MidnightNetwork } from "@sig-net/midnight";
import { Subject } from "rxjs";
import { expect, it, vi } from "vitest";

import { createMidnightChainConfig } from "@/lib/config/midnight";
import * as seedlib from "@/lib/midnight/seedlib";
import { SeedWallet } from "@/lib/midnight/wallet/SeedWallet";
import type { WalletAddressSnapshot } from "@/lib/midnight/wallet/Wallet";

import { createSeedWalletFixture } from "./seed-wallet-fixture";
import { createWalletFacadeFixture } from "./wallet-facade-fixture";

vi.mock(import("@/lib/midnight/seedlib"), { spy: true });

it("accepts every SDK seed length from 16 through 64 bytes and rejects values outside that range", () => {
  for (const length of Array.from({ length: 49 }, (_, index) => index + 16))
    expect(HDWallet.fromSeed(new Uint8Array(length).fill(7)).type).toBe("seedOk");
  for (const length of [0, 15, 65])
    expect(HDWallet.fromSeed(new Uint8Array(length)).type).toBe("seedError");
  expect(LedgerParameters.initialParameters().dust).toBeDefined();
});

it("publishes all encoded addresses before facade construction across every network", async () => {
  const seed = "07".repeat(32);
  for (const networkId of Object.values(MidnightNetwork)) {
    const configuration = createMidnightChainConfig({
      networkId,
      indexerUrl: "http://127.0.0.1:8088/api/v3/graphql",
      indexerWsUrl: "ws://127.0.0.1:8088/api/v3/graphql/ws",
      nodeUrl: "http://127.0.0.1:9944",
      proofServerUrl: "http://127.0.0.1:6300",
    });
    const { facade, keys } = await createWalletFacadeFixture(configuration, seed);
    const construction = Promise.withResolvers<seedlib.WalletFacade>();
    vi.mocked(seedlib.initialiseWalletFacade).mockReturnValueOnce(construction.promise);
    const wallet = new SeedWallet(configuration, seed);
    const onAddresses = vi.fn<(snapshot: WalletAddressSnapshot) => void>();
    const pending = wallet.initialise(undefined, onAddresses);

    expect(onAddresses).toHaveBeenCalledTimes(1);
    const snapshotCall = onAddresses.mock.calls[0];
    if (!snapshotCall) throw new Error("Address callback did not receive a snapshot.");
    const [snapshot] = snapshotCall;
    expect(snapshot).toStrictEqual({
      networkId,
      shieldedAddress: wallet.shieldedAddress,
      unshieldedAddress: wallet.unshieldedAddress,
      dustAddress: wallet.dustAddress,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);

    const shielded = new ShieldedAddress(
      ShieldedCoinPublicKey.fromHexString(keys.shieldedSecretKeys.coinPublicKey),
      ShieldedEncryptionPublicKey.fromHexString(keys.shieldedSecretKeys.encryptionPublicKey),
    );
    const shieldedEncoded = MidnightBech32m.encode(networkId, shielded);
    expect(ShieldedAddress.codec.decode(networkId, shieldedEncoded).equals(shielded)).toBe(true);
    expect(snapshot.shieldedAddress).toBe(shieldedEncoded.toString());

    const unshieldedEncoded = keys.unshieldedKeystore.getBech32Address().toString();
    expect(snapshot.unshieldedAddress).toBe(unshieldedEncoded);

    const dust = new DustAddress(keys.dustSecretKey.publicKey);
    const dustEncoded = MidnightBech32m.encode(networkId, dust);
    expect(DustAddress.codec.decode(networkId, dustEncoded).equals(dust)).toBe(true);
    expect(snapshot.dustAddress).toBe(dustEncoded.toString());

    const disconnect = wallet.disconnect();
    construction.resolve(facade);
    await expect(pending).rejects.toThrow("disconnected");
    await disconnect;
  }
});

it.each(["construction", "start", "sync", "connected"] as const)(
  "disconnects during %s and ignores late state without leaking subscriptions",
  async (phase) => {
    const {
      facade,
      state,
      construction,
      starting,
      startEntered,
      subscribed,
      states,
      stop,
      wallet,
    } = await createSeedWalletFixture();
    vi.spyOn(state, "isSynced", "get").mockReturnValue(true);
    vi.spyOn(state.shielded.capabilities.coinsAndBalances, "getTotalBalances").mockReturnValue({
      token: 9n,
    });
    vi.spyOn(state.unshielded, "balances", "get").mockReturnValue({ night: 3n });
    vi.spyOn(state.dust, "balance").mockReturnValue(2n);
    const progress = vi.fn<(status: string) => void>();
    const pending = wallet.initialise(progress);
    expect(wallet.initialise()).toBe(pending);
    const settled = pending.then(
      () => "connected",
      () => "rejected",
    );
    if (phase !== "construction") {
      construction.resolve(facade);
      await startEntered.promise;
    }
    if (phase === "sync" || phase === "connected") {
      starting.resolve(undefined);
      await subscribed.promise;
    }
    let balances:
      | { shielded: Record<string, bigint>; unshielded: Record<string, bigint>; dust: bigint }
      | undefined;
    let address: string | undefined;
    if (phase === "connected") {
      states.next(state);
      await pending;
      address = wallet.shieldedAddress;
      balances = {
        shielded: await wallet.getShieldedBalances(),
        unshielded: await wallet.getUnshieldedBalances(),
        dust: await wallet.getDustBalance(),
      };
    }
    expect(balances).toStrictEqual(
      phase === "connected"
        ? { shielded: { token: 9n }, unshielded: { night: 3n }, dust: 2n }
        : undefined,
    );
    expect(address?.startsWith("mn_shield-addr_undeployed")).toBe(
      phase === "connected" ? true : undefined,
    );
    const before = progress.mock.calls.length;
    const disconnect = wallet.disconnect();
    construction.resolve(facade);
    starting.resolve(undefined);
    await disconnect;
    states.next(state);
    expect(progress).toHaveBeenCalledTimes(before);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(states.observed).toBe(false);
    await wallet.disconnect();
    expect(stop).toHaveBeenCalledTimes(1);
    await expect(wallet.getShieldedBalances()).rejects.toThrow("disconnected");
    expect(await settled).toBe(phase === "connected" ? "connected" : "rejected");
  },
);

it.each(["construction", "start", "sync"] as const)(
  "owns late %s rejection after disconnect",
  async (phase) => {
    const { facade, construction, starting, startEntered, subscribed, states, stop, wallet } =
      await createSeedWalletFixture();
    const pending = wallet.initialise().then(
      () => "connected",
      () => "rejected",
    );
    if (phase !== "construction") {
      construction.resolve(facade);
      await startEntered.promise;
    }
    if (phase === "sync") {
      starting.resolve(undefined);
      await subscribed.promise;
    }
    const disconnect = wallet.disconnect();
    if (phase === "construction") construction.reject(new Error("late construction failure"));
    if (phase === "start") starting.reject(new Error("late start failure"));
    if (phase === "sync") states.error(new Error("late sync failure"));
    await expect(pending).resolves.toBe("rejected");
    await disconnect;
    expect(stop).toHaveBeenCalledTimes(phase === "construction" ? 0 : 1);
    expect(states.observed).toBe(false);
    await facade.stop();
  },
);

it("serialises opaque shielded and DUST state through their public SDK capabilities", async () => {
  const { facade } = await createWalletFacadeFixture(createMidnightChainConfig({}));
  try {
    const snapshots = await Promise.all([
      facade.shielded.serializeState(),
      facade.dust.serializeState(),
    ]);
    expect(snapshots).toHaveLength(2);
    for (const snapshot of snapshots) expect(snapshot).toMatch(/"state"\s*:\s*"[^"]+"/);
  } finally {
    await facade.stop();
  }
});

it("coalesces DUST registration and disconnect prevents late signing or submission", async () => {
  const configuration = createMidnightChainConfig({});
  const { facade, state } = await createWalletFacadeFixture(configuration);
  vi.spyOn(state, "isSynced", "get").mockReturnValue(true);
  vi.spyOn(state.dust, "balance").mockReturnValue(0n);
  vi.spyOn(state.unshielded, "availableCoins", "get").mockReturnValue([
    {
      utxo: {
        value: 1n,
        owner: "00".repeat(32),
        type: "00".repeat(32),
        intentHash: "01".repeat(32),
        outputNo: 0,
      },
      meta: { ctime: new Date(0), registeredForDustGeneration: false },
    },
  ]);
  const states = new Subject<FacadeState>();
  const subscribed = Promise.withResolvers<undefined>();
  vi.mocked(seedlib.initialiseWalletFacade).mockResolvedValueOnce(facade);
  vi.spyOn(facade, "start").mockResolvedValue(undefined);
  vi.spyOn(facade, "state").mockImplementation(() => {
    subscribed.resolve(undefined);
    return states;
  });
  const wallet = new SeedWallet(configuration, "07".repeat(32));
  const initialising = wallet.initialise();
  await subscribed.promise;
  states.next(state);
  await initialising;
  vi.spyOn(facade, "estimateRegistration").mockResolvedValue({
    fee: 1n,
    dustGenerationEstimations: [],
  });
  const registration = Promise.withResolvers<undefined>();
  const waiting = Promise.withResolvers<undefined>();
  vi.spyOn(facade, "waitForGeneratedDust").mockImplementation(() => {
    waiting.resolve(undefined);
    return registration.promise;
  });
  const register = vi.spyOn(facade, "registerNightUtxosForDustGeneration");
  const submit = vi.spyOn(facade, "submitTransaction");
  const pending = wallet.registerNightForDust(10000000000000000n);
  expect(wallet.registerNightForDust(10000000000000000n)).toBe(pending);
  await waiting.promise;
  await wallet.disconnect();
  registration.resolve(undefined);
  await expect(pending).rejects.toThrow("disconnected");
  expect(register).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  expect(states.observed).toBe(false);
});
