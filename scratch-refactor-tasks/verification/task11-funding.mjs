import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { loader as sourceLoader } from "./load-source.mjs";
import { runtimeStubs } from "./runtime-fixture.mjs";
const loader = (stubs = {}, globals) => sourceLoader({ ...runtimeStubs(), ...stubs }, globals);
import { encodeAbiParameters, keccak256, toHex } from "viem";
const address = "0x" + "12".repeat(20);
const marker = "0x" + "34".repeat(20);
const env = {
  NODE_ENV: "development",
  LOCAL_ANVIL_INSTANCE_ID: "fixture-instance",
  NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS: "ab".repeat(32),
  NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS: "cd".repeat(32),
  NEXT_PUBLIC_MPC_SECP256K1_PUBKEY:
    "0x024eef776e4f257d68983e45b340c2e9546c5df95447900b6aadfec68fb46fdee2",
  NEXT_PUBLIC_LOCAL_EVM_MARKER_ADDRESS: marker,
  NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE: "0x1234",
};
let reads = 0;
const { isLoopbackEndpoint } = loader()("@/lib/config/loopback-endpoint");
const local = loader(
  {},
  {
    process: { env },
    AbortSignal,
    fetch: async (_url, options) => {
      reads++;
      const { method } = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          result: method === "anvil_metadata" ? { instanceId: "fixture-instance" } : "0x1234",
        }),
      };
    },
  },
)("@/lib/config/local-demo");
await local.requireLocalDemo();
assert.equal(reads, 2);
const rejected = [
  ["NODE_ENV", "production"],
  ["NEXT_PUBLIC_MIDNIGHT_NETWORK_ID", "stagenet"],
  ["NEXT_PUBLIC_SEPOLIA_RPC_URL", "https://example.com"],
  ["NEXT_PUBLIC_MIDNIGHT_NODE_URL", "http://127.0.0.1.example.com"],
  ["LOCAL_ANVIL_INSTANCE_ID", "another-instance"],
  ["NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE", "0x9999"],
];
assert.ok(rejected.length);
for (const [name, value] of rejected) {
  const previous = env[name];
  env[name] = value;
  await assert.rejects(local.requireLocalDemo());
  if (previous === undefined) delete env[name];
  else env[name] = previous;
}
await local.requireLocalDemo();
for (const url of ["http://localhost:8545", "ws://127.0.0.1:9944", "http://[::1]:8088"])
  assert.equal(isLoopbackEndpoint(url), true);
for (const url of ["http://localhost.example.com", "http://user@localhost", "file:///tmp/rpc"])
  assert.equal(isLoopbackEndpoint(url), false);
console.log("PASS non-empty planted eligibility violations reject, then restored stack passes");

const thresholds = loader()("@/lib/wallet-funding");
const { formatDust } = await import("@sig-net/midnight-contract-deploy");
assert.equal(formatDust(1_000_000_000_000_000n), "1");
assert.equal(formatDust(thresholds.MINIMUM_MIDNIGHT_DUST), "10");
assert.equal(thresholds.MINIMUM_MIDNIGHT_DUST, 10_000_000_000_000_000n);
assert.equal(thresholds.hasMidnightFees(905_585_091_299_361n), false);
for (const value of [undefined, 0n, thresholds.MINIMUM_MIDNIGHT_DUST - 1n])
  assert.equal(thresholds.hasMidnightFees(value), false);
assert.equal(thresholds.hasMidnightFees(thresholds.MINIMUM_MIDNIGHT_DUST), true);
assert.equal(thresholds.hasLocalEvmFunds(thresholds.MINIMUM_EVM_ETH, 10n ** 8n, 8), true);
for (const values of [
  [undefined, 10n ** 8n, 8],
  [thresholds.MINIMUM_EVM_ETH - 1n, 10n ** 8n, 8],
  [thresholds.MINIMUM_EVM_ETH, 10n ** 8n - 1n, 8],
])
  assert.equal(thresholds.hasLocalEvmFunds(...values), false);
console.log("PASS positive insufficient and unknown balances remain unready with chain decimals");

let eligible = true,
  eth = 1n,
  token = 0n,
  decimals = 8,
  writes = 0;
