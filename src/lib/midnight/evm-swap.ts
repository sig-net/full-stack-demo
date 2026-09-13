import {
  asciiPadded,
  MPC_PARAMS_BYTES,
  MPCDestination,
  MPCSignatureAlgorithm,
} from "@sig-net/midnight";
import {
  type ConstantContractMethod,
  Contract as EthersContract,
  type ContractMethod,
  isError,
  ZeroAddress,
} from "ethers";

import { withEthersProvider } from "@/lib/evm/ethers-provider";

import { SWAP_GAS_LIMIT } from "./evm-envelope";

/** Router address shared by approval and swap envelopes on the configured Sepolia deployment. */
export const UNISWAP_SWAP_ROUTER_02 = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
/** Quoter address used for static swap simulations. */
export const UNISWAP_QUOTER_V2 = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3";
/** Factory address used for direct-pool discovery. */
export const UNISWAP_V3_FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c";

/** Must match the exactOutputSingle function used by the vault swap envelope. */
export const EXACT_OUTPUT_SINGLE_SELECTOR = new Uint8Array([0x50, 0x23, 0xb4, 0xdf]);
/** Must match the ERC-20 approval function used by vault router approval. */
export const APPROVE_SELECTOR = new Uint8Array([0x09, 0x5e, 0xa7, 0xb3]);
/** Allowance must match the compiled vault's approveRouter amount. */
export const MAX_APPROVE = 340282366920938463463374607431768211455n;

/** Must match the compiled vault's swapOutputSchema. */
export const SWAP_OUTPUT_SCHEMA = '[{"name":"amountIn","type":"uint256"}]';
/** Must match the compiled vault's swapRespondSchema. */
export const SWAP_RESPOND_SCHEMA = '[{"name":"amountIn","type":"uint64"}]';
/** Byte width retained in swap output routing. */
export const SWAP_OUTPUT_SCHEMA_BYTES = SWAP_OUTPUT_SCHEMA.length;
/** Byte width retained in swap response routing. */
export const SWAP_RESPOND_SCHEMA_BYTES = SWAP_RESPOND_SCHEMA.length;

/** Routing fields must agree with the compiled vault swap request. */
export const SWAP_MPC_ROUTING = {
  algo: MPCSignatureAlgorithm.ecdsa,
  dest: MPCDestination.unused,
  params: new Uint8Array(MPC_PARAMS_BYTES),
  outputDeserializationSchema: asciiPadded(SWAP_OUTPUT_SCHEMA, SWAP_OUTPUT_SCHEMA_BYTES),
  respondSerializationSchema: asciiPadded(SWAP_RESPOND_SCHEMA, SWAP_RESPOND_SCHEMA_BYTES),
};

/** Deadline for each concurrent quote tier and the complete pool-discovery read. */
export const SWAP_READ_TIMEOUT_MS = 10_000;

class SwapGasLimitError extends Error {}

function assertSwapGasEstimate(gasEstimate: bigint): void {
  if (gasEstimate >= SWAP_GAS_LIMIT)
    throw new SwapGasLimitError("Pool quote exceeds the vault swap gas allowance.");
}

function throwQuoteFailure(results: PromiseSettledResult<unknown>[]): void {
  const failed = results.find(
    (result) =>
      result.status === "rejected" &&
      !isError(result.reason, "CALL_EXCEPTION") &&
      !(result.reason instanceof SwapGasLimitError),
  );
  if (failed?.status === "rejected") throw failed.reason;
}

const QUOTER_ABI = [
  "function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
];

/**
 * Reads router bytecode before offering swap controls.
 *
 * @param evmRpcUrl - Captured RPC endpoint.
 * @returns Whether the configured router has deployed code.
 * @throws {Error} If the RPC code read fails.
 */
export async function uniswapAvailable(evmRpcUrl: string): Promise<boolean> {
  return withEthersProvider(evmRpcUrl, async (provider) => {
    const code = await provider.getCode(UNISWAP_SWAP_ROUTER_02);
    return code !== "0x";
  });
}

/**
 * Applies the caller's slippage margin to a static exact-output quote.
 *
 * @param evmRpcUrl - Captured RPC endpoint.
 * @param tokenIn - Input token address.
 * @param tokenOut - Output token address.
 * @param fee - Selected pool fee tier.
 * @param amountOut - Desired output in token base units.
 * @param slippageBps - Input headroom in basis points.
 * @param signal - Cancels an obsolete quote.
 * @returns Quoted input and its slippage-adjusted maximum.
 * @throws {Error} If the pool quote fails.
 */
