import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** Canonical placement of the one transaction a stub answers receipts for. */
export interface StubReceipt {
  blockNumber: number;
  blockHash: string;
}

/** How the endpoint answers the `finalized` block tag. */
export type StubFinalizedTag =
  | { kind: "height"; height: number }
  /** Serves the tag and reports that no block has been finalized yet. */
  | { kind: "empty" }
  /** Rejects the tag, as an endpoint that does not implement it does. */
  | { kind: "rejected" };

/** A controlled JSON-RPC endpoint whose chain readings and failure mode a test owns. */
export interface RpcStub {
  url: string;
  /** Native balance answered for every account, in wei. */
  setBalance: (wei: bigint) => void;
  /** Answers every balance request with a transport failure until a balance is set again. */
  failBalance: () => void;
  /** Transaction count answered for every account. */
  setNonce: (count: bigint) => void;
  /** Height answered for `eth_blockNumber` and the `latest` tag. */
  setHead: (height: number) => void;
  /** Receipt answered for every transaction hash, or null while none is mined. */
  setReceipt: (receipt: StubReceipt | null) => void;
  /** Canonical hash answered for one height, which a reorg replaces. */
  setBlockHash: (height: number, hash: string) => void;
  /** How the endpoint answers the `finalized` tag. */
  setFinalizedTag: (tag: StubFinalizedTag) => void;
  /** Answers every request with a transport failure until reads are resumed. */
  failReads: () => void;
  /** Answers requests from the controlled values again. */
  resumeReads: () => void;
  /** Accounts asked for so far, lowercased, in request order. */
  requested: string[];
  /** Methods asked for so far, in request order. */
  methods: string[];
  close: () => Promise<void>;
}

/**
 * @param height - Block height.
 * @returns The hash this endpoint answers at that height until a test replaces it.
 */
export function stubBlockHash(height: number): string {
  return `0x${height.toString(16).padStart(64, "0")}`;
}

/**
 * @param height - Height the block reports.
 * @param hash - Canonical hash at that height.
 * @returns A block carrying every field the ethers formatter reads.
 */
function stubBlock(height: number, hash: string): Record<string, unknown> {
  return {
    hash,
    parentHash: stubBlockHash(height - 1),
    number: `0x${height.toString(16)}`,
    timestamp: "0x0",
    nonce: "0x0000000000000000",
    difficulty: "0x0",
    gasLimit: "0x1c9c380",
    gasUsed: "0x0",
    miner: `0x${"00".repeat(20)}`,
    extraData: "0x",
    baseFeePerGas: "0x1",
    transactions: [],
  };
}

/**
 * @param hash - Transaction the receipt belongs to.
 * @param receipt - Controlled canonical placement of that transaction.
 * @returns A receipt carrying every field the ethers formatter reads.
 */
function stubReceipt(hash: string, receipt: StubReceipt): Record<string, unknown> {
  return {
    to: `0x${"11".repeat(20)}`,
    from: `0x${"22".repeat(20)}`,
    contractAddress: null,
    transactionIndex: "0x0",
    root: null,
    gasUsed: "0x5208",
    logsBloom: `0x${"00".repeat(256)}`,
    blockHash: receipt.blockHash,
    transactionHash: hash,
    logs: [],
    blockNumber: `0x${receipt.blockNumber.toString(16)}`,
    cumulativeGasUsed: "0x5208",
    effectiveGasPrice: "0x1",
    status: "0x1",
    type: "0x2",
  };
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
  let head = 0;
  let receipt: StubReceipt | null = null;
  let finalizedTag: StubFinalizedTag = { kind: "rejected" };
  let reading = true;
  const blockHashes = new Map<number, string>();
  const requested: string[] = [];
  const methods: string[] = [];
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
        methods.push(entry.method);
        if (!reading && entry.method !== "eth_chainId")
          return {
            jsonrpc: "2.0",
            id: entry.id,
            error: { code: -32000, message: "endpoint unavailable" },
          };
        if (entry.method === "eth_blockNumber")
          return { jsonrpc: "2.0", id: entry.id, result: `0x${head.toString(16)}` };
        if (entry.method === "eth_getTransactionReceipt")
          return {
            jsonrpc: "2.0",
            id: entry.id,
            result:
              receipt === null
                ? null
                : stubReceipt(
                    typeof entry.params?.[0] === "string" ? entry.params[0] : "0x",
                    receipt,
                  ),
          };
        if (entry.method === "eth_getBlockByNumber") {
          const tag = entry.params?.[0];
          if (tag === "finalized") {
            if (finalizedTag.kind === "rejected")
              return {
                jsonrpc: "2.0",
                id: entry.id,
                error: { code: -32602, message: "unknown block: finalized" },
              };
            if (finalizedTag.kind === "empty")
              return { jsonrpc: "2.0", id: entry.id, result: null };
            const height = finalizedTag.height;
            return {
              jsonrpc: "2.0",
              id: entry.id,
              result: stubBlock(height, blockHashes.get(height) ?? stubBlockHash(height)),
            };
          }
          const height =
            tag === "latest" || typeof tag !== "string" ? head : Number.parseInt(tag, 16);
          if (height > head) return { jsonrpc: "2.0", id: entry.id, result: null };
          return {
            jsonrpc: "2.0",
            id: entry.id,
            result: stubBlock(height, blockHashes.get(height) ?? stubBlockHash(height)),
          };
        }
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
    setHead: (height) => {
      head = height;
    },
    setReceipt: (value) => {
      receipt = value;
    },
    setBlockHash: (height, hash) => {
      blockHashes.set(height, hash);
    },
    setFinalizedTag: (tag) => {
      finalizedTag = tag;
    },
    failReads: () => {
      reading = false;
    },
    resumeReads: () => {
      reading = true;
    },
    requested,
    methods,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
