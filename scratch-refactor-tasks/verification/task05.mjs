import assert from "node:assert/strict";

import { loader } from "./load-source.mjs";

const load = loader();
const ledger = load("@midnightntwrk/ledger-v9");
const { HDWallet } = await import("@midnightntwrk/wallet-sdk-hd");
for (const length of Array.from({ length: 49 }, (_, index) => index + 16))
  assert.equal(HDWallet.fromSeed(new Uint8Array(length).fill(7)).type, "seedOk");
for (const length of [0, 15, 65])
  assert.equal(HDWallet.fromSeed(new Uint8Array(length)).type, "seedError");
const shieldedCore =
  await import("../../node_modules/@midnightntwrk/wallet-sdk-shielded/dist/v1/CoreWallet.js");
const shieldedSerialization =
  await import("../../node_modules/@midnightntwrk/wallet-sdk-shielded/dist/v1/Serialization.js");
const dustCore =
  await import("../../node_modules/@midnightntwrk/wallet-sdk-dust-wallet/dist/v1/CoreWallet.js");
const dustSerialization =
  await import("../../node_modules/@midnightntwrk/wallet-sdk-dust-wallet/dist/v1/Serialization.js");
const seed = new Uint8Array(32).fill(7);
const shielded = shieldedCore.CoreWallet.initEmpty(
  ledger.ZswapSecretKeys.fromSeed(seed),
  "undeployed",
);
const dust = dustCore.CoreWallet.initEmpty(
  ledger.LedgerParameters.initialParameters().dust,
  ledger.DustSecretKey.fromSeed(seed),
  "undeployed",
);
for (const [name, core, capability] of [
  ["shielded", shielded, shieldedSerialization.makeDefaultV1SerializationCapability()],
  ["dust", dust, dustSerialization.makeDefaultV1SerializationCapability()],
]) {
  const snapshot = JSON.parse(capability.serialize(core));
  assert.ok(snapshot.state.length > 0);
  console.log(
    `PASS actual ${name} snapshot fields: ${Object.keys(snapshot).join(", ")}. Opaque ledger state present, persistence omitted.`,
  );
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const config = { networkId: "undeployed" };
function walletFixture() {
  const construction = deferred();
  const start = deferred();
  const counts = { stops: 0, starts: 0, subscriptions: 0, unsubscribes: 0 };
  let observer;
  const facade = {
    start: () => {
      counts.starts++;
      return start.promise;
    },
    stop: async () => {
      counts.stops++;
    },
    state: () => ({
      subscribe: (value) => {
        counts.subscriptions++;
        observer = value;
        return {
          unsubscribe: () => {
            counts.unsubscribes++;
          },
        };
      },
    }),
  };
  const fixture = loader({
    "@midnight-ntwrk/midnight-js/network-id": { setNetworkId: () => {} },
    "@midnightntwrk/wallet-sdk-address-format": {
      MidnightBech32m: { encode: () => "shielded-fixture" },
    },
    "../seedlib": {
      deriveAccountKeys: () => ({}),
      initialiseWalletFacade: () => construction.promise,
      createWalletAndMidnightProvider: () => ({
        getCoinPublicKey: () => "coin",
        getEncryptionPublicKey: () => "encryption",
      }),
    },
  });
  const { SeedWallet } = fixture("@/lib/midnight/wallet/SeedWallet");
  const wallet = new SeedWallet(config, "07".repeat(32));
  const progress = [];
  const promise = wallet.initialise((value) => progress.push(value));
  assert.equal(wallet.initialise(), promise);
  const result = promise.then(
    () => "connected",
    () => "rejected",
  );
  const state = (synced) => ({
    isSynced: synced,
    shielded: {
      address: {},
      progress: { isConnected: true, appliedIndex: 42n },
      state: {},
      balances: { token: 4n },
      capabilities: { coinsAndBalances: { getTotalBalances: () => ({ token: 9n }) } },
    },
    unshielded: { balances: { night: 3n } },
    dust: { balance: () => 2n },
  });
  return {
    wallet,
    promise,
    result,
    progress,
    counts,
    construction,
    start,
    facade,
    emit: (synced) => observer.next(state(synced)),
    error: () => observer.error(new Error("fixture sync failure")),
  };
}
const phases = ["construction", "start", "sync", "connected"];
assert.ok(phases.length > 0);
for (const phase of phases) {
  const f = walletFixture();
  if (phase !== "construction") {
    f.construction.resolve(f.facade);
    await tick();
  }
  if (phase === "sync" || phase === "connected") {
    f.start.resolve();
    await tick();
  }
  if (phase === "connected") {
    f.emit(false);
    f.emit(true);
    assert.equal(await f.result, "connected");
    assert.equal(f.wallet.shieldedAddress, "shielded-fixture");
    assert.equal((await f.wallet.getShieldedBalances()).token, 9n);
    assert.equal((await f.wallet.getUnshieldedBalances()).night, 3n);
    assert.equal(await f.wallet.getDustBalance(), 2n);
  }
  const before = f.progress.length;
  const disconnect = f.wallet.disconnect();
  if (phase !== "connected") assert.equal(await f.result, "rejected");
  f.construction.resolve(f.facade);
  f.start.resolve();
  await disconnect;
  if (phase === "sync" || phase === "connected") f.emit(true);
  assert.equal(f.progress.length, before);
  assert.equal(f.counts.stops, 1);
  assert.equal(f.counts.unsubscribes, phase === "sync" || phase === "connected" ? 1 : 0);
  await f.wallet.disconnect();
  assert.equal(f.counts.stops, 1);
  await assert.rejects(f.wallet.getShieldedBalances(), /disconnected/);
  console.log(`PASS disconnect during ${phase}: ${JSON.stringify(f.counts)}, late state ignored`);
}
for (const phase of ["construction", "start", "sync"]) {
  const f = walletFixture();
  if (phase !== "construction") {
    f.construction.resolve(f.facade);
    await tick();
  }
  if (phase === "sync") {
    f.start.resolve();
    await tick();
  }
  const disconnect = f.wallet.disconnect();
  if (phase === "construction") f.construction.reject(new Error("late construction failure"));
  if (phase === "start") f.start.reject(new Error("late start failure"));
  if (phase === "sync") f.error();
  assert.equal(await f.result, "rejected");
  await disconnect;
  assert.equal(f.counts.stops, phase === "construction" ? 0 : 1);
  assert.equal(f.counts.unsubscribes, phase === "sync" ? 1 : 0);
  console.log(`PASS late rejection during ${phase}: ${JSON.stringify(f.counts)}`);
}

const react = load("react");
function contextFixture(WalletClass) {
  const states = [];
  const refs = [];
  const effects = [];
  const builds = [];
  let stateIndex = 0,
    refIndex = 0,
    deletions = 0;
  class FixtureWallet {
    constructor(_config, seed) {
      this.seed = seed;
      this.ready = deferred();
      this.stops = 0;
      builds.push(this);
    }
    initialise(progress) {
      this.progress = progress;
      return this.ready.promise;
    }
    disconnect() {
      this.stops++;
      return Promise.resolve();
    }
  }
  const contextLoad = loader(
    {
      react: {
        ...react,
        useRef: (initial) => (refs[refIndex++] ??= { current: initial }),
        useState: (initial) => {
          const index = stateIndex++;
          if (!(index in states)) states[index] = initial;
          return [
            states[index],
            (value) => {
              states[index] = typeof value === "function" ? value(states[index]) : value;
            },
          ];
        },
        useEffect: (effect) => {
          effects.push(effect);
        },
      },
      "@/lib/config/midnight": { getMidnightChainConfig: () => config },
      "@/lib/midnight/wallet/SeedWallet": { SeedWallet: WalletClass ?? FixtureWallet },
    },
    {
      indexedDB: {
        deleteDatabase: (name) => {
          assert.equal(name, "midnight-wallet-cache");
          deletions++;
          return {};
        },
      },
    },
  );
  const { MidnightWalletProvider } = contextLoad("@/providers/midnight-wallet-context");
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    return MidnightWalletProvider({ children: null }).props.value;
  };
  return { render, states, builds, mount: () => effects[0](), deletions: () => deletions };
}
for (const settlement of ["resolve", "reject"]) {
  const f = contextFixture();
  let ctx = f.render();
  assert.equal(ctx.wallet, null);
  assert.equal(ctx.connecting, false);
  const cleanup = f.mount();
  assert.equal(f.deletions(), 1);
  assert.equal(f.builds.length, 0);
  const initialGeneration = ctx.getGeneration();
  const first = ctx.installSeedWallet("07".repeat(32));
  assert.ok(ctx.getGeneration() > initialGeneration);
  const firstGeneration = ctx.getGeneration();
  const firstResult = first.catch(() => null);
  assert.equal(ctx.installSeedWallet("0x" + "07".repeat(32)), first);
  await tick();
  const second = ctx.installSeedWallet("08".repeat(32));
  assert.ok(ctx.getGeneration() > firstGeneration);
  await tick();
  assert.equal(f.builds[0].stops, 1);
  f.builds[1].ready.resolve();
  const wallet = await second;
  f.builds[0].ready[settlement](new Error("late fixture failure"));
  await firstResult;
  ctx = f.render();
  assert.equal(ctx.wallet, wallet);
  assert.equal(ctx.connecting, false);
  f.builds[0].progress("obsolete");
  assert.notEqual(f.render().syncStatus, "obsolete");
  const rebuild = ctx.rebuild();
  await tick();
  assert.equal(f.builds[1].stops, 1);
  assert.equal(f.builds[2].seed, "08".repeat(32));
  const recoveryGeneration = ctx.getGeneration();
  ctx.disconnect();
  assert.ok(ctx.getGeneration() > recoveryGeneration);
  f.builds[2].ready.resolve();
  await assert.rejects(rebuild, /superseded/);
  assert.equal(f.render().wallet, null);
  await assert.rejects(f.render().rebuild(), /Connect/);
  cleanup();
  const refreshed = contextFixture();
  const fresh = refreshed.render();
  assert.equal(fresh.wallet, null);
  assert.equal(refreshed.builds.length, 0);
  await assert.rejects(fresh.installSeedWallet("not a seed"), /hexadecimal/);
  assert.equal(refreshed.builds.length, 0);
  console.log(
    `PASS context replacement with late ${settlement}, same-seed deduplication, rebuild, disconnect, clean refresh and invalid input`,
  );
}

