import assert from "node:assert/strict";

import * as ledger from "@midnightntwrk/ledger-v9";
import * as addressFormat from "@midnightntwrk/wallet-sdk-address-format";
import * as viem from "viem";
import { sepolia } from "viem/chains";

import { loader as sourceLoader } from "./load-source.mjs";
import { runtimeStubs } from "./runtime-fixture.mjs";
const loader = (stubs = {}, globals) => sourceLoader({ ...runtimeStubs(), ...stubs }, globals);
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const globals = { Error, crypto: globalThis.crypto, window: {} };
const load = loader(
  { "@midnightntwrk/wallet-sdk-address-format": addressFormat, "@midnightntwrk/ledger-v9": ledger },
  globals,
);
const { SeedWallet: EvmSeedWallet } = load("@/lib/evm/wallet/SeedWallet");
const { BrowserWallet: EvmBrowserWallet } = load("@/lib/evm/wallet/BrowserWallet");
const account = "0x022b971dFF0C43305e691DEd7a14367AF19D6407";
const seed = "000102030405060708090a0b0c0d0e0f";
const token = "0x" + "12".repeat(20),
  destination = "0x" + "34".repeat(20),
  hash = "0x" + "56".repeat(32),
  units = 7n;
const data = viem.encodeFunctionData({
  abi: viem.erc20Abi,
  functionName: "transfer",
  args: [destination, units],
});
let mode = "valid";
const rpc = {
  getChainId: async () => sepolia.id,
  readContract: async () => units,
  getBalance: async () => 2n,
  estimateGas: async () => 1n,
  getGasPrice: async () => 1n,
  waitForTransactionReceipt: async () => ({
    status: mode === "revert" ? "reverted" : "success",
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
    from: account,
    to: token,
    input: mode === "changed" ? "0x" : data,
    value: 0n,
  }),
};
const provider = {
  on() {},
  removeListener() {},
  request: async ({ method }) =>
    method === "eth_chainId" ? "0xaa36a7" : method === "eth_sendTransaction" ? hash : [account],
};
for (const wallet of [
  new EvmSeedWallet(sepolia, rpc, "http://fixture.invalid", seed),
  new EvmBrowserWallet(sepolia, rpc, { name: "Fixture browser", provider }, () => {}),
]) {
  await wallet.connect();
  assert.equal(wallet.account, account);
  assert.equal(wallet.id, account);
  if (wallet.kind === "seed") wallet.client.writeContract = async () => hash;
  mode = "valid";
  assert.equal(
    (await wallet.transferErc20({ token, destination, units, submitted() {} })).hash,
    hash,
  );
  mode = "changed";
  await assert.rejects(
    wallet.transferErc20({ token, destination, units, submitted() {} }),
    /replaced or cancelled/,
  );
  mode = "revert";
  await assert.rejects(
    wallet.transferErc20({ token, destination, units, submitted() {} }),
    /reverted/,
  );
  wallet.disconnect();
  assert.throws(() => wallet.account, /session changed/);
}
for (const invalid of ["", "aa", "zz".repeat(16), "a".repeat(33), "aa".repeat(65)])
  await assert.rejects(
    new EvmSeedWallet(sepolia, rpc, "http://fixture.invalid", invalid).connect(),
    /hexadecimal/,
  );
console.log(
  "PASS both EVM adapters share generic transfer, receipt and invalidation fixtures, fixed BIP44 vector and invalid seed rejection",
);

const { BrowserWallet, discoverBrowserWallets } = load("@/lib/midnight/wallet/BrowserWallet");
const { createMidnightChainConfig } = load("@/lib/config/midnight");
const config = createMidnightChainConfig({ proofServerUrl: "http://127.0.0.1:6399" });
const cpk = addressFormat.ShieldedCoinPublicKey.fromHexString("01".repeat(32));
const epk = addressFormat.ShieldedEncryptionPublicKey.fromHexString("02".repeat(32));
const shieldedAddress = addressFormat.MidnightBech32m.encode(
  "undeployed",
  new addressFormat.ShieldedAddress(cpk, epk),
).toString();
const addresses = {
  shieldedAddress,
  shieldedCoinPublicKey: addressFormat.ShieldedCoinPublicKey.codec
    .encode("undeployed", cpk)
    .toString(),
  shieldedEncryptionPublicKey: addressFormat.ShieldedEncryptionPublicKey.codec
    .encode("undeployed", epk)
    .toString(),
};
const tx = ledger.Transaction.fromParts(
  "undeployed",
  undefined,
  undefined,
  ledger.Intent.new(new Date("2030-01-01")),
).mockProve();
let calls = [],
  status = { status: "connected", networkId: "undeployed" },
  balanceGate;
