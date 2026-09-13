import assert from "node:assert/strict";
import fs from "node:fs";

import { loader as sourceLoader } from "./load-source.mjs";
import { runtimeStubs } from "./runtime-fixture.mjs";
const loader = (stubs = {}, globals) => sourceLoader({ ...runtimeStubs(), ...stubs }, globals);
import { createRequire } from "node:module";

import { fixture, hooks } from "./task07.mjs";
const load = loader();
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const turns = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const secret = "09".repeat(32);
const connected = async () => {
  const f = fixture();
  f.connection.wallet = f.walletA;
  f.render().vault.setIdentitySecret(secret);
  await f.flush();
  return f;
};
for (const kind of ["deposit", "withdraw", "swap", "supply", "redeem"]) {
  const f = await connected();
  const wait = deferred();
  let runs = 0;
  f.run(async (...args) => {
    runs++;
    (kind === "deposit" ? args[7] : args.at(-1))("record-" + kind, "0xfixture");
    await wait.promise;
    f.flow.phase = "done";
    return 12n;
  });
  const args =
    kind === "supply" || kind === "redeem"
      ? [10n]
      : kind === "swap"
        ? ["0xa", "0xb", 10n]
        : ["0xa", 10n];
  const first = f.render().operation[kind](...args);
  await assert.rejects(f.render().operation.deposit("0xa", 1n), /already in progress/);
  await turns();
  assert.equal(runs, 1);
  assert.equal(f.render().operation.busy, true);
  assert.equal(f.pollInterval(), false);
  wait.resolve();
  const result = await first;
  assert.equal(result.refunded, false);
  assert.equal(f.render().operation.busy, false);
  assert.equal(f.pollInterval(), 5000);
  assert.ok(
    f.history.some((entry) => entry[0] === "record-" + kind && entry[1].status === "completed"),
  );
  f.cleanup();
  console.log(
    `PASS ${kind} synchronous shared lock, exact history terminal and QueryObserver polling option suspension/resumption`,
  );
}
for (const kind of ["withdraw", "swap", "supply", "redeem"]) {
  const f = await connected();
  f.run(async (...args) => {
    args.at(-1)("refund-" + kind, "0xrefund");
    f.flow.phase = "done";
    f.flow.refunded = true;
    return null;
  });
  const args =
    kind === "supply" || kind === "redeem"
      ? [10n]
      : kind === "swap"
        ? ["0xa", "0xb", 10n]
        : ["0xa", 10n];
  const result = await f.render().operation[kind](...args);
  assert.equal(result.refunded, true);
  assert.ok(
    f.history.some((entry) => entry[0] === "refund-" + kind && entry[1].status === "refunded"),
  );
  assert.equal(f.flow.error, null);
  f.cleanup();
  console.log(`PASS ${kind} refund result, history and progress retain refunded terminal`);
}
{
  const f = await connected();
  const refresh = f.delayBalance();
  f.run(async (...args) => {
    args[7]("settled");
    f.flow.phase = "done";
  });
  const result = await f.render().operation.deposit("0xa", 1n);
  assert.equal(result.refunded, false);
  assert.equal(f.render().operation.busy, false);
  assert.equal(f.flow.error, null);
  refresh.reject(new Error("post-settlement read failed"));
  await f.flush();
  assert.equal(f.flow.error, null);
  assert.ok(f.history.some((entry) => entry[0] === "settled" && entry[1].status === "completed"));
  assert.equal(f.render().balances.error, "Balance refresh failed.");
  f.cleanup();
  console.log(
    "PASS settled deposit resolves before delayed refresh and remains completed after refresh failure",
  );
}
{
  const f = await connected();
  f.run(async (...args) => {
    args[7]("failed");
    throw new Error("fixture proof rejected");
  });
  await assert.rejects(f.render().operation.deposit("0xa", 1n), /fixture proof rejected/);
  assert.equal(f.render().operation.busy, false);
  assert.equal(f.flow.error, "fixture proof rejected");
  assert.ok(f.history.some((entry) => entry[0] === "failed" && entry[1].status === "failed"));
  f.run(async () => {
    f.flow.phase = "done";
  });
  await f.render().operation.deposit("0xa", 1n);
  assert.equal(f.flow.error, null);
  f.cleanup();
  console.log(
    "PASS failed proof reports history/progress and releases ownership for deliberate retry",
  );
}
for (const failure of ["dust", "unshielded", "shielded", "deposit", "pool", "decimals"]) {
  const fail = (name) => (name === failure ? Promise.reject(new Error(name)) : null);
  const reader = loader({
    "./vault": {
      vaultTokenType: () => "coin",
      erc20Balance: async (_rpc, _token, address) => {
        if (address === failure) throw new Error(address);
        return 9n;
      },
    },
    "@/lib/constants/token-metadata": {
      fetchErc20Decimals: async () => {
        if (failure === "decimals") throw new Error("decimals");
        return 8;
      },
    },
  })("@/lib/midnight/vault-balances").readBalances;
  const result = await reader(
    {
      balancesSource: {
        dust: () => fail("dust") ?? Promise.resolve(3n),
        unshielded: () => fail("unshielded") ?? Promise.resolve({ night: 4n }),
        shielded: () => fail("shielded") ?? Promise.resolve({ coin: 5n }),
      },
    },
    { contractAddress: "vault", evmRpcUrl: "http://fixture.invalid" },
    ["TOKEN"],
    "deposit",
    "pool",
  );
  const token = result.perToken.token;
  assert.equal(result.dust, failure === "dust" ? null : 3n);
  assert.equal(result.night, failure === "unshielded" ? null : 4n);
  assert.equal(token.vaultUnits, failure === "shielded" ? null : 5n);
  assert.equal(token.depositUnits, failure === "deposit" ? null : 9n);
  assert.equal(token.vaultPoolUnits, failure === "pool" ? null : 9n);
  assert.equal(token.decimals, failure === "decimals" ? null : 8);
  console.log(
    `PASS partial ${failure} failure preserves independent successful values without fabricated zero/decimals`,
  );
}
{
  const { parseTokenAmount } = load("@/lib/utils/token-amount");
  assert.equal(parseTokenAmount("1.12345678", 8), 112345678n);
  for (const value of ["1.123456789", "0", "-1", "1e3"])
    assert.throws(() => parseTokenAmount(value, 8));
  let shares, rpc;
  const helpers = loader({
    ethers: {
      Contract: class {
        getFunction() {
          return async (units) => {
            shares = units;
            return 1250000n;
          };
        }
      },
    },
    "./vault": { evmProvider: () => ({}) },
    "@/lib/config/evm": { createEvmChainConfig: (rpcUrl) => ({ rpcUrl, chainId: 11155111 }) },
    "@/lib/constants/token-metadata": {
      fetchErc20Decimals: async (address, config) => {
        rpc = config.rpcUrl;
        return address.toLowerCase().startsWith("0x8a") ? 8 : 6;
      },
    },
  })("@/lib/midnight/evm-stata");
  assert.equal(await helpers.stataAssetsPerShare("supplied-rpc"), 1.25);
  assert.equal(shares, 100000000n);
  assert.equal(rpc, "supplied-rpc");
  console.log("PASS exact precision parser and unequal share/asset decimals honour supplied RPC");
}
const React = load("react");
const { renderToStaticMarkup } = load("react-dom/server");
const el = (node) =>
  !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat().flatMap(el)];