{
  const { Effect, Context } = await import("effect");
  const tag = Context.GenericTag("submission-fixture");
  const apis = [],
    submissions = [],
    timeouts = new Set();
  let mode = "success";
  class Provider {
    async connect() {}
  }
  class Api {
    constructor() {
      this.closes = 0;
      this.ready = deferred();
      this.isReadyOrError = mode === "handshake" ? this.ready.promise : Promise.resolve(this);
      apis.push(this);
    }
    async disconnect() {
      this.closes++;
    }
  }
  const fixture = loader(
    {
      effect: { Effect },
      "@polkadot/api": { ApiPromise: Api, WsProvider: Provider },
      "@midnightntwrk/wallet-sdk-node-client/effect": {
        makeConfig: (value) => value,
        PolkadotNodeClient: class {
          constructor(config, api) {
            this.api = api;
          }
        },
        NodeClient: {
          NodeClient: tag,
          sendMidnightTransactionAndWait: (tx, status) =>
            Effect.flatMap(tag, (client) => {
              submissions.push([tx, status, client.api]);
              assert.equal(client.api.closes, 0);
              return mode === "failure"
                ? Effect.fail(new Error("fixture submission rejection"))
                : mode === "submission"
                  ? Effect.never
                  : Effect.succeed(status);
            }),
        },
      },
      "@midnightntwrk/wallet-sdk-hd": {},
      "@midnightntwrk/wallet-sdk-facade": { WalletFacade: { init: async (input) => input } },
      "@midnightntwrk/wallet-sdk-shielded": {},
      "@midnightntwrk/wallet-sdk-dust-wallet": {},
      "@midnightntwrk/wallet-sdk-unshielded-wallet": {},
      "@midnightntwrk/wallet-sdk-abstractions": {
        InMemoryTransactionHistoryStorage: class {},
        SerializedTransaction: { from: (value) => value },
      },
      "@midnight-ntwrk/midnight-js/types": {},
      "@midnight-ntwrk/midnight-js-http-client-proof-provider": {},
    },
    {
      AbortController,
      setTimeout: (fn) => {
        timeouts.add(fn);
        return fn;
      },
      clearTimeout: (fn) => timeouts.delete(fn),
    },
  );
  const { initialiseWalletFacade } = fixture("@/lib/midnight/seedlib");
  const input = await initialiseWalletFacade(
    {},
    { ...config, nodeUrl: "http://localhost:9944", proofServerUrl: "http://localhost:6300" },
  );
  const unused = input.submissionService(input.configuration);
  assert.equal(apis.length, 0);
  await unused.close();
  await unused.close();
  await assert.rejects(unused.submitTransaction({}), /disconnected/);
  assert.equal(apis.length, 0);
  const used = input.submissionService(input.configuration);
  const statuses = [undefined, "Submitted", "InBlock", "Finalized"];
  assert.ok(statuses.length > 0);
  await Promise.all(statuses.map((status) => used.submitTransaction("transaction", status)));
  assert.equal(apis.length, 4);
  assert.deepEqual(
    submissions.map((args) => args[1]),
    ["InBlock", ...statuses.slice(1)],
  );
  assert.ok(apis.every((api) => api.closes === 1));
  mode = "failure";
  await assert.rejects(used.submitTransaction("transaction"), /submission rejection/);
  assert.equal(apis.length, 5);
  assert.equal(submissions.length, 5);
  const close = used.close();
  assert.equal(used.close(), close);
  await close;
  await assert.rejects(used.submitTransaction("transaction"), /disconnected/);
  for (mode of ["handshake", "submission"]) {
    const service = input.submissionService(input.configuration);
    const result = service.submitTransaction("transaction");
    const rejected = assert.rejects(result);
    await tick();
    const api = apis.at(-1),
      before = submissions.length;
    await service.close();
    await rejected;
    api.ready.resolve(api);
    await tick();
    assert.equal(api.closes, 1);
    assert.equal(submissions.length, before);
  }
  mode = "handshake";
  const timeoutService = input.submissionService(input.configuration);
  const timedOut = assert.rejects(
    timeoutService.submitTransaction("transaction"),
    /connection timed out/,
  );
  assert.equal(timeouts.size, 1);
  [...timeouts][0]();
  await timedOut;
  await timeoutService.close();
  assert.equal(timeouts.size, 0);
  assert.ok(apis.every((api) => api.closes === 1));
  console.log(
    "PASS lazy fresh submission transports, all statuses, concurrent ownership, failure without retry, pending handshake/submission cancellation, late-ready exclusion and idempotent close",
  );
}

