/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const compile = Module.prototype._compile;
let applied = false;
const testedVersion = '1.63.0-alpha-2026-08-31';
function patchSource(source, version) {
  if (version !== testedVersion)
    throw new Error(
      'Local vault Chromium network cap requires the tested Playwright version',
    );
  const needle =
    'this._sessions.set(session2, sessionInfo);\n        await Promise.all([\n          session2.send("Network.enable"),';
  if (source.split(needle).length !== 2)
    throw new Error('Local vault Chromium network cap source shape mismatch');
  return source.replace(
    needle,
    needle.replace(
      'session2.send("Network.enable")',
      'session2.send("Network.enable", { maxPostDataSize: 1 })',
    ),
  );
}
Module.prototype._compile = function (source, filename) {
  if (filename.endsWith('/playwright-core/lib/coreBundle.js')) {
    const version = JSON.parse(
      fs.readFileSync(
        path.resolve(path.dirname(filename), '../package.json'),
        'utf8',
      ),
    ).version;
    source = patchSource(source, version);
    applied = true;
    Module.prototype._compile = compile;
    process.stderr.write(
      'local-vault: Chromium Network.enable post-data cap applied\n',
    );
  }
  return compile.call(this, source, filename);
};
module.exports = {
  patchSource,
  assertApplied() {
    if (!applied)
      throw new Error('Local vault Chromium network cap was not applied');
  },
};