const api = {
  getConfiguration: async () =>
    Object.defineProperty(
      {
        networkId: "undeployed",
        indexerUri: config.indexerUrl,
        indexerWsUri: config.indexerWsUrl,
        substrateNodeUri: config.nodeUrl,
      },
      "proverServerUri",
      {
        get() {
          throw new Error("The adapter must use the configured proof server");
        },
      },
    ),
  getShieldedAddresses: async () => addresses,
  getUnshieldedAddress: async () => ({ unshieldedAddress: "public-recipient" }),
  getConnectionStatus: async () => status,
  getShieldedBalances: async () => (balanceGate ? balanceGate.promise : { token: 7n }),
  getUnshieldedBalances: async () => ({ night: 8n }),
  getDustBalance: async () => ({ balance: 9n, cap: 10n }),
  balanceUnsealedTransaction: async (serialised) => {
    calls.push(["balance", serialised]);
    return { tx: Buffer.from(tx.serialize()).toString("hex") };
  },
  submitTransaction: async (serialised) => calls.push(["submit", serialised]),
};
const connector = {
  name: "Fixture Lace",
  icon: "data:image/png;base64,",
  rdns: "fixture.wallet",
  apiVersion: "4.0.1",
  connect: async (network) => {
    assert.equal(network, "undeployed");
    return api;
  },
};
globals.window.midnight = { "arbitrary-injection-key": connector, invalid: {} };
const [choice] = discoverBrowserWallets();
assert.equal(choice.key, "arbitrary-injection-key");
assert.equal(discoverBrowserWallets().length, 1);
const wallet = new BrowserWallet(choice, config);
await wallet.connect();
assert.equal(wallet.id, shieldedAddress);
assert.equal(wallet.configuration.proofServerUrl, "http://127.0.0.1:6399");
assert.equal(wallet.transactions.getCoinPublicKey(), cpk.toHexString());
assert.equal(await wallet.getDustBalance(), 9n);
assert.equal((await wallet.getShieldedBalances()).token, 7n);
assert.equal(wallet.ensureFeeReady, undefined);
assert.match(wallet.fundingUnavailable, /registration/);
assert.match(wallet.recoveryUnavailable, /extension/);
const balanced = await wallet.transactions.balanceTx(tx);
assert.deepEqual(balanced.serialize(), tx.serialize());
assert.equal(await wallet.transactions.submitTx(balanced), tx.identifiers()[0]);
assert.deepEqual(
  calls.map((v) => v[0]),
  ["balance", "submit"],
);
balanceGate = deferred();
const pending = wallet.getShieldedBalances();
await new Promise((resolve) => setTimeout(resolve, 0));
await wallet.disconnect();
balanceGate.resolve({ token: 100n });
await assert.rejects(pending, /session changed/);
assert.equal(wallet.transactions, undefined);
balanceGate = undefined;
const limited = new BrowserWallet(
  {
    ...choice,
    connector: {
      ...connector,
      connect: async () => ({ ...api, balanceUnsealedTransaction: undefined }),
    },
  },
  config,
);
await limited.connect();
assert.equal(limited.transactions, undefined);
assert.match(limited.transactionUnavailable, /balanceUnsealedTransaction/);
assert.equal(await limited.getDustBalance(), 9n);
await limited.disconnect();
const wrong = new BrowserWallet(
  {
    ...choice,
    connector: {
      ...connector,
      connect: async () => ({
        ...api,
        getConfiguration: async () => ({ ...(await api.getConfiguration()), networkId: "preprod" }),
      }),
    },
  },
  config,
);
await assert.rejects(wrong.connect(), /Switch/);
const rejected = new BrowserWallet(
  {
    ...choice,
    connector: {
      ...connector,
      connect: async () => {
        throw new Error("Rejected");
      },
    },
  },
  config,
);
await assert.rejects(rejected.connect(), /Rejected/);
const gate = deferred();
const late = new BrowserWallet(
  { ...choice, connector: { ...connector, connect: () => gate.promise } },
  config,
);
const connecting = late.connect();
await late.disconnect();
gate.resolve(api);
await assert.rejects(connecting, /session changed/);
assert.equal(late.transactions, undefined);
const changed = new BrowserWallet(choice, config);
await changed.connect();
status = { status: "connected", networkId: "preprod" };
await assert.rejects(changed.getDustBalance(), /network changed/);
assert.equal(changed.transactions, undefined);
console.log(
  "PASS controlled connector discovery, identity/key decoding, balances, ledger serialisation/submission, missing capability, rejection, wrong network and stale connect/balance handling",
);

