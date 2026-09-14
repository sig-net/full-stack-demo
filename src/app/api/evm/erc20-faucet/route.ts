import { type NextRequest, NextResponse } from "next/server";
import { encodeAbiParameters, erc20Abi, getAddress, keccak256, toHex } from "viem";
import { z } from "zod";

import { requireLocalEvmFaucetConfiguration } from "@/lib/config/local-faucet-server";
import { fetchErc20Decimals } from "@/lib/constants/token-metadata";
import { getEthereumProvider } from "@/lib/rpc";

/** Funding executes with local Node.js RPC access. */
export const runtime = "nodejs";
/** Each funding response reads the current local token state. */
export const dynamic = "force-dynamic";
let running: Promise<Response> = Promise.resolve(NextResponse.json({}));

async function rpc(rpcUrl: string, method: string, params: readonly string[]): Promise<void> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await response.json();
  const parsed = z.object({ error: z.unknown().optional() }).parse(body);
  if (!response.ok || parsed.error) throw new Error(`Local Anvil ${method} failed.`);
}

async function fundToken(address: `0x${string}`, tokenAddress: `0x${string}`): Promise<string> {
  const configuration = await requireLocalEvmFaucetConfiguration();
  const evm = {
    network: "local" as const,
    chainId: 11155111n,
    rpcUrl: configuration.descriptor.evm.rpcUrl,
    explorerUrl: "",
  };
  const client = getEthereumProvider(evm);
  const decimals = await fetchErc20Decimals(tokenAddress, evm);
  const target = 100n * 10n ** BigInt(decimals);
  const balance = (): Promise<bigint> =>
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
  if ((await balance()) >= target) return (await balance()).toString();
  let location: `0x${string}` | undefined;
  const sentinel = target + 1n;
  for (let slot = 0n; slot < 64n && !location; slot++) {
    const candidate = keccak256(
      encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [address, slot]),
    );
    const original =
      (await client.getStorageAt({ address: tokenAddress, slot: candidate })) ??
      toHex(0n, { size: 32 });
    try {
      await rpc(configuration.descriptor.evm.rpcUrl, "anvil_setStorageAt", [
        tokenAddress,
        candidate,
        toHex(sentinel, { size: 32 }),
      ]);
      if ((await balance()) === sentinel) location = candidate;
    } finally {
      await rpc(configuration.descriptor.evm.rpcUrl, "anvil_setStorageAt", [
        tokenAddress,
        candidate,
        original,
      ]);
    }
  }
  if (!location)
    throw new Error("The token balance storage layout is unsupported by this local faucet.");
  await rpc(configuration.descriptor.evm.rpcUrl, "anvil_setStorageAt", [
    tokenAddress,
    location,
    toHex(target, { size: 32 }),
  ]);
  const funded = await balance();
  if (funded < target) throw new Error("Local token balance did not reach its target.");
  return funded.toString();
}

/**
 * Funds one local EVM token balance using its discovered decimal precision.
 *
 * @param request - Body containing recipient and ERC-20 addresses.
 * @returns Confirmed token balance or a validation error.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const input = z
    .object({
      address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      tokenAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Supply one EVM recipient address and one ERC-20 address." },
      { status: 400 },
    );
  const fund = async (): Promise<Response> => {
    try {
      const balance = await fundToken(
        getAddress(input.data.address),
        getAddress(input.data.tokenAddress),
      );
      return NextResponse.json({ balance });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Local ERC-20 funding failed." },
        { status: 403 },
      );
    }
  };
  const operation = running.then(fund, fund);
  running = operation;
  return operation;
}
