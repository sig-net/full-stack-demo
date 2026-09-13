import { type NextRequest, NextResponse } from "next/server";
import { encodeAbiParameters, erc20Abi, getAddress, keccak256, toHex } from "viem";
import { z } from "zod";

import { requireLocalDemo } from "@/lib/config/local-demo";
import { requireServerConfiguration } from "@/lib/config/server-runtime";
import { ERC20_TOKENS, fetchErc20Decimals } from "@/lib/constants/token-metadata";
import { getEthereumProvider } from "@/lib/rpc";
import { LOCAL_EVM_ETH_TARGET } from "@/lib/wallet-funding";

/** Funding executes with server-side credentials and Node SDK dependencies. */
export const runtime = "nodejs";
/** Eligibility and balances must be evaluated for each request. */
export const dynamic = "force-dynamic";
let running: Promise<undefined | Awaited<ReturnType<typeof fund>>> = Promise.resolve(undefined);

/**
 * Reports whether this server is attached to the verified local development stack.
 *
 * @returns Current funding eligibility without initiating a transfer.
 */
export async function GET(): Promise<Response> {
  try {
    await requireLocalDemo();
    return NextResponse.json({ eligible: true });
  } catch {
    return NextResponse.json({ eligible: false });
  }
}

async function fund(address: `0x${string}`): Promise<{ eth: string; usdc: string }> {
  const config = await requireLocalDemo();
  const client = getEthereumProvider(config.evm);
  const mutate = async (
    method: string,
    params: readonly string[],
  ): ReturnType<typeof config.rpc> => {
    const eligible = await requireLocalDemo();
    return eligible.rpc(method, params);
  };
  const eth = await client.getBalance({ address });
  if (eth < LOCAL_EVM_ETH_TARGET)
    await mutate("anvil_setBalance", [address, toHex(LOCAL_EVM_ETH_TARGET)]);
  const token = ERC20_TOKENS.find((value) => value.symbol === "USDC");
  if (!token) throw new Error("Deposit token configuration is missing.");
  const tokenAddress = getAddress(token.erc20Address);
  const decimals = await fetchErc20Decimals(tokenAddress, config.evm);
  const target = 100n * 10n ** BigInt(decimals);
  const balance = (): Promise<bigint> =>
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
  if ((await balance()) < target) {
    // The examples' storage probe is private to its deploy package. Replace this
    // adaptation when that package publishes a deficit-aware funding export.
    let location: `0x${string}` | undefined;
    const sentinel = target + 1n;
    for (let slot = 0n; slot < 64n && !location; slot++) {
      const candidate = keccak256(
        encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [address, slot]),
      );
      const original =
        (await client.getStorageAt({
          address: tokenAddress,
          slot: candidate,
        })) ?? toHex(0n, { size: 32 });
      try {
        await mutate("anvil_setStorageAt", [
          tokenAddress,
          candidate,
          toHex(sentinel, { size: 32 }),
        ]);
        if ((await balance()) === sentinel) location = candidate;
      } finally {
        await mutate("anvil_setStorageAt", [tokenAddress, candidate, original]);
      }
    }
    if (!location) throw new Error("The deposit token balance storage could not be identified.");
    if ((await balance()) < target)
      await mutate("anvil_setStorageAt", [tokenAddress, location, toHex(target, { size: 32 })]);
  }
  const [finalEth, finalToken] = await Promise.all([client.getBalance({ address }), balance()]);
  if (finalEth < LOCAL_EVM_ETH_TARGET || finalToken < target)
    throw new Error("Funding balances have not reached their targets. Retry funding.");
  return { eth: finalEth.toString(), usdc: finalToken.toString() };
}

/**
 * Serialises deficit funding after deployment attestation and local stack verification.
 *
 * @param request - The connected EVM address.
 * @returns Confirmed funding balances or a validation or eligibility error response.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const input = z
    .object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "Supply only the connected EVM address." }, { status: 400 });
  try {
    requireServerConfiguration(request);
    await requireLocalDemo();
    const operation = running
      .catch(() => undefined)
      .then(() => fund(getAddress(input.data.address)));
    running = operation;
    return NextResponse.json(await operation);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Local funding failed.",
      },
      { status: 403 },
    );
  }
}