const childText = (children) =>
  Array.isArray(children)
    ? children.map(childText).join("")
    : typeof children === "string"
      ? children
      : children && typeof children === "object"
        ? childText(children.props?.children)
        : "";
const supplyButton = (tree) => {
  const matches = el(tree).filter(
    (node) => node.props?.onClick && childText(node.props.children).trim() === "Supply",
  );
  assert.equal(matches.length, 1);
  return matches[0];
};
{
  let mode = "missing";
  const stubs = {
    "@/providers/vault-context": {
      useVault: () => ({ status: "missing-identity", binding: null }),
    },
    "@/providers/vault-balances-context": {
      useVaultBalances: () => ({
        balances: null,
        loading: mode === "loading",
        error: mode === "error" ? "Some balances are unavailable." : null,
      }),
    },
    "@/providers/midnight-wallet-context": { useMidnightConnection: () => ({ wallet: {} }) },
    "@/components/deposit-dialog": { DepositDialog: () => null },
    "@/components/balance-display": { BalanceDisplay: () => null },
  };
  const { BalanceSection } = loader(stubs)("@/components/balance-section");
  for (mode of ["missing", "loading", "error"]) {
    const html = renderToStaticMarkup(React.createElement(BalanceSection));
    assert.ok(!html.includes("No tokens found"));
    assert.ok(
      html.includes(
        mode === "missing"
          ? "Set a vault identity"
          : mode === "loading"
            ? "Loading balances"
            : "Balances unavailable",
      ),
    );
  }
  console.log(
    "PASS balance UI distinguishes missing identity, loading and unavailable reads from successful empty portfolio",
  );
}
{
  let states = [],
    index = 0,
    refunded = true,
    available = true;
  const success = [],
    errors = [],
    calls = [];
  const local = loader({
    react: {
      ...React,
      useEffect() {},
      useState(initial) {
        const i = index++;
        if (!(i in states)) states[i] = initial;
        return [
          states[i],
          (value) => (states[i] = typeof value === "function" ? value(states[i]) : value),
        ];
      },
    },
    "@tanstack/react-query": { useQuery: () => ({ data: { rate: 1, apy: 0.03 } }) },
    sonner: {
      toast: { success: (value) => success.push(value), error: (value) => errors.push(value) },
    },
    "@/providers/vault-context": { useVault: () => ({ binding: {}, status: "ready" }) },
    "@/providers/vault-balances-context": {
      useVaultBalances: () => ({
        balances: {
          perToken: {
            "0xa": { decimals: 8, vaultUnits: available ? 100000000n : null },
            "0xb": { decimals: 6, vaultUnits: 1000000n },
          },
        },
      }),
    },
    "@/providers/vault-operations-context": {
      useVaultOperations: () => ({
        ready: true,
        busy: false,
        supply: async (units) => {
          calls.push(units);
          return { refunded };
        },
        redeem: async () => ({ refunded }),
      }),
    },
    "@/lib/config/evm": { getEvmChainConfig: () => ({ rpcUrl: "fixture" }) },
    "@/lib/midnight/evm-stata": { AAVE_USDC: "0xa", STATA_USDC: "0xb" },
    "@/lib/midnight/tx-history": {},
  });
  const { LendWidget } = local("@/components/lend-widget");
  const render = () => {
    index = 0;
    return LendWidget({});
  };
  render();
  states[1] = "1";
  await supplyButton(render()).props.onClick();
  await turns();
  assert.deepEqual(calls, [100000000n]);
  assert.equal(success.length, 0);
  refunded = false;
  states[1] = "1";
  await supplyButton(render()).props.onClick();
  await turns();
  assert.equal(calls.length, 2);
  assert.equal(success.length, 1);
  states[1] = "1.000000001";
  await supplyButton(render()).props.onClick();
  await turns();
  assert.equal(calls.length, 2);
  assert.equal(errors.length, 1);
  available = false;
  assert.equal(supplyButton(render()).props.disabled, true);
  console.log(
    "PASS lending consumer uses asset decimals, rejects excess precision, gates unavailable source and suppresses execution success after refund without EVM wallet",
  );
}
{
  const paths = [
    "src/providers/vault-operations-context.tsx",
    "src/providers/vault-balances-context.tsx",
    "src/lib/midnight/vault-balances.ts",
    "src/components/lend-widget/index.tsx",
    "src/components/swap-widget/index.tsx",
    "src/components/withdraw-dialog/index.tsx",
    "src/components/deposit-dialog/index.tsx",
  ];
  assert.ok(paths.length > 0);
  for (const path of paths) {
    const source = fs.readFileSync(path, "utf8");
    assert.ok(source.length > 0);
    assert.doesNotMatch(
      source,
      /useMidnightWallet|midnight-context|useMemo|useCallback|React\.memo|\?\? 6|decimals = 18/,
    );
  }
  assert.ok(!fs.existsSync("src/providers/midnight-context.tsx"));
  console.log(
    "PASS non-empty operation/balance consumer census excludes removed combined API, memo hooks and guessed decimals",
  );
}

