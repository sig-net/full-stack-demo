import assert from "node:assert/strict";
import fs from "node:fs";

import * as React from "react";

import { loader } from "./load-source.mjs";
import { runtimeStubs } from "./runtime-fixture.mjs";
import { fixture } from "./task07.mjs";
const key = "0x024eef776e4f257d68983e45b340c2e9546c5df95447900b6aadfec68fb46fdee2";
const env = {
  NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS: "ab".repeat(32),
  NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS: "cd".repeat(32),
  NEXT_PUBLIC_MPC_SECP256K1_PUBKEY: key,
  RELAYER_PRIVATE_KEY: "private-server-secret",
  LOCAL_MIDNIGHT_GENESIS_SEED: "private-server-seed",
};
const load = loader({}, { process: { env } });
const {
  createRuntimeConfiguration,
  getRuntimeDefaults,
  validateRuntimeFields,
  runtimeFields,
  runtimeFingerprint,
} = load("@/lib/config/runtime");
const defaults = getRuntimeDefaults();
assert.equal(defaults.fields.chainId, "11155111");
assert.equal(defaults.fields.networkId, "undeployed");
assert.equal(defaults.fields.explorerUrl, "");
assert.equal(runtimeFields.length, 10);
assert.equal(new Set(runtimeFields.map((field) => field.key)).size, 10);
assert.doesNotMatch(JSON.stringify(defaults), /private-server|RELAYER|GENESIS|secret/i);
const owner = createRuntimeConfiguration(defaults),
  events = [];
owner.onInvalidate((scopes) => events.push([...scopes].sort().join(",")));
const startup = owner.getSnapshot().applied;
for (const [field, value] of [
  ["rpcUrl", "partial"],
  ["indexerUrl", "ws://fixture.invalid"],
  ["indexerWsUrl", "https://fixture.invalid"],
  ["nodeUrl", "file:///tmp/node"],
  ["proofServerUrl", "relative"],
  ["explorerUrl", "data:text/plain,test"],
  ["chainId", "1"],
  ["networkId", "preprod"],
  ["contractAddress", "bad"],
  ["mpcSecpPub", "0x02" + "00".repeat(32)],
]) {
  owner.edit(field, value);
  assert.equal(owner.getSnapshot().applied, startup);
  assert.equal(owner.apply(), false);
  assert.ok(owner.getSnapshot().errors[field]);
  assert.equal(owner.getSnapshot().draft[field], value);
  assert.equal(events.length, 0);
  owner.discard();
}
owner.edit("explorerUrl", "https://sepolia.etherscan.io");
assert.equal(owner.apply(), false);
assert.match(owner.getSnapshot().errors.explorerUrl, /local fork/);
owner.discard();
owner.edit("explorerUrl", "http://localhost:4000");
assert.equal(owner.apply(), true);
assert.equal(events.pop(), "");
assert.equal(owner.getSnapshot().applied.fingerprint, startup.fingerprint);
owner.edit("explorerUrl", "");
assert.equal(owner.apply(), true);
assert.equal(owner.getSnapshot().applied.evm.explorerUrl, undefined);
assert.equal(events.pop(), "");
owner.edit("rpcUrl", "https://rpc.fixture.invalid");
owner.edit("explorerUrl", "");
assert.equal(owner.apply(), true);
assert.equal(events.pop(), "evm,vault");
assert.equal(owner.getSnapshot().applied.environment.evmRpcUrl, "https://rpc.fixture.invalid");
assert.notEqual(owner.getSnapshot().applied.fingerprint, startup.fingerprint);
const hostedDefaults = {
  ...defaults,
  fields: {
    ...defaults.fields,
    networkId: "stagenet",
    rpcUrl: "https://rpc.fixture.invalid",
    indexerUrl: "https://indexer.fixture.invalid",
    nodeUrl: "wss://node.fixture.invalid",
  },
};
assert.equal(
  Object.keys(
    validateRuntimeFields(
      { ...hostedDefaults.fields, explorerUrl: "https://explorer.fixture.invalid" },
      hostedDefaults,
    ),
  ).length,
  0,
);
owner.edit("nodeUrl", "wss://node.fixture.invalid");
assert.equal(owner.apply(), true);
assert.equal(events.pop(), "midnight,vault");
owner.edit("contractAddress", "ef".repeat(32));
assert.equal(owner.apply(), true);
assert.equal(events.pop(), "vault");
assert.equal(owner.getSnapshot().applied.environment.contractAddress, "ef".repeat(32));
assert.ok(Object.isFrozen(owner.getSnapshot().applied));
assert.ok(Object.isFrozen(owner.getSnapshot().applied.fields));
assert.ok(Object.isFrozen(owner.getSnapshot().applied.midnight));
owner.reset();
assert.equal(owner.getSnapshot().applied.fingerprint, startup.fingerprint);
assert.deepEqual(owner.getSnapshot().draft, defaults.fields);
assert.deepEqual(createRuntimeConfiguration(defaults).getSnapshot().draft, defaults.fields);
const missing = loader(
  {},
  { process: { env: {} } },
)("@/lib/config/runtime").createRuntimeConfiguration();
assert.equal(missing.getSnapshot().applied.evm.chainId, 11155111);
assert.equal(missing.getSnapshot().draft.contractAddress, "");
assert.throws(() => missing.getSnapshot().applied.environment.contractAddress, /required/);
assert.equal(missing.apply(), false);
assert.ok(missing.getSnapshot().errors.contractAddress);
missing.reset();
console.log(
  "PASS all ten fields, invalid drafts, atomic constructor snapshots, scoped apply/reset, memory reload and lazy missing deployment",
);

