import assert from "node:assert/strict";

import { loader } from "./load-source.mjs";
const load = loader();
const react = load("react");
const { createVaultPrivateStateProvider } = load("@/lib/midnight/vault-private-state");
const id = "vaultPrivateState";
const state = { secretKey: new Uint8Array(32).fill(6) };
const provider = createVaultPrivateStateProvider();
await assert.rejects(provider.get(id), /address first/);
provider.setContractAddress("a");
await provider.set(id, state);
state.secretKey[0] = 9;
assert.equal((await provider.get(id)).secretKey[0], 6);
const read = await provider.get(id);
read.secretKey[0] = 7;
assert.equal((await provider.get(id)).secretKey[0], 6);
provider.setContractAddress("b");
assert.equal(await provider.get(id), null);
await provider.set(id, state);
await provider.remove(id);
assert.equal(await provider.get(id), null);
provider.setContractAddress("a");
assert.ok(await provider.get(id));
await provider.clear();
assert.equal(await provider.get(id), null);
await provider.setSigningKey("a", "key");
assert.equal(await provider.getSigningKey("a"), "key");
assert.equal(await provider.getSigningKey("b"), null);
await provider.removeSigningKey("a");
assert.equal(await provider.getSigningKey("a"), null);
await provider.setSigningKey("a", "key");
await provider.clearSigningKeys();
assert.equal(await provider.getSigningKey("a"), null);
for (const method of [
  "exportPrivateStates",
  "importPrivateStates",
  "exportSigningKeys",
  "importSigningKeys",
])
  await assert.rejects(provider[method](), /copy and paste/);
provider.dispose();
provider.dispose();
await assert.rejects(provider.set(id, state), /disposed/);
await assert.rejects(provider.get(id), /disposed/);
assert.throws(() => provider.setContractAddress("a"), /disposed/);
console.log(
  "PASS typed memory provider scoping, clones, CRUD, signing keys, unsupported encrypted backups and irreversible disposal",
);

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function hooks() {
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
      useEffect(fn, deps) {
        const i = ei++;
        if (!effects[i] || deps.some((x, j) => x !== effects[i].deps[j])) {
          pending.push(() => {
            effects[i]?.cleanup?.();
            effects[i] = { deps, cleanup: fn() };
          });
        }
      },
    },
    render(fn) {
      si = 0;
      ri = 0;
      ei = 0;
      const result = fn();
      const work = pending;
      pending = [];
      work.forEach((fn) => fn());
      return result;
    },
    cleanup() {
      effects.forEach((effect) => effect?.cleanup?.());
    },
  };
}
const turns = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const a = "06".repeat(32),
  b = "07".repeat(32);
