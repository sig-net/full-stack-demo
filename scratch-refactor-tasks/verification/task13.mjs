import assert from "node:assert/strict";
import fs from "node:fs";

import * as query from "@tanstack/react-query";
import * as React from "react";
import { renderToString } from "react-dom/server";
import * as viem from "viem";
import { sepolia } from "viem/chains";

import { loader as sourceLoader } from "./load-source.mjs";
import { runtimeStubs } from "./runtime-fixture.mjs";
const loader = (stubs = {}, globals) => sourceLoader({ ...runtimeStubs(), ...stubs }, globals);

const account = viem.getAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
const destination = "0x" + "de".repeat(20);
const token = "0x" + "fe".repeat(20);
const hash = "0x" + "ab".repeat(32);
const globals = { Error, crypto: globalThis.crypto };
const load = loader({}, globals);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const turns = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

function harness(stubs = {}, extra = {}) {
  const states = [],
    refs = [],
    effects = [],
    observers = [],
    mutations = [];
  const client = new query.QueryClient();
  let si = 0,
    ri = 0,
    ei = 0,
    qi = 0,
    mi = 0;
  const pendingEffects = [];
  const react = {
    ...React,
    useState(initial) {
      const i = si++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (value) => (states[i] = typeof value === "function" ? value(states[i]) : value),
      ];
    },
    useRef(initial) {
      return (refs[ri++] ??= { current: initial });
    },
    useEffect(fn, deps) {
      const i = ei++;
      if (!effects[i] || deps.some((value, n) => value !== effects[i].deps[n]))
        pendingEffects.push(() => {
          effects[i]?.cleanup?.();
          effects[i] = { deps, cleanup: fn() };
        });
    },
  };
  react.useLayoutEffect = react.useEffect;
  const local = loader(
    {
      react,
      "@tanstack/react-query": {
        ...query,
        useQueryClient: () => client,
        useQuery(options) {
          const i = qi++;
          if (!observers[i]) {
            observers[i] = new query.QueryObserver(client, options);
            observers[i].subscribe(() => {});
          } else observers[i].setOptions(options);
          return observers[i].getCurrentResult();
        },
        useMutation(options) {
          const i = mi++;
          if (!mutations[i]) {
            mutations[i] = new query.MutationObserver(client, options);
            mutations[i].subscribe(() => {});
          } else mutations[i].setOptions(options);
          return {
            ...mutations[i].getCurrentResult(),
            mutateAsync: (input) => mutations[i].mutate(input),
            reset: mutations[i].reset,
          };
        },
      },
      ...stubs,
    },
    { ...globals, ...extra },
  );
  return {
    load: local,
    client,
    render(fn) {
      si = ri = ei = qi = mi = 0;
      const result = fn();
      pendingEffects.splice(0).forEach((fn) => fn());
      return result;
    },
    cleanup() {
      effects.forEach((value) => value.cleanup?.());
      observers.forEach((value) => value.destroy());
      mutations.forEach((value) => value.reset());
      client.clear();
    },
  };
}