const slot = keccak256(
  encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [address, 2n]),
);
const storage = new Map();
const rpc = async (method, params) => {
  assert.equal(eligible, true);
  writes++;
  if (method === "anvil_setBalance") eth = BigInt(params[1]);
  if (method === "anvil_setStorageAt") {
    storage.set(params[1], params[2]);
    if (params[1] === slot) token = BigInt(params[2]);
  }
};
const route = loader(
  {
    "next/server": {
      NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) },
    },
    "@/lib/config/local-demo": {
      requireLocalDemo: async () => {
        if (!eligible) throw new Error("not eligible");
        return { evm: {}, rpc };
      },
    },
    "@/lib/constants/token-metadata": {
      ERC20_TOKENS: [{ symbol: "USDC", erc20Address: marker }],
      fetchErc20Decimals: async () => decimals,
    },
    "@/lib/rpc": {
      getEthereumProvider: () => ({
        getBalance: async () => eth,
        readContract: async () => token,
        getStorageAt: async ({ slot }) => storage.get(slot) ?? toHex(0n, { size: 32 }),
      }),
    },
  },
  { process: { env } },
)("@/app/api/local-funding/evm/route");
const fingerprint = loader(
  {},
  { process: { env } },
)("@/lib/config/server-runtime").serverRuntimeConfiguration().fingerprint;
const headers = { get: () => fingerprint };
const request = { headers, json: async () => ({ address }) };
assert.equal((await route.POST(request)).status, 200);
assert.equal(eth, thresholds.LOCAL_EVM_ETH_TARGET);
assert.equal(token, 100n * 10n ** 8n);
const firstWrites = writes;
assert.ok(firstWrites > 0);
await Promise.all([route.POST(request), route.POST(request)]);
assert.equal(writes, firstWrites);
eth *= 2n;
token *= 2n;
await route.POST(request);
assert.equal(writes, firstWrites);
eligible = false;
assert.equal((await route.POST(request)).status, 403);
assert.equal(writes, firstWrites);
assert.equal(
  (await route.POST({ json: async () => ({ address, seed: "must reject" }) })).status,
  400,
);
console.log(
  "PASS actual EVM route chain-decimal targets, repeat/concurrent deficit checks, no balance reduction or ineligible mutation",
);

const provider = {
  on() {},
  removeListener() {},
  async request({ method }) {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
    if (method === "eth_chainId") return "0xaa36a7";
    if (method === "eth_getCode") return code;
    throw new Error(method);
  },
};
let code = "0x1234";
const { browserWalletConnection } = loader(
  {},
  { Error, crypto: { randomUUID }, process: { env } },
)("@/lib/config/evm-wallet");
const wallet = browserWalletConnection({ provider }).create(() => {});
await wallet.connect();
code = "0x";
await assert.rejects(wallet.verify(), /local fork marker/);
assert.throws(() => wallet.assertActive(), /session changed/);
code = "0x1234";
const second = browserWalletConnection({ provider }).create(() => {});
await second.connect();
second.disconnect();
await assert.rejects(second.verify(), /session changed/);
console.log(
  "PASS equal chain IDs cannot bypass fork marker and disconnected sessions cannot verify",
);

const { signatureVerifyingKey, addressFromKey } = await import("@midnightntwrk/ledger-v9");
const { MidnightBech32m, UnshieldedAddress } =
  await import("@midnightntwrk/wallet-sdk-address-format");
const publicKey = signatureVerifyingKey({ tag: "schnorr", value: "01".repeat(32) });
const nightAddress = MidnightBech32m.encode(
  "undeployed",
  new UnshieldedAddress(Buffer.from(addressFromKey(publicKey), "hex")),
).toString();
let night = 7n,
  transfers = 0,
  closed = 0,
  observedClosed = 0,
  rootFunds = 0;
const midnightRoute = loader(
  {
    "next/server": {
      NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) },
    },
    "@/lib/config/local-demo": {
      requireLocalDemo: async () => {
        if (!eligible) throw new Error("not eligible");
        return {
          midnight: {
            networkId: "undeployed",
            indexerUrl: "http://localhost",
            indexerWsUrl: "ws://localhost",
          },
        };
      },
    },
    "@midnightntwrk/wallet-sdk-address-format": { MidnightBech32m, UnshieldedAddress },
    "@midnightntwrk/wallet-sdk-abstractions": { InMemoryTransactionHistoryStorage: class {} },
    "@midnightntwrk/wallet-sdk-facade": { WalletEntrySchema: {}, mergeWalletEntries() {} },
    "@midnightntwrk/wallet-sdk-unshielded-wallet": {
      UnshieldedWallet: () => ({
        startWithPublicKey: (value) => {
          assert.equal(value.address, nightAddress);
          return {
            start: async () => {},
            waitForSyncedState: async () => ({ balances: { night } }),
            stop: async () => {
              observedClosed++;
            },
          };
        },
      }),
    },
    "@sig-net/midnight-contract-deploy": {
      WalletRegistry: class {
        async wallet() {
          return { facade: { waitForSyncedState: async () => ({}) }, keys: {} };
        }
        async close() {
          closed++;
        }
      },
      assertRootFunded: async () => {
        rootFunds++;
      },
      transferNight: async (_facade, _keys, _state, recipient, network, amount) => {
        assert.equal(recipient, nightAddress);
        assert.equal(network, "undeployed");
        transfers++;
        night += amount;
        return "fixture-transfer";
      },
    },
  },
  { process: { env: { ...env, LOCAL_MIDNIGHT_GENESIS_SEED: "fixture-server-only" } } },
)("@/app/api/local-funding/midnight/route");
eligible = true;
const midnightRequest = { headers, json: async () => ({ address: nightAddress, publicKey }) };
assert.equal((await midnightRoute.POST(midnightRequest)).status, 200);
assert.equal(night, thresholds.LOCAL_NIGHT_GRANT);
await Promise.all([midnightRoute.POST(midnightRequest), midnightRoute.POST(midnightRequest)]);
assert.equal(transfers, 1);
assert.equal(rootFunds, 1);
assert.equal(closed, 3);
assert.equal(observedClosed, 3);
eligible = false;
assert.equal((await midnightRoute.POST(midnightRequest)).status, 403);
assert.equal(transfers, 1);
assert.equal(
  (
    await midnightRoute.POST({
      json: async () => ({ address: nightAddress, publicKey, seed: "reject" }),
    })
  ).status,
  400,
);
console.log(
  "PASS actual Midnight route public observer, deficit grant, serial repeat exclusion and observer/registry teardown",
);