{
  const intervals = new Map();
  let next = 0,
    reads = 0,
    observer,
    unsubscribe;
  const globals = {
    AbortController,
    window: {},
    setInterval: (fn) => {
      const id = ++next;
      intervals.set(id, fn);
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
  };
  const localRequire = createRequire(import.meta.url);
  const core = loader({}, globals)(localRequire.resolve("@tanstack/query-core"));
  const client = new core.QueryClient();
  const h = hooks();
  const local = loader(
    {
      react: h.react,
      "./vault-context": { useVault: () => ({ binding, requireBinding: () => binding }) },
      "@tanstack/react-query": {
        queryOptions: (value) => value,
        useQueryClient: () => client,
        useQuery(options) {
          if (!observer) {
            observer = new core.QueryObserver(client, options);
            unsubscribe = observer.subscribe(() => {});
          } else observer.setOptions(options);
          return observer.getCurrentResult();
        },
      },
      "@/lib/constants/token-metadata": { MIDNIGHT_TOKENS: [] },
      "@/lib/midnight/vault-balances": {
        readBalances: async () => {
          reads++;
          return { night: 0n, dust: 0n, perToken: {} };
        },
      },
    },
    globals,
  );
  const binding = { sessionId: "poll-fixture", assertActive() {}, providers: {}, environment: {} };
  const flow = local("@/lib/midnight/flow").flow;
  const { VaultBalancesProvider } = local("@/providers/vault-balances-context");
  const render = () => h.render(() => VaultBalancesProvider({ children: null }));
  render();
  await turns();
  render();
  assert.ok(intervals.size > 0);
  const initial = reads;
  for (const fn of [...intervals.values()]) fn();
  await turns();
  assert.ok(reads > initial);
  flow.start("deposit");
  render();
  const paused = reads;
  assert.equal(intervals.size, 0);
  for (const fn of [...intervals.values()]) fn();
  await turns();
  assert.equal(reads, paused);
  flow.set("done");
  render();
  assert.ok(intervals.size > 0);
  for (const fn of [...intervals.values()]) fn();
  await turns();
  assert.ok(reads > paused);
  h.cleanup();
  unsubscribe();
  observer.destroy();
  client.clear();
  assert.equal(intervals.size, 0);
  console.log(
    "PASS real flow subscription and browser-mode QueryObserver timers stop balance reads during proving and resume at terminal state",
  );
}

for (const replacement of [null, "identity", "wallet", "disconnect"]) {
  const superseded = replacement !== null;
  const f = await connected();
  f.run(async (...args) => {
    args[7]("recovery-record");
    throw new Error("Custom error: 196");
  });
  const pending = f
    .render()
    .operation.deposit("0xa", 1n)
    .catch(() => {});
  await f.flush();
  if (replacement === "identity") f.render().vault.setIdentitySecret("0a".repeat(32));
  if (replacement === "wallet") {
    f.connection.wallet = f.walletB;
    f.connection.session++;
  }
  if (replacement === "disconnect") f.connection.disconnect();
  if (superseded) f.flow.start("swap");
  f.rejectRecovery();
  await f.flush();
  await pending;
  assert.equal(f.flow.error, superseded ? null : "rebuild failed");
  assert.equal(f.render().operation.busy, false);
  assert.ok(
    f.history.some(
      (entry) =>
        entry[0] === "recovery-record" &&
        entry[1].status === "failed" &&
        entry[1].failureReason === (superseded ? "Vault session superseded." : "rebuild failed"),
    ),
  );
  f.cleanup();
  console.log(
    `PASS ${superseded ? `${replacement} supersedes rebuild rejection and preserves replacement progress` : "owned rebuild rejection reports terminal failure"} and releases operation ownership`,
  );
}
