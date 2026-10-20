import type { VaultGasKind } from '@sig-net/midnight-examples-erc20-vault-contract'
import { z } from 'zod'

import { messageOf } from '@/lib/message-of'

/**
 * The checks the backend reads for a caller. The caller's own DUST is read by the browser that
 * holds the wallet, so `ReadinessChecks` is complete only there.
 */
export type VaultReadiness = Pick<ReadinessChecks, BackendReadinessCheckId>

/** One check per payer of an action's fees, keyed by what it pays with. */
export type ReadinessChecks = Readonly<Record<ReadinessCheckId, ReadinessCheck>>

export const READINESS_CHECK_IDS = [
  'callerDust',
  'relayerDust',
  'depositAccountEth',
  'vaultAccountEth',
] as const

export type ReadinessCheckId = (typeof READINESS_CHECK_IDS)[number]

export const BACKEND_READINESS_CHECK_IDS = [
  'relayerDust',
  'depositAccountEth',
  'vaultAccountEth',
] as const satisfies readonly ReadinessCheckId[]

export type BackendReadinessCheckId = (typeof BACKEND_READINESS_CHECK_IDS)[number]

export const READINESS_ASSETS = ['DUST', 'ETH'] as const

export type ReadinessAsset = (typeof READINESS_ASSETS)[number]

/** Base units per whole unit, as a decimal count: 1 DUST is 10^15 SPECK, 1 ETH is 10^18 wei. */
export const READINESS_ASSET_DECIMALS: Record<ReadinessAsset, number> = { DUST: 15, ETH: 18 }

const balanceCheckSchema = z.object({
  asset: z.enum(READINESS_ASSETS),
  /** The account whose balance is read, in the asset's own address form. */
  account: z.string(),
  available: z.bigint().nonnegative(),
  required: z.bigint().nonnegative(),
})

/** A balance read against what the payer needs, or the reason the read failed: never a zero. */
export const readinessCheckSchema = z.discriminatedUnion('status', [
  balanceCheckSchema.extend({ status: z.literal('ok') }),
  balanceCheckSchema.extend({ status: z.literal('insufficient') }),
  z.object({
    status: z.literal('unavailable'),
    asset: z.enum(READINESS_ASSETS),
    account: z.string(),
    reason: z.string(),
  }),
])

export type ReadinessCheck = z.infer<typeof readinessCheckSchema>

export const vaultReadinessSchema = z.object({
  relayerDust: readinessCheckSchema,
  depositAccountEth: readinessCheckSchema,
  vaultAccountEth: readinessCheckSchema,
})

/** The actions a readiness gate exists for: the deposit, and every kind the vault account signs. */
export type ReadinessAction = 'deposit' | VaultGasKind

/** The checks `action` needs that do not pass, in the order a warning lists them: empty when ready. */
export function missingReadiness(
  action: ReadinessAction,
  checks: ReadinessChecks,
): ReadinessCheckId[] {
  return READINESS_CHECKS_BY_ACTION[action].filter((id) => checks[id].status !== 'ok')
}

/** What every action the vault account signs for needs: the relayer's DUST for the flushes and sends, the vault account's ETH for the gas. */
const VAULT_SIGNED_CHECKS = ['relayerDust', 'vaultAccountEth'] as const

/** The relayer pays every caller call's fee, so each list holds the relayer's DUST and the paying account's ETH. */
const READINESS_CHECKS_BY_ACTION: Record<ReadinessAction, readonly ReadinessCheckId[]> = {
  deposit: ['relayerDust', 'depositAccountEth'],
  withdraw: VAULT_SIGNED_CHECKS,
  approve: VAULT_SIGNED_CHECKS,
  swap: VAULT_SIGNED_CHECKS,
  supply: VAULT_SIGNED_CHECKS,
  redeem: VAULT_SIGNED_CHECKS,
}

/** Runs one read and turns its outcome into a check: a thrown read is reported, not treated as empty. */
export async function readReadinessCheck(
  asset: ReadinessAsset,
  account: string,
  read: () => Promise<{ readonly available: bigint; readonly required: bigint }>,
): Promise<ReadinessCheck> {
  try {
    const { available, required } = await read()
    return {
      status: available >= required ? 'ok' : 'insufficient',
      asset,
      account,
      available,
      required,
    }
  } catch (error: unknown) {
    return { status: 'unavailable', asset, account, reason: messageOf(error) }
  }
}

/**
 * The DUST a payer must hold before an action starts, in SPECK. An action whose caller calls the
 * page builds costs the relayer the fees of the caller's two transactions, two flushes, a send
 * and an attestation, and the local chain's fee overhead alone is 0.05 DUST per transaction, so
 * both minimums leave several times that.
 */
export const CALLER_DUST_MINIMUM = 1_000_000_000_000_000n
export const RELAYER_DUST_MINIMUM = 5_000_000_000_000_000n
