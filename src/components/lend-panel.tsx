'use client'

import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, LoaderCircle, Upload } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'

import { ACTIVITIES_QUERY_KEY } from '@/components/activity-section'
import { useCaller } from '@/components/contexts/CallerContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { ReadinessChecklist } from '@/components/readiness-checklist'
import { TokenAmountField } from '@/components/token-amount-field'
import { Button } from '@/components/ui/button'
import { useMidnightBalances } from '@/components/use-midnight-balances'
import { useSpotPrices } from '@/components/use-spot-prices'
import type { SupportedBalance } from '@/lib/balances/supported-balances'
import {
  missingReadiness,
  type ReadinessCheckId,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import { parseTokenAmount } from '@/lib/tokens/parse-token-amount'
import type { TokenInfo } from '@/lib/tokens/token-info'
import { startRedeem } from '@/server/actions/redeem-actions'
import { getSupplyTarget, startSupply } from '@/server/actions/supply-actions'

const AMOUNT_INPUT = /^\d*\.?\d*$/

/** The wrapper's allowance moves only when an approval lands, so the target follows at the sweep's pace. */
const TARGET_REFETCH_INTERVAL_MS = 30_000

/**
 * The lending leg of the vault, Aave's static wrapper. Supply deposits the wallet's vault coins
 * of the wrapper's underlying into it from the vault account, which keeps the shares and mints
 * them to the wallet as the wrapper's vault token. Redeem burns those shares for the underlying
 * the wrapper pays the vault account, minted back to the wallet. Both read the pinned pair from
 * the supply target, and only Supply needs its allowance.
 */
export function LendPanel(): ReactNode {
  const { callerSecret, callerName } = useCaller()
  const { wallet } = useMidnightWallet()
  const registry = useTokenInfoRegistry()
  const { checks } = useVaultReadiness()
  const balances = useMidnightBalances()
  const prices = useSpotPrices()
  const queryClient = useQueryClient()
  const [supplyText, setSupplyText] = useState('')
  const [redeemText, setRedeemText] = useState('')

  const target = useQuery({
    queryKey: ['supply-target', callerName],
    queryFn:
      callerSecret === null
        ? skipToken
        : async () => {
            const result = await getSupplyTarget(callerSecret, {})
            if (!result.ok) throw new Error(result.error)
            return result.target
          },
    refetchInterval: TARGET_REFETCH_INTERVAL_MS,
  })
  const underlying =
    target.data === undefined
      ? undefined
      : registry.byErc20Address(target.data.underlyingErc20Address)
  const stata =
    target.data === undefined ? undefined : registry.byErc20Address(target.data.stataErc20Address)
  // The wrapper's token is outside the vault's allowlist, so the balance is matched by token type, not by the supported set.
  const sourceOf = (token: TokenInfo | undefined): SupportedBalance | null => {
    const balance = balances.data?.find((candidate) => candidate.tokenType === token?.id.tokenType)
    return token === undefined || balance === undefined ? null : { token, balance }
  }
  const supplySource = sourceOf(underlying)
  const redeemSource = sourceOf(stata)
  const supplyAmount = amountOf(supplyText, supplySource)
  const redeemAmount = amountOf(redeemText, redeemSource)

  const supplying = useMutation({
    mutationFn: async () => {
      if (callerSecret === null) throw new Error('The identity secret is not set.')
      if (wallet === null) throw new Error('No Midnight wallet is connected.')
      if (supplyAmount.value === null) throw new Error('No amount to supply.')
      const result = await startSupply(callerSecret, {
        supplyRequest: { amount: supplyAmount.value },
        wallet: wallet.publicKeys,
      })
      if (!result.ok) throw new Error(result.error)
      return result.supply
    },
    onSuccess: async () => {
      toast.success(
        `Supply of ${supplyText} ${underlying?.symbol ?? ''} started. Sign its start call from the Activity row once it is proved.`,
      )
      setSupplyText('')
      await queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
    },
    onError: (error) => {
      toast.error(`Starting the supply failed: ${error.message}`)
    },
  })
  const redeeming = useMutation({
    mutationFn: async () => {
      if (callerSecret === null) throw new Error('The identity secret is not set.')
      if (wallet === null) throw new Error('No Midnight wallet is connected.')
      if (redeemAmount.value === null) throw new Error('No shares to redeem.')
      const result = await startRedeem(callerSecret, {
        redeemRequest: { shares: redeemAmount.value },
        wallet: wallet.publicKeys,
      })
      if (!result.ok) throw new Error(result.error)
      return result.redeem
    },
    onSuccess: async () => {
      toast.success(
        `Redeem of ${redeemText} ${stata?.symbol ?? ''} started. Sign its start call from the Activity row once it is proved.`,
      )
      setRedeemText('')
      await queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
    },
    onError: (error) => {
      toast.error(`Starting the redeem failed: ${error.message}`)
    },
  })

  const pairBlocker =
    callerSecret === null
      ? 'Set the identity secret first.'
      : wallet === null
        ? 'Connect a Midnight wallet first.'
        : target.isError
          ? target.error.message
          : target.data === undefined
            ? 'Reading the lending pair from the vault…'
            : underlying === undefined || stata === undefined
              ? 'The vault pins a lending pair the registry does not know.'
              : null
  const supplyBlocker =
    pairBlocker ??
    (target.data !== undefined && target.data.allowance === 0n
      ? `The vault has not approved the Aave wrapper to spend its ${underlying?.symbol ?? ''}: approve the wrapper from the admin page first.`
      : supplySource === null && balances.isSuccess
        ? `Deposit ${underlying?.symbol ?? ''} first: the wallet holds none of it.`
        : supplyAmount.error)
  const redeemBlocker =
    pairBlocker ??
    (redeemSource === null && balances.isSuccess
      ? `Supply ${underlying?.symbol ?? ''} first: the wallet holds no ${stata?.symbol ?? ''}.`
      : redeemAmount.error)

  return (
    <section aria-labelledby="lend-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col items-center gap-5 border-[0.5px] bg-linear-to-b from-swap-panel-from to-swap-panel-to p-[39.5px] md:border-x-0 md:border-y md:p-9.75">
        <h2 id="lend-title" className="text-base/6 font-medium text-swap-panel-foreground">
          Lend on Aave
        </h2>
        <LendAction
          label="Supply"
          Icon={Upload}
          token={underlying ?? null}
          source={supplySource}
          amountText={supplyText}
          onAmountChange={setSupplyText}
          usdEstimate={
            underlying === undefined || supplyAmount.value === null
              ? null
              : prices.table.usdValueOf(underlying, supplyAmount.value)
          }
          blocker={supplyBlocker}
          summary={`Deposits ${underlying?.symbol ?? ''} into the wrapper from the vault account and mints you its ${stata?.symbol ?? 'shares'}.`}
          missing={missingReadiness('supply', checks)}
          ready={supplyAmount.value !== null}
          busy={supplying.isPending}
          busyLabel="Starting the supply…"
          onStart={() => {
            supplying.mutate()
          }}
        />
        <LendAction
          label="Redeem"
          Icon={Download}
          token={stata ?? null}
          source={redeemSource}
          amountText={redeemText}
          onAmountChange={setRedeemText}
          usdEstimate={
            stata === undefined || redeemAmount.value === null
              ? null
              : prices.table.usdValueOf(stata, redeemAmount.value)
          }
          blocker={redeemBlocker}
          summary={`Burns your ${stata?.symbol ?? 'shares'} for the ${underlying?.symbol ?? ''} the wrapper pays the vault account, minted back to you.`}
          missing={missingReadiness('redeem', checks)}
          ready={redeemAmount.value !== null}
          busy={redeeming.isPending}
          busyLabel="Starting the redeem…"
          onStart={() => {
            redeeming.mutate()
          }}
        />
      </div>
    </section>
  )
}

interface LendActionProps {
  label: string
  Icon: typeof Upload
  /** The one token the action moves, fixed by the vault's pinned pair. */
  token: TokenInfo | null
  /** The wallet's balance of that token, the amount's ceiling. */
  source: SupportedBalance | null
  amountText: string
  onAmountChange: (text: string) => void
  /** The typed amount at spot, for the field's value line. */
  usdEstimate: string | null
  /** Why the action cannot start yet, or null to show the summary. */
  blocker: string | null
  summary: string
  missing: readonly ReadinessCheckId[]
  ready: boolean
  busy: boolean
  busyLabel: string
  onStart: () => void
}

/** One lending action: its amount field over the wallet's balance, its status and its control. */
function LendAction({
  label,
  Icon,
  token,
  source,
  amountText,
  onAmountChange,
  usdEstimate,
  blocker,
  summary,
  missing,
  ready,
  busy,
  busyLabel,
  onStart,
}: LendActionProps): ReactNode {
  return (
    <div className="flex flex-col gap-3 self-stretch">
      <h3 className="text-sm/5 font-semibold text-swap-panel-foreground">{label}</h3>
      <TokenAmountField
        label={label}
        amount={amountText}
        onAmountChange={(text) => {
          if (AMOUNT_INPUT.test(text)) onAmountChange(text)
        }}
        tokens={token === null ? [] : [token]}
        token={token}
        onTokenChange={() => undefined}
        disabled={busy || token === null}
        balance={
          source === null
            ? undefined
            : {
                amount: source.balance.amount,
                onMax: () => {
                  onAmountChange(source.balance.amount)
                },
              }
        }
        usdEstimate={usdEstimate}
      />
      <div role="status" className="text-sm text-muted-foreground">
        {blocker ?? summary}
      </div>
      {blocker === null && missing.length > 0 && (
        <div className="text-sm">
          <ReadinessChecklist checkIds={missing} />
        </div>
      )}
      <Button
        variant="pink"
        size="xl"
        disabled={!ready || blocker !== null || missing.length > 0 || busy}
        className="w-full"
        onClick={onStart}
      >
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Icon aria-hidden />}
        <span className="px-0.5">{busy ? busyLabel : label}</span>
      </Button>
    </div>
  )
}

/** The typed amount in base units, or why it cannot be moved yet. */
function amountOf(
  text: string,
  source: SupportedBalance | null,
): { value: bigint | null; error: string | null } {
  if (source === null || text === '') return { value: null, error: null }
  try {
    const value = parseTokenAmount(text, source.token.decimals)
    if (value <= 0n) return { value: null, error: null }
    if (value > source.balance.baseUnits) {
      return {
        value: null,
        error: `That is more than your ${formatTokenAmount(source.balance.baseUnits, source.token.decimals)} ${source.token.symbol}.`,
      }
    }
    return { value, error: null }
  } catch (error: unknown) {
    return { value: null, error: error instanceof Error ? error.message : String(error) }
  }
}