export async function quoteExactOutputSingle(
  evmRpcUrl: string,
  tokenIn: string,
  tokenOut: string,
  fee: bigint,
  amountOut: bigint,
  slippageBps = 100n,
  signal?: AbortSignal,
): Promise<{ amountIn: bigint; amountInMaximum: bigint }> {
  return withEthersProvider(
    evmRpcUrl,
    async (provider) => {
      const quoter = new EthersContract(UNISWAP_QUOTER_V2, QUOTER_ABI, provider);
      const [amountIn, , , gasEstimate] = await quoter
        .getFunction<
          ContractMethod<
            {
              tokenIn: string;
              tokenOut: string;
              amount: bigint;
              fee: bigint;
              sqrtPriceLimitX96: bigint;
            }[],
            [bigint, bigint, bigint, bigint]
          >
        >("quoteExactOutputSingle")
        .staticCall({
          tokenIn,
          tokenOut,
          amount: amountOut,
          fee,
          sqrtPriceLimitX96: 0n,
        });
      assertSwapGasEstimate(gasEstimate);
      const amountInMaximum = (amountIn * (10_000n + slippageBps)) / 10_000n;
      return { amountIn: amountIn, amountInMaximum };
    },
    { timeoutMs: SWAP_READ_TIMEOUT_MS, signal },
  );
}

/** Fee tiers searched independently so an unavailable pool does not discard other quotes. */
export const UNISWAP_FEE_TIERS = [100n, 500n, 3000n, 10000n];

/**
 * Retains the lowest positive input quote across independently queried pool tiers.
 *
 * @param evmRpcUrl - Captured RPC endpoint.
 * @param tokenIn - Input token address.
 * @param tokenOut - Output token address.
 * @param amountOut - Desired output in token base units.
 * @param slippageBps - Input headroom in basis points.
 * @param signal - Cancels obsolete tier reads.
 * @returns The winning quote and tier, or null if every tier is unavailable.
 */
export async function quoteBestFee(
  evmRpcUrl: string,
  tokenIn: string,
  tokenOut: string,
  amountOut: bigint,
  slippageBps = 100n,
  signal?: AbortSignal,
): Promise<{ amountIn: bigint; amountInMaximum: bigint; fee: bigint } | null> {
  const results = await Promise.allSettled(
    UNISWAP_FEE_TIERS.map(async (fee) => ({
      fee,
      ...(await quoteExactOutputSingle(
        evmRpcUrl,
        tokenIn,
        tokenOut,
        fee,
        amountOut,
        slippageBps,
        signal,
      )),
    })),
  );
  let best: { amountIn: bigint; amountInMaximum: bigint; fee: bigint } | null = null;
  for (const r of results) {
    if (
      r.status === "fulfilled" &&
      r.value.amountIn > 0n &&
      (!best || r.value.amountIn < best.amountIn)
    ) {
      best = {
        amountIn: r.value.amountIn,
        amountInMaximum: r.value.amountInMaximum,
        fee: r.value.fee,
      };
    }
  }
  if (best === null) throwQuoteFailure(results);
  return best;
}

/**
 * Reads the output expected for a captured input amount at one pool tier.
 *
 * @param evmRpcUrl - Captured RPC endpoint.
 * @param tokenIn - Input token address.
 * @param tokenOut - Output token address.
 * @param fee - Selected pool fee tier.
 * @param amountIn - Input in token base units.
 * @param signal - Cancels an obsolete quote.
 * @returns Expected output in token base units.
 * @throws {Error} If the pool quote fails.
 */
export async function quoteExactInputSingle(
  evmRpcUrl: string,
  tokenIn: string,
  tokenOut: string,
  fee: bigint,
  amountIn: bigint,
  signal?: AbortSignal,
): Promise<{ amountOut: bigint }> {
  return withEthersProvider(
    evmRpcUrl,
    async (provider) => {
      const quoter = new EthersContract(UNISWAP_QUOTER_V2, QUOTER_ABI, provider);
      const [amountOut, , , gasEstimate] = await quoter
        .getFunction<
          ContractMethod<
            {
              tokenIn: string;
              tokenOut: string;
              amountIn: bigint;
              fee: bigint;
              sqrtPriceLimitX96: bigint;
            }[],
            [bigint, bigint, bigint, bigint]
          >
        >("quoteExactInputSingle")
        .staticCall({
          tokenIn,
          tokenOut,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        });
      assertSwapGasEstimate(gasEstimate);
      return { amountOut: amountOut };
    },
    { timeoutMs: SWAP_READ_TIMEOUT_MS, signal },
  );
}