for (const phase of ["lookup", "balance", "operation"]) {
  const config = createRuntimeConfiguration(defaults);
  const runtime = {
    owner: config,
    get applied() {
      return config.getSnapshot().applied;
    },
    requireServerHeaders: () => ({}),
    serverUnavailable: null,
  };
  const f = fixture(runtime);
  if (phase === "lookup") f.pause();
  const oldBalance = phase === "balance" ? f.delayBalance() : null;
  f.connection.wallet = f.walletA;
  f.render().vault.setIdentitySecret("09".repeat(32));
  await f.flush();
  const old = f.render().vault.binding;
  let resolve;
  const wait = new Promise((r) => (resolve = r));
  let executions = 0;
  let operation;
  if (phase === "operation") {
    f.run(async () => {
      executions++;
      await wait;
    });
    operation = f
      .render()
      .operation.deposit("0xa", 1n)
      .catch((error) => error);
    await f.flush();
    assert.equal(executions, 1);
  }
  config.edit("contractAddress", "ef".repeat(32));
  assert.equal(config.apply(), true);
  if (old) assert.throws(() => old.assertActive(), /superseded/);
  if (phase === "lookup") {
    f.resume();
    for (const join of f.joins) join.ready.resolve();
  }
  const newBalance = phase === "balance" ? f.delayBalance() : null;
  oldBalance?.resolve({ perToken: {}, marker: "obsolete" });
  if (phase === "operation") resolve();
  await f.flush();
  if (operation) assert.match((await operation).message, /superseded/);
  assert.equal(f.render().vault.status, "ready");
  assert.equal(f.render().vault.identitySecret, "09".repeat(32));
  assert.notEqual(f.render().vault.binding, old);
  assert.equal(f.render().vault.binding.environment.contractAddress, "ef".repeat(32));
  if (phase === "balance") {
    assert.equal(f.render().balances.balances, null);
    newBalance.resolve({ perToken: {}, marker: "current" });
    await f.flush();
    assert.equal(f.render().balances.balances.marker, "current");
  }
  f.cleanup();
}
console.log(
  "PASS applied deployment invalidates delayed lookup, balance and operation ownership, preserves caller identity and rebinds the actual vault provider",
);