for (const phase of ["construction", "start", "sync"]) {
  const resources = [];
  class OwnedFixtureWallet {
    constructor() {
      const resource = walletFixture();
      resources.push(resource);
      return resource.wallet;
    }
  }
  const context = contextFixture(OwnedFixtureWallet);
  const ctx = context.render();
  const first = ctx.installSeedWallet("07".repeat(32)).catch(() => null);
  await tick();
  const old = resources[0];
  if (phase !== "construction") {
    old.construction.resolve(old.facade);
    await tick();
  }
  if (phase === "sync") {
    old.start.resolve();
    await tick();
  }
  const second = ctx.installSeedWallet("08".repeat(32));
  await tick();
  const current = resources[1];
  current.construction.resolve(current.facade);
  await tick();
  current.start.resolve();
  await tick();
  current.emit(true);
  const wallet = await second;
  old.construction.resolve(old.facade);
  old.start.resolve();
  await first;
  await old.wallet.disconnect();
  assert.equal(context.render().wallet, wallet);
  assert.equal(old.counts.stops, 1);
  assert.equal(old.counts.unsubscribes, phase === "sync" ? 1 : 0);
  ctx.disconnect();
  await current.wallet.disconnect();
  assert.equal(current.counts.stops, 1);
  assert.equal(current.counts.unsubscribes, 1);
  console.log(
    `PASS replacement during ${phase} with actual SeedWallet: ${JSON.stringify(old.counts)}, latest wallet alone published`,
  );
}
