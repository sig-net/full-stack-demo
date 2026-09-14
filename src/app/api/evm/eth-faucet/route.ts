import { type NextRequest, NextResponse } from "next/server";
import { getAddress, toHex } from "viem";
import { z } from "zod";

import { requireLocalEvmFaucetConfiguration } from "@/lib/config/local-faucet-server";
import { getEthereumProvider } from "@/lib/rpc";
import { LOCAL_EVM_ETH_TARGET } from "@/lib/wallet-funding";

/** Funding executes with local Node.js RPC access. */
export const runtime = "nodejs";
/** Each funding response reads the current local chain balance. */
export const dynamic = "force-dynamic";

/**
 * Funds one local EVM address with its fixed ETH target.
 *
 * @param request - Body containing the recipient address.
 * @returns Confirmed local ETH balance or a validation error.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const input = z
    .object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "Supply one EVM recipient address." }, { status: 400 });
  try {
    const configuration = await requireLocalEvmFaucetConfiguration();
    const address = getAddress(input.data.address);
    const client = getEthereumProvider({
      network: "local",
      chainId: 11155111n,
      rpcUrl: configuration.descriptor.evm.rpcUrl,
      explorerUrl: "",
    });
    const current = await client.getBalance({ address });
    if (current < LOCAL_EVM_ETH_TARGET) {
      const response = await fetch(configuration.descriptor.evm.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "anvil_setBalance",
          params: [address, toHex(LOCAL_EVM_ETH_TARGET)],
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      const body: unknown = await response.json();
      const parsed = z.object({ error: z.unknown().optional() }).parse(body);
      if (!response.ok || parsed.error) throw new Error("Local Anvil ETH funding failed.");
    }
    const balance = await client.getBalance({ address });
    if (balance < LOCAL_EVM_ETH_TARGET)
      throw new Error("Local ETH balance did not reach its target.");
    return NextResponse.json({ eth: balance.toString() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Local ETH funding failed." },
      { status: 403 },
    );
  }
}
