import { z } from "zod";

import { type EvmChainConfig, getEvmChainConfig } from "./evm";
import { isLoopbackEndpoint } from "./loopback-endpoint";
import { getMidnightChainConfig, type MidnightNodeConfig } from "./midnight";

const rpcResponse = z.object({
  result: z.json().optional(),
  error: z.json().optional(),
});

interface LocalDemo {
  midnight: MidnightNodeConfig;
  evm: EvmChainConfig;
  rpc: (
    method: string,
    params?: readonly string[],
  ) => Promise<z.infer<typeof rpcResponse>["result"]>;
}

/**
 * Verifies development-only loopback services against the setup's Anvil instance and marker.
 *
 * @returns Captured public configuration and the checked endpoint's JSON-RPC transport.
 * @throws {Error} If runtime, endpoints, fork identity or RPC validation fail.
 */
export async function requireLocalDemo(): Promise<LocalDemo> {
  if (typeof window !== "undefined" || process.env.NODE_ENV !== "development")
    throw new Error("Local funding requires the development server.");
  const midnight = getMidnightChainConfig();
  const evm = getEvmChainConfig();
  if (
    midnight.networkId !== "undeployed" ||
    ![
      evm.rpcUrl,
      midnight.indexerUrl,
      midnight.indexerWsUrl,
      midnight.nodeUrl,
      midnight.proofServerUrl,
    ].every(isLoopbackEndpoint)
  )
    throw new Error("Local funding requires loopback Anvil and Midnight endpoints.");
  const instance = process.env.LOCAL_ANVIL_INSTANCE_ID;
  const address = process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_ADDRESS;
  const code = process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE;
  if (
    !instance ||
    !address ||
    !/^0x[0-9a-fA-F]{40}$/.test(address) ||
    !code ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)
  )
    throw new Error("Run local setup to generate this stack’s fork identity.");
  const rpc: LocalDemo["rpc"] = async (method, params = []) => {
    const response = await fetch(evm.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const input: unknown = await response.json();
    const body = rpcResponse.parse(input);
    if (!response.ok || body.error) throw new Error(`Local Anvil ${method} failed.`);
    return body.result;
  };
  const info = z.object({ instanceId: z.string() }).parse(await rpc("anvil_metadata"));
  const marker = await rpc("eth_getCode", [address, "latest"]);
  if (
    info.instanceId !== instance ||
    typeof marker !== "string" ||
    marker.toLowerCase() !== code.toLowerCase()
  )
    throw new Error("Local stack identity changed. Run setup again and restart Next.js.");
  return { midnight, evm, rpc };
}
