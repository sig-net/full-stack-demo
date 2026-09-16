import { sepoliaChainConfig } from "@/lib/config/runtime";
import { fetchErc20Decimals } from "@/lib/constants/token-metadata";

import { type Env, erc20Balance, vaultTokenType } from "./vault";
import type { AppVaultProviders } from "./vault-providers";

/** Independently observed token balances and precision, with null marking unavailable reads. */
export interface VaultTokenBalance {
  vaultUnits: bigint | null;
  depositUnits: bigint | null;
  vaultPoolUnits: bigint | null;
  decimals: number | null;
}

/** Wallet resources and per-token vault/deposit observations from one captured binding. */
export interface VaultBalances {
  night: bigint | null;
  dust: bigint | null;
  perToken: Record<string, VaultTokenBalance>;
}

/**
 * Preserves successful observations when another balance source is unavailable.
 *
 * @param providers - Session-guarded wallet balance capabilities.
 * @param env - Captured vault deployment and EVM RPC.
 * @param tokens - Token addresses to observe.
 * @param depAddr - Derived EVM deposit account, empty when unavailable.
 * @param vAddr - Pooled EVM vault account, empty when unavailable.
 * @returns Independent observations with missing shielded tokens represented as zero.
 */
export async function readBalances(
  providers: AppVaultProviders,
  env: Env,
  tokens: string[],
  depAddr: string,
  vAddr: string,
): Promise<VaultBalances> {
  const src = providers.balancesSource;
  const [dust, unshielded, shielded] = await Promise.all([
    src.dust().catch(() => null),
    src.unshielded().catch(() => null),
    src.shielded().catch(() => null),
  ]);
  const night = unshielded === null ? null : Object.values(unshielded).reduce((a, b) => a + b, 0n);
  const shieldedByType =
    shielded === null
      ? null
      : Object.fromEntries(
          Object.entries(shielded).map(([key, value]) => [
            key.toLowerCase().replace(/^0x/, ""),
            value,
          ]),
        );
  const entries = await Promise.all(
    tokens.map(async (erc20) => {
      const [depositUnits, vaultPoolUnits, decimals] = await Promise.all([
        depAddr ? erc20Balance(env.evmRpcUrl, erc20, depAddr).catch(() => null) : null,
        vAddr ? erc20Balance(env.evmRpcUrl, erc20, vAddr).catch(() => null) : null,
        fetchErc20Decimals(erc20, sepoliaChainConfig(env.evmRpcUrl)).catch(() => null),
      ]);
      const vaultUnits =
        shieldedByType === null
          ? null
          : (shieldedByType[vaultTokenType(erc20, env.contractAddress)] ?? 0n);
      return [erc20.toLowerCase(), { vaultUnits, depositUnits, vaultPoolUnits, decimals }] as const;
    }),
  );
  return { night, dust, perToken: Object.fromEntries(entries) };
}