const wait = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const registrationGate = wait();
let registrations = 0,
  submissions = 0,
  stopped = 0;
let dust = 0n;
const fakeState = {
  isSynced: true,
  shielded: { progress: {}, address: {} },
  unshielded: {
    availableCoins: [{ meta: { registeredForDustGeneration: false } }],
    balances: { night: 1n },
  },
  dust: { balance: () => dust },
};
const facade = {
  start: async () => {},
  stop: async () => {
    stopped++;
  },
  state: () => ({
    subscribe: ({ next }) => {
      next(fakeState);
      return { unsubscribe() {} };
    },
  }),
  estimateRegistration: async () => ({ fee: 1n }),
  waitForGeneratedDust: () => registrationGate.promise,
  registerNightUtxosForDustGeneration: async () => {
    registrations++;
    return {};
  },
  finalizeRecipe: async () => ({}),
  submitTransaction: async () => {
    submissions++;
  },
};
const { SeedWallet } = loader({
  "@midnight-ntwrk/midnight-js/network-id": { setNetworkId() {} },
  "@midnightntwrk/wallet-sdk-address-format": {
    MidnightBech32m: { encode: () => ({ toString: () => "shielded-fixture" }) },
  },
  "../seedlib": {
    deriveAccountKeys: () => ({
      unshieldedKeystore: {
        getBech32Address: () => ({ toString: () => nightAddress }),
        getPublicKey: () => publicKey,
        signDataAsync() {},
      },
    }),
    initialiseWalletFacade: async () => facade,
    createWalletAndMidnightProvider: () => ({}),
  },
})("@/lib/midnight/wallet/SeedWallet");
const seedWallet = new SeedWallet({ networkId: "undeployed" }, "11".repeat(32));
await seedWallet.initialise();
const preparing = seedWallet.ensureFeeReady(thresholds.MINIMUM_MIDNIGHT_DUST);
assert.equal(seedWallet.ensureFeeReady(thresholds.MINIMUM_MIDNIGHT_DUST), preparing);
await seedWallet.disconnect();
registrationGate.resolve();
await assert.rejects(preparing, /disconnected/);
assert.equal(registrations, 0);
assert.equal(submissions, 0);
assert.ok(stopped > 0);
console.log(
  "PASS actual SeedWallet deduplicates registration and disconnect blocks a late signing/submission continuation",
);

let hookIndex = 0;
const references = [];
const react = {
  createContext: () => ({ Provider: "provider" }),
  useContext() {},
  useRef: (value) => (references[hookIndex++] ??= { current: value }),
  useState: (value) => [value, () => {}],
  useEffect() {},
};
const readinessGate = wait();
let readinessCalls = 0;
const activeBinding = { assertActive() {} };
const operations = loader({
  react,
  "./buffer-shim": {},
  "./wallet-readiness-context": {
    useWalletReadiness: () => ({
      ready: false,
      requireReady: () => {
        readinessCalls++;
        return readinessGate.promise;
      },
    }),
  },
  "./vault-context": {
    useVault: () => ({ requireBinding: () => activeBinding, binding: activeBinding }),
  },
  "./vault-balances-context": { useVaultBalances: () => ({ refresh() {} }) },
  "@/lib/constants/token-metadata": { MIDNIGHT_TOKENS: [], fetchErc20Decimals: async () => 6 },
  "@/lib/midnight/tx-history": { midnightTxHistory: {} },
  "@/lib/midnight/evm-stata": { AAVE_USDC: "a", STATA_USDC: "b" },
})("@/providers/vault-operations-context");
const operation = operations.VaultOperationsProvider({ children: null }).props.value;
const preparingOperation = operation.deposit("0xa", 1n);
await assert.rejects(operation.deposit("0xa", 1n), /already in progress/);
assert.equal(readinessCalls, 1);
readinessGate.reject(new Error("insufficient DUST fixture"));
await assert.rejects(preparingOperation, /insufficient DUST/);
await assert.rejects(operation.deposit("0xa", 1n), /insufficient DUST/);
assert.equal(readinessCalls, 2);
console.log("PASS vault operation takes its shared lock before a delayed readiness read");