function provider() {
  const listeners = new Map(),
    calls = [];
  let wait;
  return {
    calls,
    listeners,
    on(name, fn) {
      listeners.set(name, fn);
    },
    removeListener(name, fn) {
      assert.equal(listeners.get(name), fn);
      listeners.delete(name);
    },
    async request(input) {
      calls.push(input.method);
      if (input.method === "eth_requestAccounts") return wait ? wait.promise : [account];
      if (input.method === "eth_accounts") return [account];
      if (input.method === "eth_chainId") return "0xaa36a7";
      if (input.method === "eth_sendTransaction") return hash;
      throw new Error(input.method);
    },
    delay() {
      return (wait = deferred());
    },
  };
}
{
  const local = loader({}, globals);
  const { EvmWalletProvider, useEvmWallet } = local("@/providers/evm-wallet-context");
  function Consumer() {
    assert.equal(useEvmWallet().wallet, null);
    return React.createElement("span", null, "standalone");
  }
  assert.match(
    renderToString(React.createElement(EvmWalletProvider, null, React.createElement(Consumer))),
    /standalone/,
  );
  const h = harness();
  const { EvmWalletProvider: Provider } = h.load("@/providers/evm-wallet-context");
  const { BrowserWallet } = h.load("@/lib/evm/wallet/BrowserWallet");
  const view = () => h.render(() => Provider({ children: null }).props.value);
  const p = provider(),
    gate = p.delay();
  let creates = 0;
  const connection = {
    key: p,
    create: (invalidated) => {
      creates++;
      return new BrowserWallet(sepolia, {}, { provider: p }, invalidated);
    },
  };
  const first = view().connect(connection),
    second = view().connect(connection);
  assert.equal(first, second);
  assert.equal(creates, 1);
  view().disconnect();
  gate.resolve([account]);
  await first;
  assert.equal(view().wallet, null);
  assert.equal(p.listeners.size, 0);
  const fresh = provider();
  await view().connect({
    key: fresh,
    create: (invalidated) => new BrowserWallet(sepolia, {}, { provider: fresh }, invalidated),
  });
  assert.equal(view().wallet.account, account);
  assert.deepEqual(fresh.calls, [
    "eth_requestAccounts",
    "eth_chainId",
    "eth_chainId",
    "eth_accounts",
  ]);
  assert.equal(h.client.getQueryCache().getAll().length, 0);
  h.cleanup();
  assert.equal(fresh.listeners.size, 0);
  console.log(
    "PASS standalone real React SSR and isolated mounted lifecycle connect/deduplication/cancel/unmount without query writes, balance RPC or funding",
  );
}
{
  const { BrowserWallet } = load("@/lib/evm/wallet/BrowserWallet");
  const p = provider();
  const units = 7n;
  const data = viem.encodeFunctionData({
    abi: viem.erc20Abi,
    functionName: "transfer",
    args: [destination, units],
  });
  let mode = "valid";
  const publicClient = {
    readContract: async () => units,
    getBalance: async () => 2n,
    estimateGas: async () => 1n,
    getGasPrice: async () => 1n,
    waitForTransactionReceipt: async () => ({
      status: "success",
      transactionHash: hash,
      logs: [
        {
          address: token,
          topics: viem.encodeEventTopics({
            abi: viem.erc20Abi,
            eventName: "Transfer",
            args: { from: account, to: destination },
          }),
          data: viem.encodeAbiParameters([{ type: "uint256" }], [units]),
        },
      ],
    }),
    getTransaction: async () => ({
      from: account.toLowerCase(),
      to: token,
      input: mode === "changed" ? "0x" : data,
      value: 0n,
    }),
  };
  const wallet = new BrowserWallet(sepolia, publicClient, { provider: p }, () => {});
  await wallet.connect();
  assert.equal(
    (await wallet.transferErc20({ token, destination, units, submitted() {} })).units,
    units,
  );
  mode = "changed";
  await assert.rejects(
    wallet.transferErc20({ token, destination, units, submitted() {} }),
    /replaced or cancelled/,
  );
  wallet.disconnect();
  console.log(
    "PASS arbitrary non-USDC token and lowercase non-vault destination transfer with exact base units, low native fee reserve and changed calldata rejection",
  );
}
{
  let active = true;
  const gate = deferred();
  const wallet = {
    sessionId: "balance-a",
    chain: sepolia,
    account,
    assertActive() {
      if (!active) throw new Error("session changed");
    },
    publicClient: {
      getBalance: () => gate.promise,
      readContract: async (input) => (input.functionName === "decimals" ? 8 : 5n),
    },
  };
  const h = harness();
  const { useWalletBalances } = h.load("@/providers/evm-balances-context");
  h.render(() => useWalletBalances(wallet, [token]));
  active = false;
  assert.equal(h.render(() => useWalletBalances(null, [token])).data, undefined);
  gate.resolve(9n);
  await turns();
  assert.equal(
    h.client
      .getQueryCache()
      .getAll()
      .filter((value) => value.queryKey[1] === "balance-a").length,
    0,
  );
  h.cleanup();
  console.log("PASS balance owner removes obsolete session query and excludes delayed results");
}
{
  const wallet = {
    sessionId: "eligible",
    chain: sepolia,
    account,
    assertActive() {},
    publicClient: { estimateGas: async () => 2n, getGasPrice: async () => 1n },
  };
  let balances = {
    isSuccess: true,
    data: { eth: 3n, tokens: [{ erc20Address: token, decimals: 8, units: 50n }] },
  };
  const h = harness({
    "@/providers/evm-wallet-context": { useEvmWallet: () => ({ wallet }) },
    "@/providers/evm-balances-context": { useEvmBalances: () => balances },
  });
  const { useEvmDepositEligibility } = h.load("@/hooks/use-evm-deposit-eligibility");
  const view = (amount) => h.render(() => useEvmDepositEligibility(token, amount, destination));
  view("0.00000007");
  await turns();
  assert.equal(view("0.00000007").ready, true);
  assert.equal(view("0.00000051").ready, false);
  assert.match(view("0.000000001").error, /decimal places/);
  balances = { ...balances, isSuccess: false };
  assert.equal(view("0.00000007").ready, false);
  balances = {
    isSuccess: true,
    data: { eth: 0n, tokens: [{ erc20Address: token, decimals: 8, units: 50n }] },
  };
  assert.equal(view("0.00000007").ready, false);
  balances = {
    isSuccess: true,
    data: { eth: 3n, tokens: [{ erc20Address: token, decimals: undefined, units: 50n }] },
  };
  assert.equal(view("0.00000007").ready, false);
  h.cleanup();
  console.log(
    "PASS selected token/amount below local reserve with estimated fees, excess precision, unavailable decimals/balances and zero fee balance",
  );
}
{
  let address = account,
    session = "a",
    requests = 0,
    refreshes = 0,
    gate = deferred(),
    failRefresh = false;
  const h = harness(
    {},
    {
      fetch: async (_url, options) => {
        requests++;
        assert.deepEqual(Object.keys(JSON.parse(options.body)), ["address"]);
        await gate.promise;
        return { ok: true, json: async () => ({}) };
      },
    },
  );
  const { useAddressFunding } = h.load("@/providers/evm-local-funding-context");
  const view = () =>
    h.render(() =>
      useAddressFunding(address, session, async () => {
        refreshes++;
        if (failRefresh) throw new Error("read failed");
      }),
    );
  const first = view().fund(),
    duplicate = view().fund();
  assert.equal(first, duplicate);
  await turns();
  assert.equal(requests, 1);
  address = viem.getAddress(destination);
  session = "b";
  view();
  gate.resolve();
  await assert.rejects(first, /recipient changed/);
  assert.equal(refreshes, 0);
  assert.equal(view().funding.isSuccess, false);
  assert.equal(view().funding.error, null);
  gate = deferred();
  failRefresh = true;
  const second = view().fund();
  gate.resolve();
  await second;
  assert.equal(refreshes, 1);
  assert.equal(view().funding.isSuccess, true);
  assert.match(view().refreshError, /Funding succeeded/);
  h.cleanup();
  console.log(
    "PASS address-only funding deduplicates requests, detaches stale recipients and distinguishes successful funding from failed refresh",
  );
}
{
  let wallet;
  const gate = deferred();
  let readinessCalls = 0,
    sends = 0,
    failRefresh = false;
  const binding = { depositAddress: destination, assertActive() {} };
  let decimals = 8;
  wallet = {
    sessionId: "deposit",
    account,
    chain: sepolia,
    assertActive() {},
    publicClient: { readContract: async () => decimals },
    transferErc20: async (input) => {
      sends++;
      input.beforeSubmit();
      input.submitted(hash);
      return { hash, units: input.units };
    },
  };
  const h = harness({
    "./evm-wallet-context": { useEvmWallet: () => ({ wallet }) },
    "./evm-balances-context": {
      useEvmBalances: () => ({
        isSuccess: true,
        data: { eth: 3n, tokens: [{ erc20Address: token, units: 50n, decimals: 8 }] },
      }),
    },
    "./vault-context": { useVault: () => ({ requireBinding: () => binding }) },
    "./vault-balances-context": {
      useVaultBalances: () => ({
        refresh: async () => {
          if (failRefresh) throw new Error("refresh failed");
        },
      }),
    },
    "./vault-operations-context": { useVaultOperations: () => ({ deposit: async () => {} }) },
    "./wallet-readiness-context": {
      useWalletReadiness: () => ({
        requireReady: async () => {
          readinessCalls++;
          await gate.promise;
        },
      }),
    },
    "@/lib/constants/token-metadata": { isErc20Allowed: () => true },
  });
  const { EvmDepositProvider } = h.load("@/providers/evm-deposit-context");
  const view = () => h.render(() => EvmDepositProvider({ children: null }).props.value);
  const first = view().sendDeposit(binding, token, "0.00000007");
  await view().sendDeposit(binding, token, "0.00000007");
  assert.equal(readinessCalls, 1);
  gate.resolve();
  failRefresh = true;
  await first;
  assert.equal(sends, 1);
  assert.equal(view().transfer.status, "confirmed");
  assert.equal(view().transfer.amount, "0.00000007");
  assert.equal(view().transfer.chainId, sepolia.id);
  await view().sendDeposit(binding, token, "0.000000001");
  assert.equal(sends, 1);
  assert.equal(view().transfer.status, "error");
  decimals = undefined;
  await view().sendDeposit(binding, token, "0.1");
  assert.equal(sends, 1);
  assert.equal(view().transfer.status, "error");
  assert.match(view().transfer.error, /decimals are unavailable/);
  h.cleanup();
  console.log(
    "PASS shared deposit lock precedes async readiness, captures chain/amount, preserves confirmation after refresh failure and rejects precision/unknown decimals before transfer",
  );
}