const React = await import("react");
{
  const states = [],
    refs = [],
    effects = [];
  let si = 0,
    ri = 0;
  let seedGate;
  class SeedFixture {
    kind = "seed";
    async initialise() {
      if (seedGate) await seedGate.promise;
    }
    async disconnect() {
      this.stopped = true;
    }
  }
  const contextLoad = loader(
    {
      react: {
        ...React,
        useRef: (initial) => (refs[ri++] ??= { current: initial }),
        useState: (initial) => {
          const i = si++;
          if (!(i in states)) states[i] = initial;
          return [states[i], (v) => (states[i] = typeof v === "function" ? v(states[i]) : v)];
        },
        useEffect: (fn) => effects.push(fn),
      },
      "@/lib/config/midnight": { getMidnightChainConfig: () => config },
      "@/lib/midnight/wallet/BrowserWallet": { BrowserWallet },
      "@/lib/midnight/wallet/SeedWallet": { SeedWallet: SeedFixture },
    },
    { Error, indexedDB: { deleteDatabase: () => ({}) } },
  );
  const { MidnightWalletProvider } = contextLoad("@/providers/midnight-wallet-context");
  const view = () => {
    si = ri = 0;
    return MidnightWalletProvider({ children: null }).props.value;
  };
  const connectionGate = deferred();
  let connects = 0;
  const delayedChoice = {
    ...choice,
    connector: {
      ...connector,
      connect: () => {
        connects++;
        return connectionGate.promise;
      },
    },
  };
  const first = view().installBrowserWallet(delayedChoice);
  const rejectedFirst = first.catch((error) => error);
  assert.equal(view().installBrowserWallet(delayedChoice), first);
  assert.equal(view().connecting, true);
  await assert.rejects(view().installSeedWallet("invalid"), /hexadecimal/);
  assert.match(view().error, /hexadecimal/);
  assert.equal(view().installBrowserWallet(delayedChoice), first);
  assert.equal(view().error, null);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(connects, 1);
  const generation = view().session;
  const seedWallet = await view().installSeedWallet(seed);
  connectionGate.resolve(api);
  assert.match((await rejectedFirst).message, /session changed|superseded/);
  assert.equal(view().wallet, seedWallet);
  assert.ok(view().session > generation);
  status = { status: "connected", networkId: "undeployed" };
  await view().installBrowserWallet(choice);
  assert.equal(seedWallet.stopped, true);
  await assert.rejects(view().rebuild(), /extension/);
  assert.equal(view().wallet.kind, "browser");
  view().disconnect();
  assert.equal(view().wallet, null);
  for (const nextStatus of [
    { status: "disconnected" },
    { status: "connected", networkId: "preprod" },
  ]) {
    status = { status: "connected", networkId: "undeployed" };
    await view().installBrowserWallet(choice);
    const connected = view().wallet;
    status = nextStatus;
    await assert.rejects(connected.getDustBalance(), /network changed/);
    assert.equal(view().wallet, null);
    assert.match(view().error, /Reconnect/);
    const uiLoad = loader({
      "@/providers/midnight-wallet-context": { useMidnightConnection: view },
      "@/providers/vault-context": { useVault: () => ({ status: "disconnected" }) },
      "./wallet-menu": {
        WalletMenu: (props) =>
          React.createElement(
            "div",
            null,
            props.error,
            props.wallet ? "connected" : "not connected",
          ),
      },
      "./vault-identity-button": { VaultIdentityButton: () => null },
      "@/lib/midnight/wallet/BrowserWallet": { discoverBrowserWallets: () => [] },
    });
    const { MidnightWalletButton } = uiLoad("@/components/midnight-wallet-button");
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(React.createElement(MidnightWalletButton));
    assert.match(html, /Reconnect the wallet/);
    assert.match(html, /not connected/);
  }
  await assert.rejects(view().installSeedWallet("invalid"), /hexadecimal/);
  assert.match(view().error, /hexadecimal Midnight seed/);
  status = { status: "connected", networkId: "undeployed" };
  await assert.rejects(
    view().installBrowserWallet({
      ...choice,
      connector: {
        ...connector,
        connect: async () => {
          throw new Error("Fixture approval rejected");
        },
      },
    }),
    /Fixture approval rejected/,
  );
  assert.equal(view().wallet, null);
  assert.match(view().error, /Fixture approval rejected/);
  await view().installBrowserWallet(choice);
  assert.equal(view().error, null);
  assert.equal(view().wallet.kind, "browser");
  view().disconnect();
  seedGate = deferred();
  const pendingSeed = view().installSeedWallet(seed);
  await assert.rejects(view().installSeedWallet("invalid"), /hexadecimal/);
  assert.match(view().error, /hexadecimal/);
  assert.equal(view().installSeedWallet(seed), pendingSeed);
  assert.equal(view().error, null);
  seedGate.resolve();
  const activeSeed = await pendingSeed;
  seedGate = undefined;
  await assert.rejects(view().installSeedWallet("invalid"), /hexadecimal/);
  assert.match(view().error, /hexadecimal/);
  assert.equal(await view().installSeedWallet(seed), activeSeed);
  assert.equal(view().error, null);
  view().disconnect();
  console.log("PASS invalid seed feedback clears on matching pending and active seed retries");
  console.log("PASS connection rejection is shared owner feedback and successful retry clears it");
  console.log(
    "PASS actual context invalidation discards disconnected/wrong-network browser and wallet control renders actionable error",
  );
  console.log(
    "PASS Midnight context connector deduplication, immediate pending state, browser-to-seed replacement, session ownership and browser recovery without seed substitution",
  );
}
{
  let code = "0xab";
  const assembly = loader(
    {
      "./evm": { sepolia, getEvmChainConfig: () => ({ rpcUrl: "http://fixture.invalid" }) },
      "@/lib/rpc": { getEthereumProvider: () => ({ ...rpc, getCode: async () => code }) },
    },
    {
      ...globals,
      process: {
        env: {
          NEXT_PUBLIC_MIDNIGHT_NETWORK_ID: "undeployed",
          NEXT_PUBLIC_LOCAL_EVM_MARKER_ADDRESS: token,
          NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE: "0xab",
        },
      },
    },
  );
  const { seedWalletConnection } = assembly("@/lib/config/evm-wallet");
  const wallet = seedWalletConnection(seed).create(() => {});
  await wallet.connect();
  code = "0xcd";
  await assert.rejects(wallet.verify(), /fork marker/);
  wallet.disconnect();
  console.log(
    "PASS seed application assembly rejects a changed local fork with unchanged chain ID",
  );
}
const fs = await import("node:fs");
const adapterPaths = [
  "src/lib/evm/wallet/SeedWallet.ts",
  "src/lib/evm/wallet/BrowserWallet.ts",
  "src/lib/midnight/wallet/SeedWallet.ts",
  "src/lib/midnight/wallet/BrowserWallet.ts",
];
assert.ok(adapterPaths.length > 0);
for (const path of adapterPaths)
  assert.doesNotMatch(
    fs.readFileSync(path, "utf8"),
    /localStorage|sessionStorage|console\.(log|info|debug)/,
    `Secret and connector ownership guard: ${path}`,
  );