const server = load("@/lib/config/server-runtime");
const publicConfig = server.serverRuntimeConfiguration();
assert.equal(
  publicConfig.fingerprint,
  runtimeFingerprint(defaults.fields, defaults.signetContractAddress),
);
const request = (fingerprint, body) => ({
  headers: { get: () => fingerprint },
  json: async () => body,
});
assert.throws(() => server.requireServerConfiguration(request(null)), /differs/);
assert.throws(() => server.requireServerConfiguration(request("0x00")), /differs/);
assert.equal(
  server.requireServerConfiguration(request(publicConfig.fingerprint)).fingerprint,
  publicConfig.fingerprint,
);
let privileged = 0;
const routeLoad = loader(
  {
    "next/server": {
      NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) },
    },
    "@/lib/config/local-demo": {
      requireLocalDemo: async () => {
        privileged++;
        throw new Error("privileged fixture reached");
      },
    },
    "@/lib/rpc": {
      getEthereumProvider: () => {
        privileged++;
        throw new Error("privileged fixture reached");
      },
    },
    "@midnight-ntwrk/midnight-js-indexer-public-data-provider": {
      indexerPublicDataProvider: () => {
        privileged++;
        throw new Error("privileged fixture reached");
      },
    },
    "@midnightntwrk/wallet-sdk-unshielded-wallet": {},
    "@midnightntwrk/wallet-sdk-abstractions": {},
    "@midnightntwrk/wallet-sdk-facade": {},
    "@midnightntwrk/wallet-sdk-address-format": {},
  },
  { Error, process: { env }, console: { ...console, error() {} } },
);
const cases = [
  ["local-funding/evm", { address: "0x" + "12".repeat(20) }],
  [
    "local-funding/midnight",
    { address: "public-address-fixture", publicKey: { tag: "schnorr", value: "ab" } },
  ],
  ["midnight/gas-topup", { operation: "withdraw", recipient: { kind: "vault" } }],
];
assert.ok(cases.length);
for (const [path, body] of cases) {
  const route = routeLoad("@/app/api/" + path + "/route");
  for (const fingerprint of [null, "0x00"]) {
    const result = await route.POST(request(fingerprint, body));
    assert.notEqual(result.status, 200);
    assert.match(result.body.error, /differs/);
    assert.equal(privileged, 0);
  }
  const result = await route.POST(
    request(publicConfig.fingerprint, { ...body, rpcUrl: "https://attacker.invalid" }),
  );
  assert.equal(result.status, 400);
  assert.equal(privileged, 0);
}
console.log(
  "PASS all three real route entrypoints reject absent/mismatched compatibility and arbitrary browser RPC before privileged consumers",
);

const config = createRuntimeConfiguration(defaults);
const runtime = { ...config.getSnapshot(), owner: config };
const reported = {
  ...defaults.fields,
  indexerUrl: "https://extension.invalid",
  proofServerUrl: "https://fallback.invalid",
};
let reportedProofServerUrl;
const sectionsLoad = loader({
  ...runtimeStubs(runtime),
  "@/providers/midnight-wallet-context": {
    useMidnightConnection: () => ({
      wallet: { kind: "browser", configuration: reported, reportedProofServerUrl },
      error: null,
    }),
  },
});
const sections = () =>
  sectionsLoad("@/hooks/use-runtime-config-sections")
    .useRuntimeConfigSections()
    .sections.flatMap((section) => section.fields);
assert.equal(sections().find((field) => field.key === "indexerUrl").difference.kind, "endpoint");
assert.equal(sections().find((field) => field.key === "proofServerUrl").difference, undefined);
reportedProofServerUrl = "https://prover.extension.invalid";
assert.equal(
  sections().find((field) => field.key === "proofServerUrl").difference.walletValue,
  reportedProofServerUrl,
);
reported.networkId = "preprod";
assert.equal(sections().find((field) => field.key === "networkId").difference.kind, "network");
assert.equal(sections().find((field) => field.key === "rpcUrl").difference, undefined);
assert.match(sections().find((field) => field.key === "rpcUrl").help, /does not report/);
console.log(
  "PASS typed sections distinguish network, reported endpoint and absent prover/RPC knowledge",
);