{
  let ready = false,
    pending = false,
    available = true,
    eligible = true;
  const local = loader({
    "@/providers/evm-wallet-context": { useEvmWallet: () => ({ wallet: { account } }) },
    "@/providers/evm-balances-context": {
      useEvmBalances: () => ({ isSuccess: available, isError: !available }),
    },
    "@/providers/evm-local-funding-context": {
      useEvmLocalFunding: () => ({ ready, funding: { isPending: pending }, fund: async () => {} }),
    },
    "@/providers/wallet-readiness-context": {
      useWalletReadiness: () => ({
        wallet: null,
        ready: true,
        resourcesReady: true,
        funding: {},
        balances: {},
        eligibility: { data: eligible },
      }),
    },
  });
  const { LocalWalletFunding } = local("@/components/local-wallet-funding");
  const render = () => renderToString(React.createElement(LocalWalletFunding));
  assert.match(render(), /Fund local wallets/);
  assert.doesNotMatch(render(), /disabled=""/);
  pending = true;
  assert.match(render(), /disabled=""/);
  assert.match(render(), /Funding and waiting/);
  pending = false;
  available = false;
  assert.match(render(), /balances unavailable/);
  assert.match(render(), /disabled=""/);
  available = true;
  eligible = false;
  assert.doesNotMatch(render(), /Fund local wallets/);
  assert.match(render(), /Local funding is unavailable/);
  eligible = true;
  ready = true;
  assert.doesNotMatch(render(), /Fund local wallets/);
  assert.match(render(), /Refresh wallet readiness/);
  console.log(
    "PASS rendered low-reserve funding controls, pending exclusion, unavailable balances, ineligible server and already-funded refresh",
  );
}

const sources = [
  "src/lib/evm/wallet/Wallet.ts",
  "src/lib/evm/wallet/BrowserWallet.ts",
  "src/lib/evm/erc20-transfer.ts",
  "src/providers/evm-wallet-context.tsx",
];
assert.ok(sources.length > 0);
for (const file of sources) {
  const source = fs.readFileSync(file, "utf8");
  assert.ok(source.length > 0);
  assert.doesNotMatch(
    source,
    /DepositTransfer|sendDeposit|continueDeposit|VaultBinding|hasEvmDepositFunds|USDC|local-funding|NEXT_PUBLIC_MIDNIGHT|LOCAL_EVM_MARKER/,
  );
  if (file.endsWith("context.tsx"))
    assert.doesNotMatch(source, /useQuery|useMutation|queryClient|useVault|useWalletReadiness/);
}
console.log("PASS non-empty generic wallet boundary guard");
