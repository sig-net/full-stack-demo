/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { patchSource, assertApplied } = require('./chromium-post-data-cap.cjs');
const source = fs.readFileSync(
  require('node:path').resolve(
    __dirname,
    '../../node_modules/playwright-core/lib/coreBundle.js',
  ),
  'utf8',
);
assert.ok(source.length > 0);
assert.throws(
  () => patchSource(source, 'wrong-version'),
  /tested Playwright version/,
);
assert.throws(
  () =>
    patchSource(
      source.replaceAll('Network.enable', 'Network.changed'),
      '1.63.0-alpha-2026-08-31',
    ),
  /source shape mismatch/,
);
assert.throws(
  () => patchSource(source + source, '1.63.0-alpha-2026-08-31'),
  /source shape mismatch/,
);
assert.throws(() => assertApplied(), /was not applied/);
const patched = patchSource(source, '1.63.0-alpha-2026-08-31');
assert.equal(
  patched.split('session2.send("Network.enable", { maxPostDataSize: 1 })')
    .length,
  2,
);
console.log(
  'PASS: wrong version, absent source, duplicated source and missing application reject. Tested source patches exactly once.',
);
