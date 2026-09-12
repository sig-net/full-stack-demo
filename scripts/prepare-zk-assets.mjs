import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { cp, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseZkArtifactManifest } from '@midnight-ntwrk/midnight-js/utils';
import { servedEntries } from '../node_modules/@sig-net/midnight-examples-erc20-vault-contract/dist/zk-assets/layout.js';
import { verifyTree } from '../node_modules/@sig-net/midnight-examples-erc20-vault-contract/dist/zk-assets/verify.js';
import {
  VAULT_ZK_MANIFEST_SHA256,
  SIGNET_ZK_MANIFEST_SHA256,
} from '../src/lib/midnight/zk-manifest-hashes.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = 'compiler/contract-manifest.json';
const trees = [
  [
    '',
    'midnight-examples-erc20-vault-contract/dist/managed/erc20-vault',
    VAULT_ZK_MANIFEST_SHA256,
  ],
  ['signet', 'midnight-contract/dist/managed', SIGNET_ZK_MANIFEST_SHA256],
];

function reportManifests() {
  for (const [child, , pin] of trees)
    console.log(`${child || 'vault'} ${manifestPath} sha256 = ${pin}`);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function verifyAssetSet(directory) {
  for (const [child, packagePath, pin] of trees) {
    const bytes = await readFile(
      join(root, 'node_modules/@sig-net', packagePath, manifestPath),
    );
    if (createHash('sha256').update(bytes).digest('hex') !== pin)
      throw new Error(
        `${child || 'vault'} package manifest differs from the browser integrity pin`,
      );
    const manifest = parseZkArtifactManifest(bytes.toString());
    const entries = servedEntries(manifest);
    if (!entries.length || !entries.some(entry => entry.endsWith('.prover')))
      throw new Error(
        `${child || 'vault'} manifest has no complete proving asset set`,
      );
    const mismatches = await verifyTree(manifest, bytes, async relativePath => {
      try {
        return await readFile(join(directory, child, relativePath));
      } catch (error) {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      }
    });
    if (mismatches.length)
      throw new Error(
        `${child || 'vault'} assets failed verification: ${mismatches.map(item => `${item.relativePath}: ${item.reason}`).join(', ')}`,
      );
  }
}

async function runAssetCli(stage) {
  await new Promise((accept, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(
          root,
          'node_modules/@sig-net/midnight-examples-erc20-vault-contract/dist/bin/erc20-vault-zk-assets.js',
        ),
        stage,
      ],
      { cwd: root, stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', code =>
      code === 0
        ? accept()
        : reject(new Error(`Asset CLI exited with ${code}`)),
    );
  });
}

export async function prepareAssetSet({
  destination = join(root, 'public/zk'),
  source,
  prepare = runAssetCli,
} = {}) {
  destination = resolve(destination);
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const lockPath = `${destination}.prepare.lock`;
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        `Asset preparation is locked by ${lockPath}. If its process has stopped, remove the lock and rerun to recover the complete directory.`,
      );
    throw error;
  }
  const stage = `${destination}.stage-${randomUUID()}`;
  const backup = `${destination}.previous`;
  try {
    await lock.writeFile(`${process.pid}\n`);
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
        console.log(
          'Verified complete vault and Signet asset set, reusing public assets',
        );
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
    console.log(
      `Verified complete vault and Signet asset set installed at ${destination}`,
    );
    reportManifests();
  } finally {
    await rm(stage, { recursive: true, force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: { source: { type: 'string' }, output: { type: 'string' } },
  });
  await prepareAssetSet({ source: values.source, destination: values.output });
}
