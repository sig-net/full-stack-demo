import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { parseZkArtifactManifest } from "@midnight-ntwrk/midnight-js/utils";
import { expect, it } from "vitest";

it("verifies and atomically promotes small complete assets using the real SDK and preparation script", async () => {
  const root = await mkdtemp(join(tmpdir(), "vault-assets-test-"));
  const write = async (relative: string, bytes: string | Uint8Array): Promise<void> => {
    const path = join(root, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  };
  try {
    await write("package.json", JSON.stringify({ type: "module" }));
    await mkdir(join(root, "node_modules"), { recursive: true });
    await symlink(
      resolve("node_modules/@midnight-ntwrk"),
      join(root, "node_modules/@midnight-ntwrk"),
      "dir",
    );
    let manifests = 0;
    for (const [child, packageName, exported] of [
      [
        "",
        "midnight-examples-erc20-vault-contract",
        "managed/erc20-vault/compiler/contract-manifest.json",
      ],
      ["signet", "midnight-contract", "managed/compiler/contract-manifest.json"],
    ] as const) {
      const bytes = Buffer.from(`${child || "vault"} controlled proving bytes`);
      const entry = {
        type: "file",
        size: bytes.length,
        hash: createHash("sha256").update(bytes).digest("hex"),
      };
      const manifest = JSON.stringify({
        "manifest-version": "1",
        "compiler-version": "0.33.0",
        "language-version": "0.25.0",
        "runtime-version": "0.18.0-rc.1",
        compiler: { type: "directory", "contract-info.json": entry },
        keys: { type: "directory", "fixture.prover": entry, "fixture.verifier": entry },
        zkir: { type: "directory", "fixture.bzkir": entry },
      });
      const parsed = parseZkArtifactManifest(manifest);
      expect(parsed.files.size).toBe(4);
      for (const path of parsed.files.keys()) await write(join("source", child, path), bytes);
      await write(join("source", child, "compiler/contract-manifest.json"), manifest);
      const packageRoot = `node_modules/@sig-net/${packageName}`;
      await write(
        `${packageRoot}/package.json`,
        JSON.stringify({
          name: `@sig-net/${packageName}`,
          type: "module",
          exports: { [`./${exported}`]: `./${exported}` },
        }),
      );
      await write(`${packageRoot}/${exported}`, manifest);
      manifests += 1;
    }
    expect(manifests).toBe(2);
    const script = "scripts/prepare-zk-assets.mjs";
    const hashes = "scripts/zk-manifest-hashes.ts";
    const harness = "tests/assets/fixtures/staging.ts";
    for (const relative of [script, hashes, harness]) {
      await mkdir(dirname(join(root, relative)), { recursive: true });
      await copyFile(relative, join(root, relative));
      expect(await readFile(join(root, relative))).toStrictEqual(await readFile(relative));
    }
    const result = spawnSync(process.execPath, [harness], {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
    });
    expect(result.error).toBeUndefined();
    expect({ status: result.status, stderr: result.stderr }).toStrictEqual({
      status: 0,
      stderr: "",
    });
    expect(result.stdout).toContain(
      "Controlled asset corruption, preservation, replacement, reuse, parked recovery and lock checks passed",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
