import { z } from "zod";

import type { LocalFaucetDescriptor } from "./local-faucet";
import { isLoopbackEndpoint } from "./loopback-endpoint";

const endpoint = z.url({ protocol: /^(https?|wss?)$/ });
const httpEndpoint = z.url({ protocol: /^https?$/ });
const wsEndpoint = z.url({ protocol: /^wss?$/ });

/** Immutable server policy and endpoints for the three local development faucets. */
export interface LocalFaucetConfiguration {
  readonly descriptor: LocalFaucetDescriptor;
}

function localEndpoint(
  value: string | undefined,
  fallback: string,
  name: string,
  schema: typeof endpoint = endpoint,
): string {
  const parsed = schema.safeParse(value ?? fallback);
  if (!parsed.success || !isLoopbackEndpoint(parsed.data))
    throw new Error(`${name} must be a loopback endpoint for local faucet funding.`);
  return parsed.data;
}

/**
 * Resolves server-only endpoint overrides without changing the supported chains or funding source.
 *
 * @returns Fixed local faucet policy and its safe public endpoint descriptor.
 * @throws {Error} If an endpoint override is not a local supported endpoint.
 */
export function getLocalFaucetConfiguration(): LocalFaucetConfiguration {
  if (typeof window !== "undefined") throw new Error("Local faucet configuration is server-only.");
  const indexerUrl = localEndpoint(
    process.env.LOCAL_FAUCET_MIDNIGHT_INDEXER_URL,
    "http://127.0.0.1:8088/api/v4/graphql",
    "LOCAL_FAUCET_MIDNIGHT_INDEXER_URL",
    httpEndpoint,
  );
  const indexerWsUrl = localEndpoint(
    process.env.LOCAL_FAUCET_MIDNIGHT_INDEXER_WS_URL,
    "ws://127.0.0.1:8088/api/v4/graphql/ws",
    "LOCAL_FAUCET_MIDNIGHT_INDEXER_WS_URL",
    wsEndpoint,
  );
  const nodeUrl = localEndpoint(
    process.env.LOCAL_FAUCET_MIDNIGHT_NODE_URL,
    "http://127.0.0.1:9944",
    "LOCAL_FAUCET_MIDNIGHT_NODE_URL",
    httpEndpoint,
  );
  const proofServerUrl = localEndpoint(
    process.env.LOCAL_FAUCET_MIDNIGHT_PROOF_SERVER_URL,
    "http://127.0.0.1:6300",
    "LOCAL_FAUCET_MIDNIGHT_PROOF_SERVER_URL",
    httpEndpoint,
  );
  const rpcUrl = localEndpoint(
    process.env.LOCAL_FAUCET_EVM_RPC_URL,
    "http://127.0.0.1:8545",
    "LOCAL_FAUCET_EVM_RPC_URL",
    httpEndpoint,
  );
  return Object.freeze({
    descriptor: Object.freeze({
      available: process.env.NODE_ENV === "development",
      midnight: Object.freeze({
        networkId: "undeployed",
        indexerUrl,
        indexerWsUrl,
        nodeUrl,
        proofServerUrl,
      }),
      evm: Object.freeze({ chainId: "11155111", rpcUrl }),
    }),
  });
}

/**
 * Checks that the fixed faucet policy is attached to the intended local Anvil chain.
 *
 * @returns Verified local faucet policy.
 * @throws {Error} If this process or its EVM endpoint cannot serve local funding.
 */
export function requireLocalFaucetConfiguration(): LocalFaucetConfiguration {
  const configuration = getLocalFaucetConfiguration();
  if (process.env.NODE_ENV !== "development" || !configuration.descriptor.available)
    throw new Error("Local faucet funding requires the development server.");
  return configuration;
}

/**
 * Checks that the fixed EVM faucet endpoint is a local Anvil chain with the supported chain ID.
 *
 * @returns Verified local faucet policy.
 * @throws {Error} If the configured EVM endpoint is not the local Anvil faucet chain.
 */
export async function requireLocalEvmFaucetConfiguration(): Promise<LocalFaucetConfiguration> {
  const configuration = requireLocalFaucetConfiguration();
  const response = await fetch(configuration.descriptor.evm.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const input: unknown = await response.json();
  const parsed = z
    .object({ result: z.unknown().optional(), error: z.unknown().optional() })
    .safeParse(input);
  if (!parsed.success || !response.ok || parsed.data.error || parsed.data.result !== "0xaa36a7")
    throw new Error("Local faucet RPC must serve Anvil chain 11155111.");
  const metadataResponse = await fetch(configuration.descriptor.evm.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "anvil_metadata", params: [] }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const metadataInput: unknown = await metadataResponse.json();
  const metadata = z
    .object({
      result: z.object({ instanceId: z.string().min(1) }).optional(),
      error: z.unknown().optional(),
    })
    .safeParse(metadataInput);
  if (!metadata.success || !metadataResponse.ok || metadata.data.error || !metadata.data.result)
    throw new Error("Local faucet RPC must serve an Anvil instance.");
  return configuration;
}

/**
 * Checks that the fixed Midnight faucet endpoint is the local undeployed chain.
 *
 * @returns Verified local faucet policy.
 * @throws {Error} If the configured Midnight endpoint is not the local faucet chain.
 */
export async function requireLocalMidnightFaucetConfiguration(): Promise<LocalFaucetConfiguration> {
  const configuration = requireLocalFaucetConfiguration();
  const response = await fetch(configuration.descriptor.midnight.nodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "system_chain", params: [] }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const input: unknown = await response.json();
  const parsed = z
    .object({ result: z.string().optional(), error: z.unknown().optional() })
    .safeParse(input);
  if (!parsed.success || !response.ok || parsed.data.error || parsed.data.result !== "undeployed1")
    throw new Error("Local faucet node must serve the undeployed Midnight chain.");
  return configuration;
}
