/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const cap = require('./chromium-post-data-cap.cjs');
const modules = path.resolve(__dirname, '../../node_modules');
const core = path.join(modules, 'playwright-core');
const mcp = path.join(modules, '@playwright/mcp');
const coreVersion = JSON.parse(
  fs.readFileSync(path.join(core, 'package.json'), 'utf8'),
).version;
const mcpVersion = JSON.parse(
  fs.readFileSync(path.join(mcp, 'package.json'), 'utf8'),
).version;
if (mcpVersion !== '0.0.80')
  throw new Error('Local vault launcher requires @playwright/mcp 0.0.80');
cap.patchSource(
  fs.readFileSync(path.join(core, 'lib/coreBundle.js'), 'utf8'),
  coreVersion,
);
require(path.join(mcp, 'cli.js'));
cap.assertApplied();
