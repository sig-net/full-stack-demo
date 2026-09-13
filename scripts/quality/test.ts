import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const tests = [
  "scripts/local-vault/chromium-post-data-cap.test.mjs",
  "scripts/local-vault/transport-preflight.test.mjs",
  ...["01", "05", "06", "07", "09", "11-funding", "13", "14", "15"].map(
    (name) => `scratch-refactor-tasks/verification/task${name}.mjs`,
  ),
];
assert(tests.length > 0, "Isolated regression inventory must be non-empty");
const maintained = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run"], {
  stdio: "inherit",
  timeout: 120_000,
});
let failed = maintained.status !== 0 || maintained.error ? 1 : 0;
for (const file of tests) {
  const result = spawnSync(process.execPath, [file], { stdio: "inherit", timeout: 120_000 });
  if (result.status !== 0 || result.error) {
    console.error(`FAILED: ${file}`);
    failed++;
  }
}
assert.equal(failed, 0, `${failed.toString()} isolated regression files failed`);
console.log(`${tests.length.toString()} isolated regression files passed`);
