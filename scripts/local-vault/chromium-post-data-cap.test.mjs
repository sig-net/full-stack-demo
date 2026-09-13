import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { assertApplied, patchSource } from "./chromium-post-data-cap.mjs";
const source = readFileSync(new URL(import.meta.resolve("playwright-core/lib/coreBundle")), "utf8");
assert.ok(source.length > 0);
assert.throws(() => patchSource(source, "wrong-version"), /tested Playwright version/);
assert.throws(
  () =>
    patchSource(source.replaceAll("Network.enable", "Network.changed"), "1.63.0-alpha-2026-08-31"),
  /source shape mismatch/,
);
assert.throws(
  () => patchSource(source + source, "1.63.0-alpha-2026-08-31"),
  /source shape mismatch/,
);
assert.throws(() => {
  assertApplied();
}, /was not applied/);
const patched = patchSource(source, "1.63.0-alpha-2026-08-31");
assert.equal(patched.split('session2.send("Network.enable", { maxPostDataSize: 1 })').length, 2);
console.log(
  "PASS: wrong version, absent source, duplicated source and missing application reject. Tested source patches exactly once.",
);

await import("playwright-core");
assert.doesNotThrow(assertApplied);
