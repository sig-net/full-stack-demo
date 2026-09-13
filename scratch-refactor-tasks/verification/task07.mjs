import assert from "node:assert/strict";
import fs from "node:fs";

import { loader as sourceLoader } from "./load-source.mjs";
import { runtimeStubs } from "./runtime-fixture.mjs";
const loader = (stubs = {}, globals) => sourceLoader({ ...runtimeStubs(), ...stubs }, globals);
const load = loader();
const react = load("react");
const query = load("@tanstack/react-query");
const { createVaultPrivateStateProvider } = load("@/lib/midnight/vault-private-state");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const turns = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const a = "06".repeat(32),
  b = "07".repeat(32);
export function hooks() {
  const states = [],
    refs = [],
    effects = [];
  let si = 0,
    ri = 0,
    ei = 0,
    pending = [];
  return {
    react: {
      ...react,
      useState(initial) {
        const i = si++;
        if (!(i in states)) states[i] = initial;
        return [
          states[i],
          (value) => {
            states[i] = typeof value === "function" ? value(states[i]) : value;
          },
        ];
      },
      useRef(initial) {
        return (refs[ri++] ??= { current: initial });
      },
      useEffectEvent(fn) {
        const ref = (refs[ri++] ??= { current: fn });
        ref.current = fn;
        return (...args) => ref.current(...args);
      },
      useLayoutEffect(fn, deps) {
        const i = ei++;
        if (!effects[i] || !deps || deps.some((v, j) => v !== effects[i].deps[j]))
          pending.push(() => {
            effects[i]?.cleanup?.();
            effects[i] = { deps: deps ?? [], cleanup: fn() };
          });
      },
      useEffect(fn, deps) {
        const i = ei++;
        if (!effects[i] || deps.some((v, j) => v !== effects[i].deps[j]))
          pending.push(() => {
            effects[i]?.cleanup?.();
            effects[i] = { deps, cleanup: fn() };
          });
      },
    },
    render(fn) {
      si = 0;
      ri = 0;
      ei = 0;
      const result = fn();
      const jobs = pending;
      pending = [];
      jobs.forEach((fn) => fn());
      return result;
    },
    cleanup() {
      effects.forEach((e) => e?.cleanup?.());
    },
  };
}
export function fixture(runtimeOverride) {
  const vh = hooks(),
    oh = hooks(),
    bh = hooks(),
    joins = [],
    resources = [],
    timers = new Set(),
    calls = [],
    history = [];
  const client = new query.QueryClient({
    defaultOptions: { queries: { retry: 3, gcTime: 600000, staleTime: 0 } },
  });
  let observer,
    unsubscribe,
    balanceObserver,
    balanceUnsubscribe,
    balanceValue,
    vaultValue,
    operationValue,
    pause = false,
    fail = false,
    balanceWait,
    fundingWait,
    recoveryWait,
    failConfig = false;
  let runOperation = async () => {};
  const walletA = {
      id: "same",
      shieldedAddress: "A",
      submitTx: async () => {
        calls.push("submitA");
        return "tx";
      },
    },
    walletB = {
      id: "same",
      shieldedAddress: "B",
      submitTx: async () => {
        calls.push("submitB");
        return "tx";
      },
    };
  const connection = {
    wallet: null,
    connecting: false,
    syncStatus: "",
    session: 0,
    getGeneration: () => connection.session,
    isCurrent: (wallet) => connection.wallet === wallet,
    disconnect() {
      connection.wallet = null;
      connection.session++;
    },
    rebuild() {
      connection.disconnect();
      recoveryWait = deferred();
      return recoveryWait.promise.then((wallet) => {
        connection.wallet = wallet;
        return wallet;
      });
    },
  };
  const flow = {
    kind: null,
    phase: "done",
    error: null,
    refunded: false,
    start(kind) {
      this.kind = kind;
      this.error = null;
      this.phase = "preparing";
    },
    fail(message) {
      this.error = message;
    },
    reset() {
      this.kind = null;
      this.error = null;
      this.phase = "done";
    },
  };
  const globals = {
    Promise,
    crypto: globalThis.crypto,
    window: { location: { origin: "https://fixture.invalid" } },
    setInterval: (fn) => {
      timers.add(fn);
      return fn;
    },
    clearInterval: (fn) => timers.delete(fn),
    fetch: async () => {
      calls.push("fund");
      return fundingWait ? fundingWait.promise : { ok: true };
    },
    console: { ...console, error() {} },
  };
  const providerStubs = {
    buildVaultProviders(wallet) {
      const resource = {
        privateStateProvider: createVaultPrivateStateProvider(),
        publicDataProvider: {
          dispose: async () => {
            resource.disposals++;
          },
        },
        proofProvider: {},
        walletProvider: wallet,
        midnightProvider: wallet,
        balancesSource: {},
        disposals: 0,
      };
      resources.push(resource);
      return resource;
    },
    async joinVault(providers, _address, secret) {
      const ready = deferred();
      joins.push({ providers, ready });
      if (pause) await ready.promise;
      if (fail) throw new Error("fixture " + a);
      await providers.privateStateProvider.set("erc20-vault", { secretKey: secret });
      return {
        callTx: {
          approveStata: async () => {
            calls.push("callTx");
            return providers.midnightProvider.submitTx();
          },
        },
      };
    },
  };
  const vaultStubs = {
    deriveIdentity: (secretKey) => ({ secretKey, pathHex: Buffer.from(secretKey).toString("hex") }),
    syncPathRendering: async () => "utf8",
    depositAddress: (env, identity) => {
      env.assertActive();
      return identity.pathHex;
    },
    vaultAddress: (env) => {
      env.assertActive();
      return "vault";
    },
    runDeposit: (...args) => runOperation(...args),
    runWithdraw: (...args) => runOperation(...args),
    runSwap: (...args) => runOperation(...args),
    runSupply: (...args) => runOperation(...args),
    runRedeem: (...args) => runOperation(...args),
  };
  const runtime = runtimeOverride ?? {
    applied: {
      midnight: {},
      evm: { chainId: 11155111, rpcUrl: "http://fixture.invalid" },
      environment: {
        get contractAddress() {
          if (failConfig) throw new Error("config");
          return "a";
        },
      },
    },
    requireServerHeaders: () => ({}),
    owner: { onInvalidate: () => () => {} },
  };
  runtime.owner.getSnapshot ??= () => ({ applied: runtime.applied });
  const common = {
    ...runtimeStubs(runtime),
    "./wallet-readiness-context": {
      useWalletReadiness: () => ({ ready: true, requireReady: async () => {} }),
    },
    "./midnight-wallet-context": { useMidnightConnection: () => connection },
    "@/lib/config/evm": { getEvmChainConfig: () => ({}) },
    "@/lib/config/midnight": { getMidnightChainConfig: () => ({}), getZkConfigOrigin: () => "" },
    "@/lib/midnight/env": {
      createVaultEnvironment: () => ({
        get contractAddress() {
          if (failConfig) throw new Error("config");
          return "a";
        },
      }),
    },
    "./vault-providers": providerStubs,
    "./vault": vaultStubs,
    "@/lib/midnight/flow": { flow },
    "@/lib/midnight/evm-stata": { AAVE_USDC: "0xa", STATA_USDC: "0xb" },
    "@/lib/constants/token-metadata": { MIDNIGHT_TOKENS: [], fetchErc20Decimals: async () => 6 },
    "@/hooks/use-midnight-progress": {
      useMidnightProgress: () => ({
        active: flow.kind !== null && flow.phase !== "done" && !flow.error,
      }),
    },
    "@/lib/midnight/tx-history": {
      midnightTxHistory: {
        update: (...args) => history.push(args),
        add: (...args) => history.push(args),
      },
    },
    "@/lib/midnight/vault": vaultStubs,
    "@/lib/midnight/vault-balances": {
      readBalances: () =>
        balanceWait?.promise ?? Promise.resolve({ perToken: {}, marker: "fresh" }),
    },
  };
  const vl = loader(
    {
      ...common,
      react: vh.react,
      "@tanstack/react-query": {
        ...query,
        useQueryClient: () => client,
        useQuery(options) {
          if (!observer) {
            observer = new query.QueryObserver(client, options);
            unsubscribe = observer.subscribe(() => {});
          } else observer.setOptions(options);
          return observer.getCurrentResult();
        },
      },
    },
    globals,
  );
  const ol = loader(
    {
      ...common,
      react: oh.react,
      "./vault-context": { useVault: () => vaultValue },
      "./vault-balances-context": { useVaultBalances: () => balanceValue },
    },
    globals,
  );
  const bl = loader(
    {
      ...common,
      react: bh.react,
      "./vault-context": { useVault: () => vaultValue },
      "@tanstack/react-query": {
        ...query,
        useQueryClient: () => client,
        useQuery(options) {
          if (!balanceObserver) {
            balanceObserver = new query.QueryObserver(client, options);
            balanceUnsubscribe = balanceObserver.subscribe(() => {});
          } else balanceObserver.setOptions(options);
          return balanceObserver.getCurrentResult();
        },
      },
    },
    globals,
  );
  const { VaultProvider } = vl("@/providers/vault-context");
  const { VaultOperationsProvider } = ol("@/providers/vault-operations-context");
  const { VaultBalancesProvider } = bl("@/providers/vault-balances-context");
  const render = () => {
    vaultValue = vh.render(() => VaultProvider({ children: null }).props.value);
    balanceValue = bh.render(() => VaultBalancesProvider({ children: null }).props.value);
    operationValue = oh.render(() => VaultOperationsProvider({ children: null }).props.value);
    return {
      vault: vaultValue,
      balances: balanceValue,
      operation: {
        ...operationValue,
        connected: !!vaultValue.binding,
        balances: balanceValue.balances,
        balancesLoading: balanceValue.loading,
        balancesError: balanceValue.error,
        refresh: balanceValue.refresh,
      },
    };
  };
  const flush = async () => {
    for (let i = 0; i < 8; i++) {
      render();
      await turns();
    }
    return render();
  };
  return {
    render,
    flush,
    connection,
    walletA,
    walletB,
    client,
    joins,
    resources,
    calls,
    history,
    flow,
    timers,
    pause: () => (pause = true),
    resume: () => (pause = false),
    fail: () => (fail = true),
    succeed: () => (fail = false),
    configFailure: () => (failConfig = true),
    delayBalance: () => (balanceWait = deferred()),
    delayFunding: () => (fundingWait = deferred()),
    run: (fn) => (runOperation = fn),
    recover: (wallet) => recoveryWait.resolve(wallet),
    rejectRecovery: () => recoveryWait.reject(new Error("rebuild failed")),
    pollInterval: () => balanceObserver.options.refetchInterval,
    refetch: () => observer.refetch(),
    cleanup() {
      vh.cleanup();
      oh.cleanup();
      bh.cleanup();
      unsubscribe?.();
      observer?.destroy();
      balanceUnsubscribe?.();
      balanceObserver?.destroy();
      client.clear();
    },
  };
}
{
  const f = fixture();
  assert.equal(f.render().vault.status, "disconnected");
  for (const input of ["", "zz".repeat(32), "01"])
    assert.throws(() => f.render().vault.setIdentitySecret(input), /32-byte/);
  f.render().vault.setIdentitySecret(" 0X" + a.toUpperCase() + " ");
  await f.flush();
  assert.equal(f.joins.length, 0);
  f.connection.wallet = f.walletA;
  await f.flush();
  assert.equal(f.render().vault.status, "ready");
  const first = f.render().vault.binding;
  assert.equal(first.depositAddress, a);
  assert.equal(f.resources.length, 1);
  assert.equal(f.render().operation.connected, true);
  const keys = JSON.stringify(
    f.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey),
  );
  assert.ok(!keys.includes(a));
  assert.ok(!keys.includes(b));
  f.connection.wallet = f.walletB;
  assert.throws(first.assertActive, /superseded/);
  assert.equal(f.render().vault.binding, null);
  await f.flush();
  assert.equal(f.render().vault.binding.depositAddress, a);
  assert.notEqual(f.render().vault.binding, first);
  assert.equal(f.resources[0].disposals, 1);
  const wait = f.delayBalance();
  const refresh = f
    .render()
    .operation.refresh()
    .catch(() => {});
  await turns();
  f.render().vault.setIdentitySecret(b);
  assert.equal(f.render().operation.balances, null);
  assert.equal(f.render().operation.connected, false);
  wait.resolve({ perToken: {}, marker: "obsolete" });
  await refresh;
  await f.flush();
  assert.equal(f.render().vault.binding.depositAddress, b);
  f.render().vault.clearIdentity();
  await f.flush();
  assert.equal(f.render().vault.status, "missing-identity");
  assert.equal(f.connection.wallet, f.walletB);
  assert.equal(
    f.client
      .getQueryCache()
      .getAll()
      .filter((q) => q.queryKey[1] !== "disabled").length,
    0,
  );
  assert.equal(f.timers.size, 0);
  f.cleanup();
  const fresh = fixture();
  assert.equal(fresh.render().vault.identitySecret, "");
  fresh.cleanup();
  console.log(
    "PASS real QueryObserver readiness, independent identity, same-ID instance replacement, synchronous stale rejection, late balance masking, query eviction and clean refresh",
  );
}
for (const change of ["identity", "disconnect", "wallet"]) {
  const f = fixture();
  f.pause();
  f.connection.wallet = f.walletA;
  f.render().vault.setIdentitySecret(a);
  await f.flush();
  assert.equal(f.joins.length, 1);
  if (change === "identity") f.render().vault.setIdentitySecret(b);
  if (change === "disconnect") f.render().vault.disconnect();
  if (change === "wallet") f.connection.wallet = f.walletB;
  await f.flush();
  assert.throws(
    () =>
      f.joins[0].providers.privateStateProvider.set("erc20-vault", {
        secretKey: new Uint8Array(32),
      }),
    /superseded/,
  );
  f.joins[0].ready.resolve();
  await f.flush();
  assert.equal(f.render().vault.binding, null);
  assert.equal(f.resources[0].disposals, 1);
  if (change !== "disconnect") {
    f.joins[1].ready.resolve();
    await f.flush();
    assert.equal(f.render().vault.status, "ready");
  }
  assert.ok(
    f.client
      .getQueryCache()
      .getAll()
      .every((q) => q.state.error?.message.includes(a) !== true),
  );
  f.cleanup();
  console.log(
    `PASS pending lookup ${change}, disposed late SDK writes, no stale publication and resource teardown`,
  );
}
{
  const f = fixture();
  f.fail();
  f.connection.wallet = f.walletA;
  f.render().vault.setIdentitySecret(a);
  await f.flush();
  assert.equal(f.render().vault.status, "error");
  assert.ok(f.render().vault.error);
  assert.ok(!f.render().vault.error.includes(a));
  assert.equal(f.connection.wallet, f.walletA);
  assert.equal(f.resources[0].disposals, 1);
  f.succeed();
  f.render().vault.retry();
  await f.flush();
  assert.equal(f.render().vault.status, "ready");
  assert.equal(f.resources.length, 2);
  const refetch = f.refetch();
  await f.flush();
  await refetch;
  assert.equal(f.render().vault.status, "error");
  assert.equal(f.render().vault.binding, null);
  assert.equal(f.resources[1].disposals, 1);
  f.render().vault.retry();
  await f.flush();
  assert.equal(f.render().vault.status, "ready");
  f.cleanup();
  console.log(
    "PASS independent lookup error, sanitised query errors, explicit retry and manual refetch teardown with fresh-session retry",
  );
}
{
  const f = fixture();
  f.configFailure();
  f.connection.wallet = f.walletA;
  f.render().vault.setIdentitySecret(a);
  await f.flush();
  assert.equal(f.render().vault.status, "missing-deployment");
  assert.equal(f.resources.length, 0);
  f.cleanup();
  console.log("PASS missing deployment before SDK acquisition");
}
for (const kind of ["deposit", "withdraw", "swap", "supply", "redeem"]) {
  const f = fixture();
  f.connection.wallet = f.walletA;
  f.render().vault.setIdentitySecret(a);
  await f.flush();
  let operations = 0;
  f.run(async () => operations++);
  const wait = f.delayFunding();
  const args =
    kind === "supply" || kind === "redeem"
      ? [1n]
      : kind === "swap"
        ? ["0xa", "0xb", 1n]
        : ["0xa", 1n];
  const operation = f
    .render()
    .operation[kind](...args)
    .catch(() => {});
  await turns();
  assert.ok(f.calls.includes("fund"));
  f.render().vault.setIdentitySecret(b);
  await f.flush();
  f.flow.start("swap");
  wait.resolve({ ok: true });
  await operation;
  assert.equal(operations, 0);
  assert.equal(f.flow.error, null);
  f.cleanup();
  console.log(`PASS ${kind} pending funding cannot use replacement binding or fail a newer flow`);
}
for (const change of ["none", "identity", "clear", "wallet", "disconnect"]) {
  const f = fixture();
  f.connection.wallet = f.walletA;
  f.render().vault.setIdentitySecret(a);
  await f.flush();
  let operations = 0;
  f.run(async () => {
    if (++operations === 1) throw new Error("Custom error: 196");
  });
  const operation = f
    .render()
    .operation.deposit("0x" + "00".repeat(20), 1n)
    .catch(() => {});
  await f.flush();
  assert.equal(f.render().vault.binding, null);
  if (change === "identity") f.render().vault.setIdentitySecret(b);
  if (change === "clear") f.render().vault.clearIdentity();
  if (change === "wallet") f.connection.wallet = f.walletB;
  if (change === "disconnect") f.render().vault.disconnect();
  await f.flush();
  if (change === "wallet" || change === "disconnect") f.rejectRecovery();
  else f.recover(f.walletB);
  await f.flush();
  await operation;
  await f.flush();
  assert.equal(operations, change === "none" ? 2 : 1);
  assert.equal(
    f.render().vault.status,
    change === "clear" ? "missing-identity" : change === "disconnect" ? "disconnected" : "ready",
  );
  if (change === "identity") assert.equal(f.render().vault.identitySecret, b);
  f.cleanup();
  console.log(`PASS recovery ${change} uses shared query rebinding and rejects obsolete retry`);
}
{
  const f = fixture();
  f.connection.wallet = f.walletA;
  f.render().vault.setIdentitySecret(a);
  await f.flush();
  const binding = f.render().vault.binding;
  await binding.contract.callTx.approveStata();
  assert.equal(f.calls.filter((x) => x === "submitA").length, 1);
  f.connection.wallet = f.walletB;
  assert.throws(() => binding.contract.callTx.approveStata(), /superseded/);
  assert.throws(() => binding.providers.midnightProvider.submitTx(), /superseded/);
  f.cleanup();
  console.log(
    "PASS captured typed contract and SDK submission guards reject stale wallet before React rerender",
  );
}
{
  let rejectA,
    reads = 0;
  const providers = [];
  class Zk {
    constructor() {
      providers.push(this);
    }
    getProverKey(circuit) {
      reads++;
      return circuit === "A"
        ? new Promise((_resolve, reject) => (rejectA = reject))
        : Promise.resolve(new Uint8Array([1]));
    }
  }
  const f = loader(
    {
      "@midnight-ntwrk/midnight-js/contracts": {},
      "@midnight-ntwrk/compact-js/effect/CompiledContract": {},
      "@midnight-ntwrk/midnight-js-fetch-zk-config-provider": { FetchZkConfigProvider: Zk },
      "@midnight-ntwrk/midnight-js-indexer-public-data-provider": {
        indexerPublicDataProvider: () => ({}),
      },
      "./seedlib": { createCrossContractProofServerProvider: () => ({}) },
    },
    { window: {}, Promise },
  );
  const resource = f("@/lib/midnight/vault-providers").buildVaultProviders(
    { transactions: {} },
    {},
    "https://zk.invalid",
  );
  const first = resource.zkConfigProvider.getProverKey("A");
  const failed = assert.rejects(first, /late/);
  const second = resource.zkConfigProvider.getProverKey("B");
  rejectA(new Error("late"));
  await failed;
  assert.equal(resource.zkConfigProvider.getProverKey("B"), second);
  await second;
  assert.equal(reads, 2);
  assert.equal(providers.length, 2);
  console.log(
    "PASS late circuit A rejection preserves newer circuit B prover-key promise and bounded cache",
  );
}
{
  const contract = await import("@sig-net/midnight-examples-erc20-vault-contract");
  const runtime = await import("@midnight-ntwrk/compact-runtime");
  const state = await new contract.Contract(contract.witnesses).initialState(
    runtime.createConstructorContext(
      contract.createVaultPrivateState(new Uint8Array(32)),
      "00".repeat(32),
    ),
    new Uint8Array(32),
    { bytes: new Uint8Array(32) },
  );
  const actualLedger = contract.ledger(state.currentContractState.data);
  assert.equal(actualLedger.initialised, 0n);
  assert.equal("initialized" in actualLedger, false);
  const { secp256k1 } = load("@noble/curves/secp256k1");
  const env = {
    contractAddress: "12".repeat(32),
    signetContractAddress: "34".repeat(32),
    mpcSecpPub:
      "0x" + Buffer.from(secp256k1.getPublicKey(new Uint8Array(32).fill(1))).toString("hex"),
    evmRpcUrl: "fixture",
    pathRendering: "utf8",
    assertActive() {},
  };
  let submitted = 0;
  const f = loader(
    {
      ethers: {
        ...load("ethers"),
        JsonRpcProvider: class {
          getTransactionCount() {
            return 0;
          }
        },
      },
      "@sig-net/midnight-examples-erc20-vault-contract": {
        ...contract,
        ledger: (data) => ({ ...contract.ledger(data), initialised: 1n }),
      },
    },
    { TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, crypto: globalThis.crypto, Promise },
  );
  const vault = f("@/lib/midnight/vault");
  await assert.rejects(
    vault.runDeposit(
      { publicDataProvider: { queryContractState: async () => state.currentContractState } },
      {
        callTx: {
          startDeposit: async () => {
            submitted++;
            throw new Error("fixture reached submission");
          },
        },
      },
      env,
      vault.deriveIdentity(new Uint8Array(32)),
      "00".repeat(20),
      1n,
      () => {},
    ),
    /fixture reached submission/,
  );
  assert.equal(submitted, 1);
  const hexEnv = { ...env, pathRendering: "hex" };
  const identity = vault.deriveIdentity(new Uint8Array(32).fill(3));
  const utf8Address = vault.depositAddress(env, identity),
    hexAddress = vault.depositAddress(hexEnv, identity);
  assert.notEqual(utf8Address, hexAddress);
  assert.equal(vault.depositAddress(env, identity), utf8Address);
  console.log(
    "PASS actual installed initialised ledger shape reaches representative deposit submission and path rendering remains session-local",
  );
}
{
  const vm = await import("node:vm");
  const ts = load("typescript");
  let active = true,
    broadcasts = 0;
  const receipt = deferred();
  const f = loader(
    {
      ethers: {
        ...load("ethers"),
        JsonRpcProvider: class {
          getTransactionReceipt() {
            return receipt.promise;
          }
          broadcastTransaction() {
            broadcasts++;
            return Promise.resolve();
          }
        },
      },
    },
    { TextDecoder, TextEncoder, crypto: globalThis.crypto },
  );
  const file = process.cwd() + "/src/lib/midnight/vault.ts";
  const source = fs.readFileSync(file, "utf8");
  const output = ts.transpileModule(source + "\nexport { broadcastEvm };", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(`(function(require,exports){${output}\n})`, {
    Promise,
    console,
    crypto: globalThis.crypto,
    TextDecoder,
    TextEncoder,
    setTimeout: (fn) => {
      queueMicrotask(fn);
      return 0;
    },
    clearTimeout,
  })((name) => f(name, file), exports);
  const result = exports.broadcastEvm(
    {
      evmRpcUrl: "fixture",
      assertActive() {
        if (!active) throw new Error("Vault session superseded.");
      },
    },
    { hash: "fixture", serialized: "fixture" },
  );
  active = false;
  receipt.resolve(null);
  await assert.rejects(result, /superseded/);
  assert.equal(broadcasts, 0);
  console.log(
    "PASS delayed EVM receipt/MPC continuation cannot broadcast after session invalidation",
  );
}
{
  const paths = [
    "src/providers/vault-context.tsx",
    "src/lib/midnight/vault-session.ts",
    "src/lib/midnight/vault-providers.ts",
  ];
  assert.ok(paths.length > 0);
  for (const path of paths) {
    const source = fs.readFileSync(path, "utf8");
    assert.ok(source.length > 0);
    assert.doesNotMatch(source, /\bany\b|localStorage|sessionStorage|indexedDB|document\.cookie/);
  }
  const source = fs.readFileSync("src/lib/midnight/vault.ts", "utf8");
  assert.ok(source.length > 0);
  assert.doesNotMatch(source, /let pathRendering|before\.initialized/);
  console.log(
    "PASS non-empty typed loading, memory-only ownership and deployment-rendering source guards",
  );
}
{
  const f = fixture();
  const wait = f.delayBalance();
  f.connection.wallet = f.walletA;
  f.render().vault.setIdentitySecret(a);
  await f.flush();
  assert.equal(f.render().vault.status, "ready");
  assert.equal(f.render().operation.balancesLoading, true);
  wait.reject(new Error("aggregate read failure"));
  await f.flush();
  assert.equal(f.render().vault.status, "ready");
  assert.equal(f.render().operation.balancesError, "Balance refresh failed.");
  assert.equal(f.render().operation.balancesLoading, false);
  f.cleanup();
  console.log("PASS aggregate balance rejection is independent of ready wallet and vault binding");
}
{
  const f = fixture();
  f.connection.wallet = f.walletA;
  f.render().vault.setIdentitySecret(a);
  await f.flush();
  let calls = 0;
  f.run(async () => {
    if (++calls === 1) throw new Error("Custom error: 196");
    throw new Error("recovered operation failure");
  });
  const operation = f
    .render()
    .operation.deposit("0x" + "00".repeat(20), 1n)
    .catch(() => {});
  await f.flush();
  f.recover(f.walletB);
  await f.flush();
  await operation;
  assert.equal(f.flow.error, "recovered operation failure");
  f.cleanup();
  console.log("PASS recovered operation failure reaches the current flow");
}
