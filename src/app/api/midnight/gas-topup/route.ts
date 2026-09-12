import { NextRequest, NextResponse } from 'next/server';
import { bytesToHex } from '@sig-net/midnight';
import {
  readVaultLedger,
  VAULT_PATH_HEX,
} from '@sig-net/midnight-examples-erc20-vault-contract';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';

import { ensureGasForTransaction } from '@/lib/evm/gas-topup';
import {
  GAS_TOPUP_ALLOWANCES,
  gasTopUpRequestSchema,
} from '@/lib/evm/gas-topup-request';
import { getEthereumProvider } from '@/lib/rpc';
import { midnightEnv, midnightIndexerConfig } from '@/lib/midnight/env';
import {
  derivePathAddress,
  resolvePathRendering,
} from '@/lib/midnight/evm-addresses';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const parsed = gasTopUpRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid gas top-up request' },
      { status: 400 },
    );
  }

  try {
    const publicDataProvider = indexerPublicDataProvider(
      midnightIndexerConfig(),
    );
    let recipientAddress;
    try {
      const state = await readVaultLedger(
        publicDataProvider,
        midnightEnv.contractAddress,
      );
      const rendering = resolvePathRendering(
        midnightEnv,
        bytesToHex(state.vaultEvmAddress),
      );
      const path =
        parsed.data.recipient.kind === 'vault'
          ? VAULT_PATH_HEX
          : parsed.data.recipient.path;
      recipientAddress = derivePathAddress(midnightEnv, path, rendering);
    } finally {
      await publicDataProvider.dispose();
    }

    const allowance = GAS_TOPUP_ALLOWANCES[parsed.data.operation];
    const client = getEthereumProvider();
    const { topUpTxHash, topUpAmount } = await ensureGasForTransaction(
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
    console.error('Midnight gas top-up error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gas top-up failed' },
      { status: 500 },
    );
  }
}
