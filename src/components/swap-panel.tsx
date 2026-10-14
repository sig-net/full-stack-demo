'use client'

import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, LoaderCircle, SlidersHorizontal } from 'lucide-react'
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
import { useDebouncedValue } from '@/components/use-debounced-value'
import { useMidnightBalances } from '@/components/use-midnight-balances'
import { missingReadiness } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import { parseTokenAmount } from '@/lib/tokens/parse-token-amount'
import type { TokenInfo } from '@/lib/tokens/token-info'
import { quoteSwap, startSwap } from '@/server/actions/swap-actions'

const AMOUNT_INPUT = /^\d*\.?\d*$/

/** How long the amount must rest before it is priced, so typing does not price every keystroke. */
const QUOTE_DEBOUNCE_MS = 400

/**
 * Sells vault tokens the wallet holds for another token the vault admits, at a live quote. The
 * From amount is what the swap may spend at most and is surrendered whole, the To amount is the
 * least the trade accepts, and whatever the trade does not spend comes back as change.
 */
export function SwapPanel(): ReactNode {
  const { callerSecret, callerName } = useCaller()
  const { wallet } = useMidnightWallet()
  const registry = useTokenInfoRegistry()
  const { checks } = useVaultReadiness()
  const balances = useMidnightBalances()
  const queryClient = useQueryClient()
  const [fromAmount, setFromAmount] = useState('')
  const [fromErc20Address, setFromErc20Address] = useState<string | null>(null)
  const [toErc20Address, setToErc20Address] = useState<string | null>(null)

  const sources = (balances.data ?? []).flatMap((balance) => {
    const info = registry.get({ ledger: 'shielded', tokenType: balance.tokenType })
    return info !== undefined && info.supported ? [info] : []
  })
  const fromToken = sources.find((info) => info.origin.erc20Address === fromErc20Address) ?? null
  const destinations = registry
    .supported()
    .filter((info) => info.origin.erc20Address !== fromToken?.origin.erc20Address)
  const toToken = destinations.find((info) => info.origin.erc20Address === toErc20Address) ?? null
  const amountIn = amountInOf(fromAmount, fromToken)
  const restingAmount = useDebouncedValue(amountIn.value?.toString() ?? null, QUOTE_DEBOUNCE_MS)

  const quote = useQuery({
    queryKey: [
      'swap-quote',
      callerName,
      fromToken?.origin.erc20Address,
      toToken?.origin.erc20Address,
      restingAmount,
    ],
    queryFn:
      callerSecret === null || fromToken === null || toToken === null || restingAmount === null
        ? skipToken
        : async () => {
            const result = await quoteSwap(callerSecret, {
              erc20AddressIn: fromToken.origin.erc20Address,
              erc20AddressOut: toToken.origin.erc20Address,
              amountIn: BigInt(restingAmount),
            })
            if (!result.ok) throw new Error(result.error)
            return result.quote
          },
    retry: false,
  })
  const swapping = useMutation({
    mutationFn: async () => {
      if (callerSecret === null) throw new Error('The identity secret is not set.')
      if (wallet === null) throw new Error('No Midnight wallet is connected.')
      if (quote.data === undefined || toToken === null) throw new Error('No quote yet.')
      const result = await startSwap(callerSecret, {
        swapRequest: {
          erc20AddressIn: quote.data.erc20AddressIn,
          erc20AddressOut: quote.data.erc20AddressOut,
          fee: quote.data.fee,
          amountOut: quote.data.amountOutMinimum,
          amountInMaximum: quote.data.amountIn,
        },
        wallet: wallet.publicKeys,
      })
      if (!result.ok) throw new Error(result.error)
      return result.swap
    },
    onSuccess: async () => {
      toast.success(
        `Swap of ${fromAmount} ${fromToken?.symbol ?? ''} started. Sign its start call from the Activity row once it is proved.`,
      )
      setFromAmount('')
      await queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
    },
    onError: (error) => {
      toast.error(`Starting the swap failed: ${error.message}`)
    },
  })

  const missing = missingReadiness('swap', checks)
  // The quote carries addresses in lower case, the registry in checksum case.
  const quoteCurrent =
    quote.data !== undefined &&
    amountIn.value !== null &&
    quote.data.amountIn === amountIn.value &&
    quote.data.erc20AddressIn === fromToken?.origin.erc20Address.toLowerCase() &&
    quote.data.erc20AddressOut === toToken?.origin.erc20Address.toLowerCase()
  const toAmount =
    quoteCurrent && toToken !== null
      ? formatTokenAmount(quote.data.amountOutMinimum, toToken.decimals)
      : ''
  const blocker =
    callerSecret === null
      ? 'Set the identity secret to swap.'
      : wallet === null
        ? 'Connect a Midnight wallet to swap.'
        : sources.length === 0 && balances.isSuccess
          ? 'Deposit a token first: the wallet holds nothing the vault admits.'
          : amountIn.error
  const busy = swapping.isPending
  const ready =
    blocker === null &&
    missing.length === 0 &&
    quoteCurrent &&
    (balances.data ?? []).some(
      (balance) =>
        registry.get({ ledger: 'shielded', tokenType: balance.tokenType })?.origin.erc20Address ===
        fromToken?.origin.erc20Address,
    )

  return (
    <section aria-labelledby="swap-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col items-center gap-5 border-[0.5px] bg-linear-to-b from-swap-panel-from to-swap-panel-to p-[39.5px] md:border-x-0 md:border-y md:p-9.75">
        <div className="flex h-8 items-center justify-between self-stretch">
          <h2 id="swap-title" className="text-xl/6 font-semibold text-swap-panel-foreground">
            Swap
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Swap settings"
            className="size-8 text-swap-panel-icon"
          >
            <SlidersHorizontal aria-hidden="true" strokeWidth={1.5} className="size-8" />
          </Button>
        </div>
        <TokenAmountField
          label="From"
          amount={fromAmount}
          onAmountChange={(amount) => {
            if (AMOUNT_INPUT.test(amount)) setFromAmount(amount)
          }}
          tokens={sources}
          token={fromToken}
          onTokenChange={(erc20Address) => {
            setFromErc20Address(erc20Address)
            if (erc20Address === toErc20Address) setToErc20Address(null)
          }}
          disabled={busy}
        />
        <ArrowDown aria-hidden="true" className="size-5 shrink-0 text-swap-panel-icon" />
        <TokenAmountField
          label="To"
          amount={toAmount}
          tokens={destinations}
          token={toToken}
          onTokenChange={setToErc20Address}
          disabled={busy}
        />
        <div role="status" className="self-stretch text-sm text-muted-foreground">
          {blocker !== null
            ? blocker
            : quote.isError
              ? quote.error.message
              : quote.isFetching
                ? 'Pricing the swap…'
                : quoteCurrent && toToken !== null
                  ? `Receive at least ${toAmount} ${toToken.symbol} at the ${feeLabel(quote.data.fee)} pool, with unspent ${fromToken?.symbol ?? ''} returned as change.`
                  : 'Choose both tokens and an amount to price the swap.'}
        </div>
        {blocker === null && missing.length > 0 && (
          <div className="self-stretch text-sm">
            <ReadinessChecklist checkIds={missing} />
          </div>
        )}
        <Button
          variant="pink"
          size="xl"
          disabled={!ready || busy}
          className="w-full"
          onClick={() => {
            swapping.mutate()
          }}
        >
          {busy && <LoaderCircle className="animate-spin" aria-hidden />}
          <span className="px-0.5">{busy ? 'Starting the swap…' : 'Swap'}</span>
        </Button>
      </div>
    </section>
  )
}

/** The typed amount in base units, or why it cannot be priced yet. */
function amountInOf(
  text: string,
  token: TokenInfo | null,
): { value: bigint | null; error: string | null } {
  if (token === null || text === '') return { value: null, error: null }
  try {
    const value = parseTokenAmount(text, token.decimals)
    return value > 0n ? { value, error: null } : { value: null, error: null }
  } catch (error: unknown) {
    return { value: null, error: error instanceof Error ? error.message : String(error) }
  }
}

/** A Uniswap fee tier in basis points of a percent as the percentage it is, such as `0.05%`. */
function feeLabel(fee: bigint): string {
  return `${(Number(fee) / 10_000).toString()}%`
}
