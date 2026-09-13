/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  rmSync,
} = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const script = resolve(__dirname, 'transport-preflight.cjs');
const unknown = spawnSync(process.execPath, [script, 'unrecognised'], {
  encoding: 'utf8',
});
assert.notEqual(unknown.status, 0);
assert.match(unknown.stderr, /accepts no arguments/);
assert.equal(unknown.stdout, '');
const fixture = mkdtempSync(join(tmpdir(), 'local-vault-preflight-guard-'));
try {
  mkdirSync(join(fixture, 'scripts/local-vault'), { recursive: true });
  mkdirSync(join(fixture, 'public/zk/keys'), { recursive: true });
  const copy = join(fixture, 'scripts/local-vault/transport-preflight.cjs');
  copyFileSync(script, copy);
  writeFileSync(
    join(fixture, 'public/zk/keys/completeDeposit.prover'),
    'invalid-small-key',
  );
  const small = spawnSync(process.execPath, [copy], { encoding: 'utf8' });
  assert.notEqual(small.status, 0);
  assert.match(small.stderr, /requires the full public proving key/);
  assert.equal(small.stdout, '');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
console.log(
  'PASS: unknown arguments and a truncated proving key reject before browser startup',
);
