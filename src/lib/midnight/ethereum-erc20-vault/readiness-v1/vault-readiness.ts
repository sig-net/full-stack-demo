import type { VaultGasKind } from '@sig-net/midnight-examples-erc20-vault-contract'
import { z } from 'zod'

import { messageOf } from '@/lib/message-of'

/**
 * The payer checks the backend reads for a caller. The caller's own DUST is read by the browser
 * that holds the wallet and the initialisation is read on its own, so `ReadinessChecks` is
 * complete only in the browser.
 */
export type VaultReadiness = Pick<ReadinessChecks, BackendBalanceCheckId>

/** Whether the vault is initialised, then one balance check per payer of an action's fees, keyed by what it pays with. */
export type ReadinessChecks = { readonly vaultInitialised: InitialisationCheck } & Readonly<
  Record<BalanceCheckId, BalanceCheck>
>

export const BALANCE_CHECK_IDS = [
  'callerDust',
  'relayerDust',
  'depositAccountEth',
  'vaultAccountEth',
] as const

export type BalanceCheckId = (typeof BALANCE_CHECK_IDS)[number]

export const READINESS_CHECK_IDS = ['vaultInitialised', ...BALANCE_CHECK_IDS] as const

export type ReadinessCheckId = (typeof READINESS_CHECK_IDS)[number]

export const BACKEND_BALANCE_CHECK_IDS = [
  'relayerDust',
  'depositAccountEth',
  'vaultAccountEth',
] as const satisfies readonly BalanceCheckId[]

export type BackendBalanceCheckId = (typeof BACKEND_BALANCE_CHECK_IDS)[number]

/** Whether the deployer's `initialise` call has run, or the reason the ledger read failed: never an uninitialised guess. */
export const initialisationCheckSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok') }),
  z.object({ status: z.literal('uninitialised') }),
  z.object({ status: z.literal('unavailable'), reason: z.string() }),
])

export type InitialisationCheck = z.infer<typeof initialisationCheckSchema>

export const READINESS_ASSETS = ['DUST', 'ETH'] as const

export type ReadinessAsset = (typeof READINESS_ASSETS)[number]

/** Base units per whole unit, as a decimal count: 1 DUST is 10^15 SPECK, 1 ETH is 10^18 wei. */
export const READINESS_ASSET_DECIMALS: Record<ReadinessAsset, number> = { DUST: 15, ETH: 18 }

const balanceReadSchema = z.object({
  asset: z.enum(READINESS_ASSETS),
  /** The account whose balance is read, in the asset's own address form. */
  account: z.string(),
  available: z.bigint().nonnegative(),
  required: z.bigint().nonnegative(),
})

/** A balance read against what the payer needs, or the reason the read failed: never a zero. */
export const balanceCheckSchema = z.discriminatedUnion('status', [
  balanceReadSchema.extend({ status: z.literal('ok') }),
  balanceReadSchema.extend({ status: z.literal('insufficient') }),
  z.object({
    status: z.literal('unavailable'),
    asset: z.enum(READINESS_ASSETS),
    account: z.string(),
    reason: z.string(),
  }),
])

export type BalanceCheck = z.infer<typeof balanceCheckSchema>

export const vaultReadinessSchema = z.object({
  relayerDust: balanceCheckSchema,
  depositAccountEth: balanceCheckSchema,
  vaultAccountEth: balanceCheckSchema,
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

/** What every action the vault account signs for needs: the initialised vault, the caller's DUST for its two calls, the relayer's DUST for the flushes and sends, the vault account's ETH for the gas. */
const VAULT_SIGNED_CHECKS = [
  'vaultInitialised',
  'callerDust',
  'relayerDust',
  'vaultAccountEth',
] as const

/** Every start circuit refuses an uninitialised vault, the caller pays its own two calls and the relayer the vault's permissionless ones, so each list holds the initialisation, both DUST checks and the paying account's ETH. */
const READINESS_CHECKS_BY_ACTION: Record<ReadinessAction, readonly ReadinessCheckId[]> = {
  deposit: ['vaultInitialised', 'callerDust', 'relayerDust', 'depositAccountEth'],
  withdraw: VAULT_SIGNED_CHECKS,
  approve: VAULT_SIGNED_CHECKS,
  swap: VAULT_SIGNED_CHECKS,
  supply: VAULT_SIGNED_CHECKS,
  redeem: VAULT_SIGNED_CHECKS,
}

/** Runs one read and turns its outcome into a check: a thrown read is reported, not treated as empty. */
export async function readBalanceCheck(
  asset: ReadinessAsset,
  account: string,
  read: () => Promise<{ readonly available: bigint; readonly required: bigint }>,
): Promise<BalanceCheck> {
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

/** Runs the ledger read and turns its outcome into a check: a thrown read is reported, not treated as uninitialised. */
export async function readInitialisationCheck(
  read: () => Promise<{ readonly initialised: boolean }>,
): Promise<InitialisationCheck> {
  try {
    return (await read()).initialised ? { status: 'ok' } : { status: 'uninitialised' }
  } catch (error: unknown) {
    return { status: 'unavailable', reason: messageOf(error) }
  }
}

/** The DUST the caller's wallet must hold before an action starts, in SPECK: the fees of its two transactions, several times the local chain's overhead of 0.05 DUST per transaction. */
export const CALLER_DUST_MINIMUM = 1_000_000_000_000_000n

/** The DUST the relayer must hold before an action starts, in SPECK: the fees of two flushes, a send and an attestation, several times the local chain's overhead of 0.05 DUST per transaction. */
export const RELAYER_DUST_MINIMUM = 5_000_000_000_000_000n
