import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { bytesToHex } from "@sig-net/midnight";
import { readVaultLedger, VAULT_PATH_HEX } from "@sig-net/midnight-examples-erc20-vault-contract";
import { type NextRequest, NextResponse } from "next/server";

import { getEvmChainConfig } from "@/lib/config/evm";
import { getMidnightChainConfig, midnightIndexerConfig } from "@/lib/config/midnight";
import { requireServerConfiguration } from "@/lib/config/server-runtime";
import { ensureGasForTransaction } from "@/lib/evm/gas-topup";
import { GAS_TOPUP_ALLOWANCES, gasTopUpRequestSchema } from "@/lib/evm/gas-topup-request";
import { createVaultEnvironment } from "@/lib/midnight/env";
import { derivePathAddress, resolvePathRendering } from "@/lib/midnight/evm-addresses";
import { getEthereumProvider } from "@/lib/rpc";

/** Funding credentials and ledger reads execute on the server. */
export const runtime = "nodejs";
/** Allows the captured funding transaction to reach confirmation. */
export const maxDuration = 300;
/** Each request verifies the current configuration attestation and funding deficit. */
export const dynamic = "force-dynamic";

/**
 * Derives the permitted recipient from the ledger before spending server-owned gas funds.
 *
 * @param request - Operation request paired with the server configuration attestation.
 * @returns Funding identity and amount, or a validation or execution error.
 */
export async function POST(
  request: NextRequest,
): Promise<
  NextResponse<{ error: string } | { ok: boolean; topUpTxHash: string | null; topUpAmount: string }>
> {
  const parsed = gasTopUpRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid gas top-up request" }, { status: 400 });
  }

  try {
    requireServerConfiguration(request);
    const midnightConfig = getMidnightChainConfig();
    const evmConfig = getEvmChainConfig();
    const vaultEnvironment = createVaultEnvironment(midnightConfig, evmConfig);
    void vaultEnvironment.contractAddress;
    void vaultEnvironment.mpcSecpPub;
    const publicDataProvider = indexerPublicDataProvider(midnightIndexerConfig(midnightConfig));
    let recipientAddress;
    try {
      const state = await readVaultLedger(publicDataProvider, vaultEnvironment.contractAddress);
      const rendering = resolvePathRendering(vaultEnvironment, bytesToHex(state.vaultEvmAddress));
      const path =
        parsed.data.recipient.kind === "vault" ? VAULT_PATH_HEX : parsed.data.recipient.path;
      recipientAddress = derivePathAddress(vaultEnvironment, path, rendering);
    } finally {
      await publicDataProvider.dispose();
    }

    const allowance = GAS_TOPUP_ALLOWANCES[parsed.data.operation];
    const client = getEthereumProvider(evmConfig);
    const { topUpTxHash, topUpAmount } = await ensureGasForTransaction(
      evmConfig,
      client,
      recipientAddress,
      allowance.gasLimit,
      (allowance.maxFeePerGas * 110n) / 100n,
    );

    return NextResponse.json({
      ok: true,
      topUpTxHash: topUpTxHash ?? null,
      topUpAmount: topUpAmount.toString(),
    });
  } catch (error) {
    console.error("Midnight gas top-up error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gas top-up failed" },
      { status: 500 },
    );
  }
}