{
  const config = createRuntimeConfiguration(defaults);
  const state = { applied: config.getSnapshot().applied, owner: config };
  let disconnected = 0,
    midnightDisconnected = 0,
    resolve;
  let currentWallet;
  const hookState = [],
    hookRefs = [];
  let si = 0,
    ri = 0;
  const hookReact = {
    ...React,
    useState: (initial) => {
      const i = si++;
      hookState[i] ??= initial;
      return [
        hookState[i],
        (value) => (hookState[i] = typeof value === "function" ? value(hookState[i]) : value),
      ];
    },
    useRef: (initial) => (hookRefs[ri++] ??= { current: initial }),
    useEffect() {},
    useLayoutEffect: (fn) => fn(),
  };
  const evmLoader = loader({ react: hookReact });
  const { EvmWalletProvider } = evmLoader("@/providers/evm-wallet-context");
  const evm = () => {
    si = ri = 0;
    return EvmWalletProvider({ children: null }).props.value;
  };
  const app = loader({
    ...runtimeStubs(state),
    react: hookReact,
    "./evm-wallet-context": { useEvmWallet: evm },
    "./midnight-wallet-context": {
      MidnightWalletProvider: () => null,
      useMidnightConnection: () => ({
        disconnect() {
          midnightDisconnected++;
        },
      }),
    },
    "@/lib/constants/token-metadata": { ERC20_TOKENS: [] },
  });
  const all = (node) =>
    !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat().flatMap(all)];
  const tree = app("@/providers/providers").Providers({ children: null });
  const assembly = all(tree).find((node) => node.type?.name === "RuntimeWallets");
  const bridge = all(assembly.type(assembly.props)).find(
    (node) => node.type?.name === "RuntimeWalletInvalidation",
  );
  bridge.type();
  const pending = evm().connect({
    key: {},
    create() {
      currentWallet = {
        active: true,
        connect: () => new Promise((r) => (resolve = r)),
        disconnect() {
          this.active = false;
          disconnected++;
        },
        assertActive() {
          if (!this.active) throw new Error("session changed");
        },
      };
      return currentWallet;
    },
  });
  config.edit("explorerUrl", "http://localhost:4000");
  config.apply();
  assert.equal(disconnected, 0);
  config.edit("rpcUrl", "http://localhost:9545");
  config.apply();
  assert.equal(disconnected, 1);
  assert.equal(midnightDisconnected, 0);
  resolve();
  await pending;
  assert.equal(evm().wallet, null);
  config.edit("nodeUrl", "http://localhost:9945");
  config.apply();
  assert.equal(midnightDisconnected, 1);
  console.log(
    "PASS actual application invalidation bridge preserves explorer signing session, cancels delayed EVM connection and disconnects only the affected chain",
  );
}
{
  const config = createRuntimeConfiguration(defaults);
  let serverData,
    serverError = false;
  const providerLoad = loader({
    react: {
      ...React,
      useState: (initial) => [initial(), () => {}],
      useSyncExternalStore: (_subscribe, read) => read(),
    },
    "@tanstack/react-query": { useQuery: () => ({ data: serverData, isError: serverError }) },
    "@/lib/config/runtime": {
      ...load("@/lib/config/runtime"),
      createRuntimeConfiguration: () => config,
    },
  });
  const view = () =>
    providerLoad("@/providers/runtime-config-context").RuntimeConfigProvider({ children: null })
      .props.value;
  assert.throws(() => view().requireServerHeaders(), /unavailable/);
  serverData = publicConfig;
  assert.equal(view().serverUnavailable, null);
  assert.equal(view().requireServerHeaders()["x-vault-configuration"], publicConfig.fingerprint);
  const previous = view();
  config.edit("rpcUrl", "https://other.invalid");
  config.apply();
  assert.throws(() => previous.requireServerHeaders(), /changed/);
  assert.match(view().serverUnavailable, /RPC URL/);
  assert.throws(() => view().requireServerHeaders(), /RPC URL/);
  config.reset();
  serverError = true;
  assert.throws(() => view().requireServerHeaders(), /unavailable/);
  const f = fixture({
    owner: config,
    get applied() {
      return config.getSnapshot().applied;
    },
    serverUnavailable: "incompatible fixture",
    requireServerHeaders() {
      throw new Error("incompatible fixture");
    },
  });
  f.connection.wallet = f.walletA;
  f.render().vault.setIdentitySecret("09".repeat(32));
  await f.flush();
  let submissions = 0;
  f.run(async () => submissions++);
  assert.equal(f.render().operation.ready, false);
  await assert.rejects(f.render().operation.deposit("0xa", 1n), /incompatible fixture/);
  assert.equal(submissions, 0);
  assert.equal(f.calls.length, 0);
  assert.equal(f.render().operation.busy, false);
  f.cleanup();
  console.log(
    "PASS unavailable/stale server configuration fails closed, mismatch names fields and actual operation preflight prevents all funding/proving work",
  );
}