// Vault lifecycle fixtures execute in task07.mjs with the typed query owner.
for (const mode of ["modern", "modern-failure", "fallback", "fallback-false", "fallback-throw"]) {
  const h = hooks();
  let present = false,
    value = "",
    removed = 0;
  const textarea = {
    style: {},
    setAttribute() {},
    focus() {},
    select() {},
    setSelectionRange() {},
    set value(v) {
      value = v;
    },
    get value() {
      return value;
    },
    remove() {
      present = false;
      removed++;
    },
  };
  const f = loader(
    { react: h.react },
    {
      navigator: {
        userAgent: "fixture",
        clipboard: mode.startsWith("modern")
          ? {
              writeText: async (text) => {
                assert.equal(text, a);
                if (mode === "modern-failure") throw new Error("denied");
              },
            }
          : undefined,
      },
      window: { isSecureContext: true },
      document: {
        createElement: () => textarea,
        body: {
          appendChild() {
            present = true;
          },
        },
        execCommand() {
          if (mode === "fallback-throw") throw new Error("denied");
          return mode !== "fallback-false";
        },
      },
      setTimeout: () => 0,
    },
  );
  const { useCopyToClipboard } = f("@/hooks/use-copy-to-clipboard");
  const render = () => h.render(() => useCopyToClipboard());
  await render().copyToClipboard(a);
  const result = render();
  assert.equal(result.isCopied, mode === "modern");
  assert.equal(!!result.error, mode !== "modern");
  assert.equal(present, false);
  assert.equal(value, "");
  assert.equal(removed, 0);
  console.log(`PASS clipboard ${mode} feedback and transient DOM cleanup`);
}
{
  const h = hooks(),
    writes = [];
  const f = loader(
    { react: h.react },
    {
      navigator: {
        clipboard: {
          writeText() {
            const wait = deferred();
            writes.push(wait);
            return wait.promise;
          },
        },
      },
      window: { isSecureContext: true },
      setTimeout: () => 0,
    },
  );
  const { useCopyToClipboard } = f("@/hooks/use-copy-to-clipboard");
  const render = () => h.render(() => useCopyToClipboard());
  const first = render().copyToClipboard(a);
  render().reset();
  const second = render().copyToClipboard(b);
  assert.equal(render().isCopied, false);
  writes[0].resolve();
  await first;
  assert.equal(render().isCopied, false);
  writes[1].reject(new Error("denied"));
  await second;
  assert.equal(render().isCopied, false);
  assert.ok(render().error);
  const third = render().copyToClipboard(a);
  writes[2].resolve();
  await third;
  assert.equal(render().isCopied, true);
  const fourth = render().copyToClipboard(b);
  assert.equal(render().isCopied, false);
  render().reset();
  writes[3].resolve();
  await fourth;
  assert.equal(render().isCopied, false);
  assert.equal(render().error, null);
  h.cleanup();
  console.log(
    "PASS deferred clipboard request replacement, generation reset, pending feedback and late success/failure isolation",
  );
}
{
  const actual = loader({}, { TextDecoder, TextEncoder, crypto: globalThis.crypto });
  const vault = actual("@/lib/midnight/vault");
  const { secp256k1 } = actual("@noble/curves/secp256k1");
  const env = {
    pathRendering: "utf8",
    assertActive() {},
    contractAddress: "12".repeat(32),
    mpcSecpPub:
      "0x" + Buffer.from(secp256k1.getPublicKey(new Uint8Array(32).fill(1))).toString("hex"),
  };
  const first = vault.deriveIdentity(new Uint8Array(32).fill(6));
  const second = vault.deriveIdentity(new Uint8Array(32).fill(6));
  const other = vault.deriveIdentity(new Uint8Array(32).fill(7));
  assert.deepEqual(first.commitment, second.commitment);
  assert.equal(first.commitment.length, 32);
  assert.equal(vault.depositAddress(env, first), vault.depositAddress(env, second));
  assert.notEqual(vault.depositAddress(env, first), vault.depositAddress(env, other));
  const contract = await import("@sig-net/midnight-examples-erc20-vault-contract");
  const privateState = contract.createVaultPrivateState(first.secretKey);
  const witnessed = contract.witnesses.callerSecretKey({ privateState });
  assert.deepEqual(witnessed[1], first.secretKey);
  assert.deepEqual(
    Buffer.from(contract.pureCircuits.userCommitment(witnessed[1])),
    Buffer.from(first.commitment),
  );
  console.log(
    "PASS actual installed contract witness, commitment and app deposit-address derivation are deterministic for the independent secret",
  );
}
{
  const { readFileSync } = await import("node:fs");
  const sources = [
    "src/lib/midnight/vault-private-state.ts",
    "src/components/vault-identity-button.tsx",
    "src/providers/vault-context.tsx",
    "src/lib/midnight/vault-session.ts",
  ];
  assert.ok(sources.length > 0);
  for (const source of sources) {
    const text = readFileSync(source, "utf8");
    assert.ok(text.length > 0);
    assert.doesNotMatch(
      text,
      /localStorage|sessionStorage|indexedDB|document\.cookie|levelPrivateStateProvider|identityFromSeed|erc20-vault:identity/,
    );
  }
  console.log(
    "PASS non-empty identity source census excludes persistent stores and seed-derived identity bridge",
  );
}
{
  const h = hooks(),
    wait = deferred(),
    errors = [];
  const f = loader({
    react: h.react,
    sonner: { toast: { error: (value) => errors.push(value) } },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/dialog": {
      Dialog: "dialog",
      DialogContent: "div",
      DialogHeader: "header",
      DialogTitle: "h2",
      DialogDescription: "p",
    },
    "./vault-identity-button": { VaultIdentityButton: "identity" },
    "./wallet-menu": { WalletMenu: "menu" },
    "@/lib/midnight/wallet/BrowserWallet": { discoverBrowserWallets: () => [] },
    "@/providers/vault-context": { useVault: () => ({ disconnect() {} }) },
    "@/providers/midnight-wallet-context": {
      useMidnightConnection: () => ({
        installSeedWallet: () => wait.promise,
        getGeneration: () => 0,
      }),
    },
  });
  const { MidnightWalletButton } = f("@/components/midnight-wallet-button");
  const tree = h.render(() => MidnightWalletButton());
  assert.equal(tree.type, "menu");
  tree.props.installSeed("invalid");
  h.cleanup();
  wait.reject(new Error("cancelled"));
  await turns();
  assert.equal(errors.length, 0);
  console.log("PASS wallet button unmount invalidates pending connection error feedback");
}
