import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** A controlled JSON-RPC endpoint whose native balance and failure mode a test owns. */
export interface RpcStub {
  url: string;
  /** Native balance answered for every account, in wei. */
  setBalance: (wei: bigint) => void;
  /** Answers every balance request with a transport failure until a balance is set again. */
  failBalance: () => void;
  /** Transaction count answered for every account. */
  setNonce: (count: bigint) => void;
  /** Accounts asked for so far, lowercased, in request order. */
  requested: string[];
  close: () => Promise<void>;
}

interface RpcRequest {
  id: number | string;
  method: string;
  params?: unknown[];
}

function parseRequest(body: string): RpcRequest[] {
  const parsed: unknown = JSON.parse(body);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return entries.map((entry) => {
    if (typeof entry !== "object" || entry === null || !("method" in entry) || !("id" in entry))
      throw new Error("Malformed JSON-RPC request");
    const { id, method, params } = entry as { id: unknown; method: unknown; params?: unknown };
    if (typeof method !== "string" || (typeof id !== "number" && typeof id !== "string"))
      throw new Error("Malformed JSON-RPC request");
    return { id, method, params: Array.isArray(params) ? params : undefined };
  });
}

/**
 * Starts a JSON-RPC endpoint that answers chain and balance reads from controlled values.
 *
 * @param chainId - Chain the endpoint reports, matching the configuration under test.
 * @returns The running endpoint, its controls and its observed requests.
 */
export async function startRpcStub(chainId: bigint): Promise<RpcStub> {
  let balance: bigint | null = 0n;
  let nonce = 0n;
  const requested: string[] = [];
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "POST, OPTIONS",
  };
  const server: Server = createServer((request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, cors).end();
      return;
    }
    let body = "";
    request.on("data", (chunk: Buffer) => (body += chunk.toString("utf8")));
    request.on("end", () => {
      let requests: RpcRequest[];
      try {
        requests = parseRequest(body);
      } catch {
        response.writeHead(400, cors).end();
        return;
      }
      const results = requests.map((entry) => {
        if (entry.method === "eth_chainId")
          return { jsonrpc: "2.0", id: entry.id, result: `0x${chainId.toString(16)}` };
        if (entry.method === "eth_getBalance") {
          const account = entry.params?.[0];
          if (typeof account === "string") requested.push(account.toLowerCase());
          if (balance === null)
            return {
              jsonrpc: "2.0",
              id: entry.id,
              error: { code: -32000, message: "unavailable" },
            };
          return { jsonrpc: "2.0", id: entry.id, result: `0x${balance.toString(16)}` };
        }
        if (entry.method === "eth_getTransactionCount")
          return { jsonrpc: "2.0", id: entry.id, result: `0x${nonce.toString(16)}` };
        return {
          jsonrpc: "2.0",
          id: entry.id,
          error: { code: -32601, message: `unsupported ${entry.method}` },
        };
      });
      response
        .writeHead(200, { ...cors, "content-type": "application/json" })
        .end(JSON.stringify(Array.isArray(JSON.parse(body)) ? results : results[0]));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port.toString()}`,
    setBalance: (wei) => {
      balance = wei;
    },
    failBalance: () => {
      balance = null;
    },
    setNonce: (count) => {
      nonce = count;
    },
    requested,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
