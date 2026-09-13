import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { NextRequest } from "next/server.js";
import ts from "typescript";

const loaded = new Set<string>();
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/server") return next("next/server.js", context);
    if (specifier.startsWith("@/"))
      specifier = pathToFileURL(resolve("src", specifier.slice(2))).href;
    if (
      (specifier.startsWith(".") || specifier.startsWith("file:")) &&
      context.parentURL?.includes("/src/")
    ) {
      const candidate = new URL(specifier, context.parentURL);
      if (!candidate.pathname.endsWith(".ts") && existsSync(fileURLToPath(candidate) + ".ts"))
        specifier = candidate.href + ".ts";
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    loaded.add(url);
    if (url.endsWith(".ts") && url.includes("/src/"))
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
      };
    return next(url, context);
  },
});
try {
  const route = await import("../../src/app/api/midnight/gas-topup/route.ts");
  const response = await route.POST(
    new NextRequest("https://app.example.invalid/api/midnight/gas-topup", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(response.status, 400);
  assert(loaded.size > 0, "Server runtime import census must be non-empty");
  assert(
    [...loaded].some((url) => /onchain.*wasm/.test(url)),
    "Server route must exercise the installed ledger WASM import",
  );
  assert(
    ![...loaded].some((url) => /src\/lib\/midnight\/(?:wallet\/|vault\.|seedlib\.)/.test(url)),
    "Server route must keep browser wallet and vault assembly outside its runtime graph",
  );
  console.log(
    `Server route imported ${loaded.size.toString()} modules with ledger WASM and without browser assembly`,
  );
} finally {
  hooks.deregister();
}