console.log("PASS non-empty adapter persistence and logging guard");
{
  const { renderToString } = await import("react-dom/server");
  const limitedWallet = {
    transactionUnavailable: "Fixture transaction capability unavailable.",
    fundingUnavailable: "Fixture registration unavailable.",
    getDustBalance: async () => 100000000000000000000n,
    getUnshieldedBalances: async () => ({}),
  };
  const queryResult = {
    isSuccess: true,
    isError: false,
    data: { dust: 100000000000000000000n },
    refetch: async () => {},
  };
  const contextLoad = loader({
    react: { ...React, useRef: (initial) => ({ current: initial }), useEffect() {} },
    "@tanstack/react-query": {
      useQuery: (options) =>
        options.queryKey[0] === "midnight-readiness" ? queryResult : { data: true },
      useMutation: (options) => ({ mutateAsync: options.mutationFn, reset() {} }),
    },
    "./midnight-wallet-context": {
      useMidnightConnection: () => ({ wallet: limitedWallet, session: 1, isCurrent: () => true }),
    },
  });
  const { WalletReadinessProvider } = contextLoad("@/providers/wallet-readiness-context");
  const readiness = WalletReadinessProvider({ children: null }).props.value;
  assert.equal(readiness.resourcesReady, true);
  assert.equal(readiness.ready, false);
  await assert.rejects(readiness.requireReady(), /capability unavailable/);
  await assert.rejects(readiness.fund(), /registration unavailable/);
  const uiLoad = loader({
    "@/providers/wallet-readiness-context": { useWalletReadiness: () => readiness },
    "@/providers/evm-wallet-context": { useEvmWallet: () => ({ wallet: null }) },
    "@/providers/evm-local-funding-context": {
      useEvmLocalFunding: () => ({ funding: {}, ready: true }),
    },
    "@/providers/evm-balances-context": { useEvmBalances: () => ({}) },
    "./ui/button": { Button: (props) => React.createElement("button", props) },
  });
  const { LocalWalletFunding } = uiLoad("@/components/local-wallet-funding");
  const rendered = renderToString(React.createElement(LocalWalletFunding));
  assert.match(rendered, /capability unavailable/);
  assert.doesNotMatch(rendered, /Fund the connected wallets/);
  console.log(
    "PASS actual readiness capability guard and rendered unsupported state remain distinct from sufficient DUST and disconnected state",
  );
}
{
  status = { status: "connected", networkId: "undeployed" };
  for (const method of ["balanceUnsealedTransaction", "submitTransaction"]) {
    const gate = deferred();
    const pendingApi = { ...api, [method]: () => gate.promise };
    const wallet = new BrowserWallet(
      { ...choice, connector: { ...connector, connect: async () => pendingApi } },
      config,
    );
    await wallet.connect();
    const pending =
      method === "submitTransaction"
        ? wallet.transactions.submitTx(tx)
        : wallet.transactions.balanceTx(tx);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wallet.disconnect();
    gate.resolve({ tx: Buffer.from(tx.serialize()).toString("hex") });
    await assert.rejects(pending, /session changed/);
    assert.equal(wallet.transactions, undefined);
  }
  console.log(
    "PASS connector balancing and submission late completions cannot publish through a disconnected adapter",
  );
}

{
  const { getNetworkId, setNetworkId } = load("@midnight-ntwrk/midnight-js/network-id");
  const preprodConfig = { ...config, networkId: "preprod" };
  const preprodApi = {
    ...api,
    getConfiguration: async () => ({ ...(await api.getConfiguration()), networkId: "preprod" }),
    getShieldedAddresses: async () => ({
      ...addresses,
      shieldedCoinPublicKey: addressFormat.ShieldedCoinPublicKey.codec
        .encode("preprod", cpk)
        .toString(),
      shieldedEncryptionPublicKey: addressFormat.ShieldedEncryptionPublicKey.codec
        .encode("preprod", epk)
        .toString(),
    }),
  };
  const wallet = new BrowserWallet(
    { ...choice, connector: { ...connector, connect: async () => preprodApi } },
    preprodConfig,
  );
  await wallet.connect();
  assert.equal(getNetworkId(), "preprod");
  await wallet.disconnect();
  setNetworkId("undeployed");
  console.log("PASS browser-first deployed network initialises the installed contract SDK network");
}
