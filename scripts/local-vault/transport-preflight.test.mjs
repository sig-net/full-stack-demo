import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const script = resolve(import.meta.dirname, "transport-preflight.ts");
const unrecognised = spawnSync(process.execPath, [script, "unrecognised"], {
  encoding: "utf8",
});
assert.notEqual(unrecognised.status, 0);
assert.match(unrecognised.stderr, /accepts no arguments/);
assert.equal(unrecognised.stdout, "");
const fixture = mkdtempSync(join(tmpdir(), "local-vault-preflight-guard-"));
try {
  mkdirSync(join(fixture, "scripts/local-vault"), { recursive: true });
  mkdirSync(join(fixture, "public/zk/keys"), { recursive: true });
  const copy = join(fixture, "scripts/local-vault/transport-preflight.ts");
  copyFileSync(script, copy);
  writeFileSync(join(fixture, "public/zk/keys/completeDeposit.prover"), "invalid-small-key");
  const small = spawnSync(process.execPath, [copy], { encoding: "utf8" });
  assert.notEqual(small.status, 0);
  assert.match(small.stderr, /requires the full public proving key/);
  assert.equal(small.stdout, "");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
console.log("PASS: unknown arguments and a truncated proving key reject before browser startup");
