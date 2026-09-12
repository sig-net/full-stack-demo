import { z } from 'zod';
import {
  ERC20_TRANSFER_GAS_LIMIT,
  ERC20_TRANSFER_MAX_FEE_PER_GAS,
  STATA_GAS_LIMIT,
  STATA_MAX_FEE_PER_GAS,
  SWAP_GAS_LIMIT,
  SWAP_MAX_FEE_PER_GAS,
} from '@/lib/midnight/evm-envelope';

export const gasTopUpRequestSchema = z.union([
  z
    .object({
      operation: z.literal('deposit'),
      recipient: z
        .object({
          kind: z.literal('deposit'),
          path: z.string().regex(/^[0-9a-f]{64}$/),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.enum(['withdraw', 'swap', 'supply', 'redeem']),
      recipient: z.object({ kind: z.literal('vault') }).strict(),
    })
    .strict(),
]);

export type GasTopUpRequest = z.infer<typeof gasTopUpRequestSchema>;

// Swap and supply reserve both the approval and the subsequent operation.
export const GAS_TOPUP_ALLOWANCES = {
  deposit: {
    gasLimit: ERC20_TRANSFER_GAS_LIMIT,
    maxFeePerGas: ERC20_TRANSFER_MAX_FEE_PER_GAS,
  },
  withdraw: {
    gasLimit: ERC20_TRANSFER_GAS_LIMIT,
    maxFeePerGas: ERC20_TRANSFER_MAX_FEE_PER_GAS,
  },
  swap: {
    gasLimit: SWAP_GAS_LIMIT + ERC20_TRANSFER_GAS_LIMIT,
    maxFeePerGas: SWAP_MAX_FEE_PER_GAS,
  },
  supply: {
    gasLimit: STATA_GAS_LIMIT + ERC20_TRANSFER_GAS_LIMIT,
    maxFeePerGas: STATA_MAX_FEE_PER_GAS,
  },
  redeem: { gasLimit: STATA_GAS_LIMIT, maxFeePerGas: STATA_MAX_FEE_PER_GAS },
} satisfies Record<
  GasTopUpRequest['operation'],
  { gasLimit: bigint; maxFeePerGas: bigint }
>;
