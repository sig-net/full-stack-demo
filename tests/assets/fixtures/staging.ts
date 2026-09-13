import assert from "node:assert/strict";
import { cp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { prepareAssetSet, verifyAssetSet } from "../../../scripts/prepare-zk-assets.mjs";

const source = resolve("source");
const destination = resolve("served");
const manifest = "compiler/contract-manifest.json";
await verifyAssetSet(source);
await cp(source, destination, { recursive: true });
const expected = await readFile(`${destination}/${manifest}`);
await assert.rejects(
  prepareAssetSet({
    source,
    destination,
    prepare: async (stage) => {
      await writeFile(`${stage}/signet/${manifest}`, "{}");
    },
  }),
  /signet assets failed verification/,
);
assert.deepEqual(await readFile(`${destination}/${manifest}`), expected);
await verifyAssetSet(destination);
await assert.rejects(
  prepareAssetSet({
    source,
    destination,
    prepare: async (stage) => {
      await rm(`${stage}/keys`, { recursive: true });
    },
  }),
  /vault assets failed verification/,
);
await verifyAssetSet(destination);
await assert.rejects(
  prepareAssetSet({
    source,
    destination,
    prepare: async (stage) => {
      await writeFile(`${stage}/signet/keys/fixture.prover`, "corrupt");
    },
  }),
  /signet assets failed verification/,
);
await verifyAssetSet(destination);
await prepareAssetSet({ source, destination, prepare: () => Promise.resolve() });
await verifyAssetSet(destination);
await prepareAssetSet({
  destination,
  prepare: () => Promise.reject(new Error("Unexpected preparation during reuse")),
});
await rename(destination, `${destination}.previous`);
await prepareAssetSet({
  destination,
  prepare: () => Promise.reject(new Error("Unexpected preparation during recovery")),
});
await verifyAssetSet(destination);
await writeFile(`${destination}.prepare.lock`, "controlled competing preparation");
await assert.rejects(prepareAssetSet({ source, destination }), /preparation is locked/);
await rm(`${destination}.prepare.lock`);
await verifyAssetSet(destination);
console.log(
  "Controlled asset corruption, preservation, replacement, reuse, parked recovery and lock checks passed",
);