{
  let indexer, prover;
  const supplied = { ...defaults.fields },
    reported = {
      ...defaults.fields,
      indexerUrl: "https://extension.invalid",
      proofServerUrl: "https://extension-prover.invalid",
    };
  const resourceLoad = loader(
    {
      "@midnight-ntwrk/midnight-js/contracts": {},
      "@midnight-ntwrk/compact-js/effect/CompiledContract": {},
      "@midnight-ntwrk/midnight-js-fetch-zk-config-provider": { FetchZkConfigProvider: class {} },
      "@midnight-ntwrk/midnight-js-indexer-public-data-provider": {
        indexerPublicDataProvider: (input) => {
          indexer = input;
          return {};
        },
      },
      "./seedlib": {
        createCrossContractProofServerProvider: (url) => {
          prover = url;
          return {};
        },
      },
    },
    { window: {} },
  );
  resourceLoad("@/lib/midnight/vault-providers").buildVaultProviders(
    { transactions: {}, configuration: reported },
    supplied,
    "https://assets.invalid",
  );
  assert.equal(indexer.queryURL, supplied.indexerUrl);
  assert.equal(prover, supplied.proofServerUrl);
  console.log(
    "PASS actual vault provider constructors use applied indexer/prover despite extension-reported differences",
  );
}

{
  const blocked = {
    serverUnavailable: "Server fixture unavailable.",
    requireServerHeaders() {
      throw new Error("Server fixture unavailable.");
    },
    applied: { evm: {} },
  };
  let transfers = 0;
  const isolated = loader({
    ...runtimeStubs(blocked),
    "@/lib/constants/token-metadata": { isErc20Allowed: () => true },
    react: {
      ...React,
      useState: (initial) => [initial, () => {}],
      useRef: (initial) => ({ current: initial }),
      useEffect() {},
    },
    "@tanstack/react-query": {
      useQueryClient: () => ({}),
      useQuery: () => ({ isSuccess: true, data: 1n }),
    },
    "./evm-wallet-context": {
      useEvmWallet: () => ({
        wallet: {
          transferErc20() {
            transfers++;
          },
        },
      }),
    },
    "@/providers/evm-wallet-context": {
      useEvmWallet: () => ({
        wallet: { chain: { id: 11155111 }, account: "0x" + "12".repeat(20) },
      }),
    },
    "./evm-balances-context": { useEvmBalances: () => ({}) },
    "@/providers/evm-balances-context": {
      useEvmBalances: () => ({
        isSuccess: true,
        data: { eth: 100n, tokens: [{ erc20Address: "token", units: 10n, decimals: 0 }] },
      }),
    },
    "./vault-operations-context": { useVaultOperations: () => ({}) },
    "./vault-balances-context": { useVaultBalances: () => ({}) },
    "./vault-context": { useVault: () => ({}) },
    "./wallet-readiness-context": { useWalletReadiness: () => ({}) },
  });
  const deposit = isolated("@/providers/evm-deposit-context").EvmDepositProvider({ children: null })
    .props.value;
  await assert.rejects(deposit.sendDeposit({}, "token", "1"), /Server fixture unavailable/);
  assert.equal(transfers, 0);
  assert.equal(deposit.transfer, null);
  const eligibility = isolated("@/hooks/use-evm-deposit-eligibility").useEvmDepositEligibility(
    "token",
    "1",
    "destination",
  );
  assert.equal(eligibility.ready, false);
  assert.equal(eligibility.error, blocked.serverUnavailable);
  console.log(
    "PASS assisted EVM deposit preflight rejects before transfer and eligibility exposes the compatibility reason",
  );
}
const guardPaths = [
  "src/lib/config/runtime.ts",
  "src/providers/runtime-config-context.tsx",
  "src/hooks/use-runtime-config-sections.ts",
];
assert.ok(guardPaths.length);
for (const path of guardPaths) {
  const source = fs.readFileSync(path, "utf8");
  assert.ok(source.length);
  assert.doesNotMatch(
    source,
    /localStorage|sessionStorage|RELAYER_PRIVATE_KEY|LOCAL_MIDNIGHT_GENESIS_SEED/,
    "Runtime public memory boundary: " + path,
  );
}
console.log("PASS non-empty runtime public memory boundary guard");
