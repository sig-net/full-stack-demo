/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { createReadStream, statSync, mkdtempSync, rmSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const { createInterface } = require('node:readline');

if (process.argv.length > 2)
  throw new Error('This preflight accepts no arguments');
const key = resolve(__dirname, '../../public/zk/keys/completeDeposit.prover');
const expectedBytes = statSync(key).size;
if (expectedBytes < 100000000)
  throw new Error('Preflight requires the full public proving key');
const output = mkdtempSync(
  require('node:path').join(
    require('node:os').tmpdir(),
    'local-vault-transport-',
  ),
);
const uploads = [];
let child;
let nextId = 1;
const pending = new Map();
let stderr = '';
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const server = createServer(async (req, res) => {
  if (req.url === '/key') {
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': expectedBytes,
    });
    createReadStream(key).pipe(res);
  } else if (req.url === '/upload') {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      hash.update(chunk);
    }
    const result = { bytes, sha256: hash.digest('hex') };
    uploads.push(result);
    emit({ sink: result });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } else if (req.url === '/ordinary') {
    res.end('ordinary-ok');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      '<title>Transport fixture</title><h1>Transport fixture ready</h1><button onclick="this.dataset.clicks=Number(this.dataset.clicks||0)+1; this.textContent=\'Ordinary action \'+this.dataset.clicks">Ordinary action</button>',
    );
  }
});
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout: ${method}`));
    }, 60000);
    pending.set(id, {
      resolve: value => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: error => {
        clearTimeout(timer);
        reject(error);
      },
    });
    child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
    );
  });
}
async function tool(name, args) {
  const result = await rpc('tools/call', { name, arguments: args });
  if (result.error || result.result?.isError)
    throw new Error(JSON.stringify(result));
  return result.result;
}
(async () => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(key)) hash.update(chunk);
  const expectedHash = hash.digest('hex');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const args = [
    resolve(__dirname, 'playwright-launcher.cjs'),
    '--isolated',
    '--headless',
    '--browser',
    'chrome',
    '--output-dir',
    output,
  ];
  child = spawn(process.execPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });
  emit({ pid: child.pid, origin, expectedBytes, expectedHash });
  createInterface({ input: child.stdout }).on('line', line => {
    try {
      const message = JSON.parse(line);
      pending.get(message.id)?.resolve(message);
      pending.delete(message.id);
    } catch {
      emit({ malformedStdout: true });
    }
  });
  child.stderr.on('data', chunk => {
    stderr = (stderr + chunk.toString()).slice(-12000);
  });
  child.on('exit', (code, signal) => {
    for (const p of pending.values())
      p.reject(new Error(`MCP exited ${code}/${signal}`));
    pending.clear();
  });
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'local-vault-transport-preflight', version: '1' },
  });
  emit({ server: init.result?.serverInfo });
  child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
      '\n',
  );
  const tools = (await rpc('tools/list', {})).result.tools;
  const run = tools.find(t => /run_code/.test(t.name)).name;
  await tool('browser_navigate', { url: origin });
  for (let i = 0; i < 2; i++) {
    await tool(run, {
      code: `async (page) => await page.evaluate(async () => { const bytes = await (await fetch('/key')).arrayBuffer(); const uploaded = await (await fetch('/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes })).json(); const ordinary = await (await fetch('/ordinary')).text(); return { uploaded, ordinary }; })`,
    });
    if (
      uploads[i]?.bytes !== expectedBytes ||
      uploads[i]?.sha256 !== expectedHash
    )
      throw new Error('Upload mismatch');
    await tool(run, {
      code: 'async (page) => { await page.getByRole("button", { name: /Ordinary action/ }).click(); return await page.getByRole("button").textContent(); }',
    });
    const snapshot = await tool('browser_snapshot', {});
    const tabs = await tool('browser_tabs', { action: 'list' });
    const network = await tool('browser_network_requests', { static: true });
    const checks = {
      snapshot: JSON.stringify(snapshot).includes('Transport fixture ready'),
      interaction: JSON.stringify(snapshot).includes(
        `Ordinary action ${i + 1}`,
      ),
      tabs: JSON.stringify(tabs).includes('Transport fixture'),
      networkUpload: JSON.stringify(network).includes('/upload'),
      networkOrdinary: JSON.stringify(network).includes('/ordinary'),
    };
    if (Object.values(checks).some(value => !value))
      throw new Error(JSON.stringify({ failed: checks, network }));
    emit({ iteration: i + 1, checks });
  }
  emit({ pass: true, uploads: uploads.length, stderr });
})()
  .catch(error => {
    emit({ pass: false, error: String(error), stderr });
    process.exitCode = 1;
  })
  .finally(async () => {
    if (child) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
      const processGroup = child.pid;
      setTimeout(() => {
        try {
          process.kill(-processGroup, 'SIGKILL');
        } catch {}
      }, 1500).unref();
    }
    server.closeAllConnections();
    server.close();
    rmSync(output, { recursive: true, force: true });
  });
