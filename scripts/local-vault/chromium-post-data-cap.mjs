import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

import { z } from "zod";

const testedVersion = "1.63.0-alpha-2026-08-31";
const bundleUrl = import.meta.resolve("playwright-core/lib/coreBundle");
const packageUrl = import.meta.resolve("playwright-core/package.json");
const { version: installedVersion } = z
  .object({ version: z.literal(testedVersion) })
  .parse(JSON.parse(readFileSync(new URL(packageUrl), "utf8")));
let applied = false;

/**
 * Caps Chromium request-body capture at the tested session initialisation call.
 * @param {string} source - Installed Playwright bundle text.
 * @param {string} installedVersion - Installed package version paired with that bundle.
 * @returns {string} Bundle retaining one bounded Network.enable call.
 * @throws {Error} If version or source shape differs from the verified patch target.
 */
export function patchSource(source, installedVersion) {
  if (installedVersion !== testedVersion)
    throw new Error("Local vault Chromium network cap requires the tested Playwright version");
  const needle =
    'this._sessions.set(session2, sessionInfo);\n        await Promise.all([\n          session2.send("Network.enable"),';
  if (source.split(needle).length !== 2)
    throw new Error("Local vault Chromium network cap source shape mismatch");
  return source.replace(
    needle,
    needle.replace(
      'session2.send("Network.enable")',
      'session2.send("Network.enable", { maxPostDataSize: 1 })',
    ),
  );
}

const hooks = registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== bundleUrl) return loaded;
    const source = patchSource(readFileSync(new URL(url), "utf8"), installedVersion);
    applied = true;
    hooks.deregister();
    process.stderr.write("local-vault: Chromium Network.enable post-data cap applied\n");
    return { ...loaded, source };
  },
});

/**
 * Verifies that the launcher loaded its tested Chromium instrumentation hook.
 * @returns {void}
 * @throws {Error} If the Playwright bundle has not passed through the hook.
 */
export function assertApplied() {
  if (!applied) throw new Error("Local vault Chromium network cap was not applied");
}
