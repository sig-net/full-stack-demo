import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";

import type { CallToolResult, JSONRPCResponse } from "@modelcontextprotocol/sdk/types.js";
import type { util } from "zod/v4/core";

if (process.argv.length > 2) throw new Error("This preflight accepts no arguments");
const key = resolve(import.meta.dirname, "../../public/zk/keys/completeDeposit.prover");
const expectedBytes = statSync(key).size;
if (expectedBytes < 100000000) throw new Error("Preflight requires the full public proving key");
const {
  JSONRPCResponseSchema,
  InitializeResultSchema,
  ListToolsResultSchema,
  CallToolResultSchema,
} = await import("@modelcontextprotocol/sdk/types.js");
const output = mkdtempSync(join(tmpdir(), "local-vault-transport-"));
const uploads: { bytes: number; sha256: string }[] = [];
let child: ChildProcessWithoutNullStreams | undefined;
let nextId = 1;
const pending = new Map<
  string | number,
  { resolve: (response: JSONRPCResponse) => void; reject: (error: Error) => void }
>();
let stderr = "";
const emit = (value: util.JSONType): void => {
  process.stdout.write(JSON.stringify(value) + "\n");
};
const server = createServer((req, res) => {
  if (req.url === "/key") {
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": expectedBytes,
    });
    createReadStream(key).pipe(res);
  } else if (req.url === "/upload") {
    const hash = createHash("sha256");
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    req.on("end", () => {
      const result = { bytes, sha256: hash.digest("hex") };
      uploads.push(result);
      emit({ sink: result });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    });
  } else if (req.url === "/ordinary") {
    res.end("ordinary-ok");
  } else {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<title>Transport fixture</title><h1>Transport fixture ready</h1><button onclick=\"this.dataset.clicks=Number(this.dataset.clicks||0)+1; this.textContent='Ordinary action '+this.dataset.clicks\">Ordinary action</button>",
    );
  }
});
function rpc(method: string, params: Record<string, util.JSONType>): Promise<JSONRPCResponse> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout: ${method}`));
    }, 60000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    if (!child) throw new Error("MCP process is unavailable");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
async function tool(name: string, args: Record<string, util.JSONType>): Promise<CallToolResult> {
  const response = await rpc("tools/call", { name, arguments: args });
  if ("error" in response) throw new Error(JSON.stringify(response.error));
  const result = CallToolResultSchema.parse(response.result);
  if (result.isError) throw new Error(JSON.stringify(result));
  return result;
}
function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // The owned process group can exit before its scheduled termination signal.
  }
}
(async () => {
  const hash = createHash("sha256");
  await finished(createReadStream(key).pipe(hash), { readable: false });
  const expectedHash = hash.digest("hex");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server address");
  const origin = `http://127.0.0.1:${address.port.toString()}`;
  const args = [
    resolve(import.meta.dirname, "playwright-launcher.mjs"),
    "--isolated",
    "--headless",
    "--browser",
    "chrome",
    "--output-dir",
    output,
  ];
  child = spawn(process.execPath, args, {
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });
  emit({ pid: child.pid ?? null, origin, expectedBytes, expectedHash });
  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const message = JSONRPCResponseSchema.parse(JSON.parse(line));
      if (message.id !== undefined) {
        pending.get(message.id)?.resolve(message);
        pending.delete(message.id);
      }
    } catch {
      emit({ malformedStdout: true });
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-12000);
  });
  child.on("exit", (code, signal) => {
    for (const p of pending.values())
      p.reject(new Error(`MCP exited ${String(code)}/${String(signal)}`));
    pending.clear();
  });
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "local-vault-transport-preflight", version: "1" },
  });
  if ("error" in init) throw new Error(JSON.stringify(init.error));
  const info = InitializeResultSchema.parse(init.result).serverInfo;
  emit({ server: { name: info.name, version: info.version } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const listed = await rpc("tools/list", {});
  if ("error" in listed) throw new Error(JSON.stringify(listed.error));
  const tools = ListToolsResultSchema.parse(listed.result).tools;
  const run = tools.find((t) => t.name.includes("run_code"))?.name;
  if (!run) throw new Error("Expected a browser code tool");
  await tool("browser_navigate", { url: origin });
  for (let i = 0; i < 2; i++) {
    await tool(run, {
      code: `async (page) => await page.evaluate(async () => { const bytes = await (await fetch('/key')).arrayBuffer(); const uploaded = await (await fetch('/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes })).json(); const ordinary = await (await fetch('/ordinary')).text(); return { uploaded, ordinary }; })`,
    });
    if (uploads[i]?.bytes !== expectedBytes || uploads[i]?.sha256 !== expectedHash)
      throw new Error("Upload mismatch");
    await tool(run, {
      code: 'async (page) => { await page.getByRole("button", { name: /Ordinary action/ }).click(); return await page.getByRole("button").textContent(); }',
    });
    const snapshot = await tool("browser_snapshot", {});
    const tabs = await tool("browser_tabs", { action: "list" });
    const network = await tool("browser_network_requests", { static: true });
    const checks = {
      snapshot: JSON.stringify(snapshot).includes("Transport fixture ready"),
      interaction: JSON.stringify(snapshot).includes(`Ordinary action ${(i + 1).toString()}`),
      tabs: JSON.stringify(tabs).includes("Transport fixture"),
      networkUpload: JSON.stringify(network).includes("/upload"),
      networkOrdinary: JSON.stringify(network).includes("/ordinary"),
    };
    if (Object.values(checks).some((value) => !value))
      throw new Error(JSON.stringify({ failed: checks, network }));
    emit({ iteration: i + 1, checks });
  }
  emit({ pass: true, uploads: uploads.length, stderr });
})()
  .catch((error: unknown) => {
    emit({ pass: false, error: String(error), stderr });
    process.exitCode = 1;
  })
  .finally(() => {
    if (child?.pid) {
      signalProcessGroup(child.pid, "SIGTERM");
      const processGroup = child.pid;
      setTimeout(() => {
        signalProcessGroup(processGroup, "SIGKILL");
      }, 1500).unref();
    }
    server.closeAllConnections();
    server.close();
    rmSync(output, { recursive: true, force: true });
  });
