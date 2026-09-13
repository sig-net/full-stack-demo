import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const root = process.cwd();
const localRequire = createRequire(path.join(root, "package.json"));
const ts = localRequire("typescript");
export function loader(stubs = {}, globals = {}) {
  const cache = new Map();
  function packageImportPath(name) {
    const resolved = import.meta.resolve(name);
    return resolved.startsWith("file:") ? fileURLToPath(resolved) : undefined;
  }
  function loadFile(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    vm.runInNewContext(
      `(function(require,module,exports){${output}\n})`,
      { console, process, Buffer, setTimeout, clearTimeout, URL, fetch, ...globals },
      { filename: file },
    )((n) => load(n, file), loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  function load(name, parent = path.join(root, "src/entry.ts")) {
    if (name in stubs) return stubs[name];
    if (!name.startsWith(".") && !name.startsWith("@/") && !path.isAbsolute(name)) {
      try {
        return localRequire(name);
      } catch (error) {
        const importFile = error.code === "MODULE_NOT_FOUND" ? packageImportPath(name) : undefined;
        if (!importFile) throw error;
        return localRequire(importFile);
      }
    }
    const base = name.startsWith("@/")
      ? path.join(root, "src", name.slice(2))
      : path.resolve(path.dirname(parent), name);
    const file = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
      (p) => fs.existsSync(p) && fs.statSync(p).isFile(),
    );
    assert.ok(file, `Resolve ${name}`);
    return loadFile(file);
  }
  return load;
}