/**
 * Retains the highest positive output quote and the exact pool tier that produced it.
 *
 * @param evmRpcUrl - Captured RPC endpoint.
 * @param tokenIn - Input token address.
 * @param tokenOut - Output token address.
 * @param amountIn - Input in token base units.
 * @param signal - Cancels obsolete tier reads.
 * @returns The winning output and tier, or null if every tier is unavailable.
 */
export async function quoteBestFeeExactInput(
  evmRpcUrl: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  signal?: AbortSignal,
): Promise<{ amountOut: bigint; fee: bigint } | null> {
  const results = await Promise.allSettled(
    UNISWAP_FEE_TIERS.map(async (fee) => ({
      fee,
      ...(await quoteExactInputSingle(evmRpcUrl, tokenIn, tokenOut, fee, amountIn, signal)),
    })),
  );
  let best: { amountOut: bigint; fee: bigint } | null = null;
  for (const r of results) {
    if (
      r.status === "fulfilled" &&
      r.value.amountOut > 0n &&
      (!best || r.value.amountOut > best.amountOut)
    ) {
      best = { amountOut: r.value.amountOut, fee: r.value.fee };
    }
  }
  if (best === null) throwQuoteFailure(results);
  return best;
}

/**
 * Normalises both token order and casing for pool-discovery lookups.
 *
 * @param tokenA - First token address.
 * @param tokenB - Second token address.
 * @returns A stable key shared by both orderings of the pair.
 */
export function pairKey(tokenA: string, tokenB: string): string {
  return [tokenA.toLowerCase(), tokenB.toLowerCase()].sort().join("|");
}

const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];

/**
 * Collects direct-pool pairs while tolerating failures for individual pair/tier reads.
 *
 * @param evmRpcUrl - Captured RPC endpoint.
 * @param tokens - Candidate token addresses.
 * @param signal - Cancels obsolete discovery.
 * @returns Normalised pair keys with at least one deployed pool.
 */
export async function discoverSwappablePairs(
  evmRpcUrl: string,
  tokens: string[],
  signal?: AbortSignal,
): Promise<Set<string>> {
  return withEthersProvider(
    evmRpcUrl,
    async (provider) => {
      const factory = new EthersContract(UNISWAP_V3_FACTORY, FACTORY_ABI, provider);
      const getPool =
        factory.getFunction<ConstantContractMethod<(string | bigint)[], string>>("getPool");
      const swappable = new Set<string>();
      const checks: Promise<void>[] = [];
      let failure: unknown;
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          const a = tokens[i];
          const b = tokens[j];
          if (a === undefined || b === undefined) continue;
          for (const fee of UNISWAP_FEE_TIERS) {
            checks.push(
              getPool(a, b, fee)
                .then((pool: string) => {
                  if (pool && pool !== ZeroAddress) swappable.add(pairKey(a, b));
                })
                .catch((error: unknown) => {
                  failure = error;
                }),
            );
          }
        }
      }
      await Promise.all(checks);
      if (swappable.size === 0 && failure)
        throw failure instanceof Error ? failure : new Error("Pool discovery failed.");
      return swappable;
    },
    { timeoutMs: SWAP_READ_TIMEOUT_MS, signal },
  );
}

/**
 * Reads the pooled vault account's allowance for the configured swap router.
 *
 * @param evmRpcUrl - Captured RPC endpoint.
 * @param erc20Hex - Token contract address.
 * @param vaultEvmAddress - Derived vault account whose approval is inspected.
 * @returns Current allowance in token base units.
 * @throws {Error} If the token allowance read fails.
 */
export async function routerAllowance(
  evmRpcUrl: string,
  erc20Hex: string,
  vaultEvmAddress: string,
): Promise<bigint> {
  return withEthersProvider(evmRpcUrl, async (provider) => {
    const token = new EthersContract(
      erc20Hex,
      ["function allowance(address,address) view returns (uint256)"],
      provider,
    );
    return await token.getFunction<ConstantContractMethod<string[], bigint>>("allowance")(
      vaultEvmAddress,
      UNISWAP_SWAP_ROUTER_02,
    );
  });
}
