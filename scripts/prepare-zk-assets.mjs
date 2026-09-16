import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { cp, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  assertManifestHash,
  parseZkArtifactManifest,
  verifyZkArtifactIntegrity,
  ZK_MANIFEST_DIR,
  ZK_MANIFEST_FILE_NAME,
} from "@midnight-ntwrk/midnight-js/utils";

import { readZkManifestHashes, ZK_MANIFEST_SOURCES } from "./zk-manifest-hashes.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = `${ZK_MANIFEST_DIR}/${ZK_MANIFEST_FILE_NAME}`;
const pins = readZkManifestHashes();
const trees = ZK_MANIFEST_SOURCES.map(({ child, manifestUrl }) => ({
  child,
  manifestUrl,
  pin: child === "signet" ? pins.signet : pins.vault,
}));

/** @returns {void} */
function reportManifests() {
  for (const { child, pin } of trees)
    console.log(`${child || "vault"} ${manifestPath} sha256 = ${pin}`);
}

/**
 * @param {string} path - Filesystem entry to inspect.
 * @returns {Promise<boolean>} Whether the entry exists.
 */
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Checks both serving trees against the installed manifests and browser integrity pins.
 * @param {string} directory - Root containing the vault and Signet serving trees.
 * @returns {Promise<void>} Resolves only after every required artifact verifies.
 * @throws {Error} If either complete tree fails verification.
 */
export async function verifyAssetSet(directory) {
  for (const { child, manifestUrl, pin } of trees) {
    const bytes = await readFile(new URL(manifestUrl));
    assertManifestHash(bytes, pin);
    const manifest = parseZkArtifactManifest(bytes.toString());
    // The CLI's serving-layout helper is private. Replace this filter when the package exports it.
    const entries = [...manifest.files.keys()].filter(
      (path) =>
        path.startsWith("keys/") ||
        path.startsWith("compiler/") ||
        (path.startsWith("zkir/") && path.endsWith(".bzkir")),
    );
    if (!entries.length || !entries.some((entry) => entry.endsWith(".prover")))
      throw new Error(`${child || "vault"} manifest has no complete proving asset set`);
    try {
      assertManifestHash(await readFile(join(directory, child, manifestPath)), pin);
      for (const relativePath of entries) {
        verifyZkArtifactIntegrity({
          manifest,
          relativePath,
          bytes: await readFile(join(directory, child, relativePath)),
          mode: "require",
        });
      }
    } catch (error) {
      throw new Error(
        `${child || "vault"} assets failed verification: ${error instanceof Error ? error.message : "unrecognised verification failure"}`,
        { cause: error },
      );
    }
  }
}

/**
 * @param {string} stage - Isolated output directory supplied to the public package executable.
 * @returns {Promise<void>} Resolves after the executable exits successfully.
 */
async function runAssetCli(stage) {
  await new Promise((accept, reject) => {
    const child = spawn(
      process.execPath,
      [join(root, "node_modules/.bin/erc20-vault-zk-assets"), stage],
      { cwd: root, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) accept(undefined);
      else reject(new Error(`Asset CLI exited with ${String(code)}`));
    });
  });
}

/**
 * Promotes a verified complete asset set while preserving recovery after an interrupted rename.
 * @param {object} [options] - Asset preparation inputs.
 * @param {string} [options.destination] - Directory served by the app.
 * @param {string} [options.source] - Complete verified seed directory copied into staging.
 * @param {(stage: string) => Promise<void>} [options.prepare] - Preparation performed only in staging.
 * @returns {Promise<void>} Resolves after verified reuse or promotion.
 * @throws {Error} If locking, preparation or verification fails.
 */
export async function prepareAssetSet({
  destination = join(root, "public/zk"),
  source,
  prepare = runAssetCli,
} = {}) {
  destination = resolve(destination);
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const lockPath = `${destination}.prepare.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      throw new Error(
        `Asset preparation is locked by ${lockPath}. If its process has stopped, remove the lock and rerun to recover the complete directory.`,
      );
    throw error;
  }
  const stage = `${destination}.stage-${randomUUID()}`;
  const backup = `${destination}.previous`;
  try {
    await lock.writeFile(`${process.pid.toString()}\n`);
    // A stopped process can leave the complete serving directory parked between renames.
    if (await exists(backup)) {
      if (!(await exists(destination))) await rename(backup, destination);
      else {
        await verifyAssetSet(destination);
        await rm(backup, { recursive: true });
      }
    }
    if (source) await verifyAssetSet(resolve(source));
    else {
      try {
        await verifyAssetSet(destination);
        console.log("Verified complete vault and Signet asset set, reusing public assets");
        reportManifests();
        return;
      } catch {
        // The CLI can reuse intact files copied into the isolated preparation directory.
      }
    }
    if (source || (await exists(destination)))
      await cp(source ? resolve(source) : destination, stage, {
        recursive: true,
        mode: constants.COPYFILE_FICLONE,
      });
    else await mkdir(stage);
    await prepare(stage);
    await verifyAssetSet(stage);
    if (await exists(destination)) await rename(destination, backup);
    try {
      await rename(stage, destination);
    } catch (error) {
      if (await exists(backup)) await rename(backup, destination);
      throw error;
    }
    await rm(backup, { recursive: true, force: true });
    console.log(`Verified complete vault and Signet asset set installed at ${destination}`);
    reportManifests();
  } finally {
    await rm(stage, { recursive: true, force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { source: { type: "string" }, output: { type: "string" } },
  });
  await prepareAssetSet({ source: values.source, destination: values.output });
}
