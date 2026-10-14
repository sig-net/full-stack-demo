'use client'

import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ChevronDown, Info, LoaderCircle, SlidersHorizontal } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ACTIVITIES_QUERY_KEY } from '@/components/activity-section'
import { useCaller } from '@/components/contexts/CallerContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { ReadinessChecklist } from '@/components/readiness-checklist'
import { TokenAmountField } from '@/components/token-amount-field'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useDebouncedValue } from '@/components/use-debounced-value'
import { useMidnightBalances } from '@/components/use-midnight-balances'
import { supportedBalancesOf } from '@/lib/balances/supported-balances'
import { missingReadiness } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { SWAP_MAX_SLIPPAGE_BPS } from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-quote'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import { parseTokenAmount } from '@/lib/tokens/parse-token-amount'
import type { TokenInfo } from '@/lib/tokens/token-info'
import { quoteSwap, startSwap } from '@/server/actions/swap-actions'

const AMOUNT_INPUT = /^\d*\.?\d*$/

/** A slippage percentage as typed: up to two decimals, at most two digits before them. */
const SLIPPAGE_INPUT = /^\d{0,2}\.?\d{0,2}$/

/** The slippage allowance the panel opens with, as a percentage, the same as the quote's own default. */
const DEFAULT_SLIPPAGE_PERCENT = '10'

/** How long the amount must rest before it is priced, so typing does not price every keystroke. */
const QUOTE_DEBOUNCE_MS = 400

/** A balance's Swap control asking for its token as the source, each press a new sequence number. */
export interface SwapSourceRequest {
  readonly erc20Address: string
  readonly sequence: number
}

interface SwapPanelProps {
  /** The latest request, which selects the From token until the user picks another and moves focus to the amount. */
  sourceRequest: SwapSourceRequest | null
}

/**
 * Sells vault tokens the wallet holds for another token the vault admits, at a live quote. The
 * From amount is what the swap may spend at most and is surrendered whole, the To amount is the
 * least the trade accepts, and whatever the trade does not spend comes back as change.
 */
export function SwapPanel({ sourceRequest }: SwapPanelProps): ReactNode {
  const { callerSecret, callerName } = useCaller()
  const { wallet } = useMidnightWallet()
  const registry = useTokenInfoRegistry()
  const { checks } = useVaultReadiness()
  const balances = useMidnightBalances()
  const queryClient = useQueryClient()
  const amountInput = useRef<HTMLInputElement>(null)
  const [fromAmount, setFromAmount] = useState('')
  // The user's choice is tagged with the request it followed, so a newer request overrides it.
  const [fromChoice, setFromChoice] = useState<{ erc20Address: string | null; after: number }>({
    erc20Address: null,
    after: 0,
  })
  const [toErc20Address, setToErc20Address] = useState<string | null>(null)
  const [slippageText, setSlippageText] = useState(DEFAULT_SLIPPAGE_PERCENT)
  const slippage = slippageBpsOf(slippageText)
  const slippageBps = slippage.value
  const fromErc20Address =
    sourceRequest !== null && sourceRequest.sequence > fromChoice.after
      ? sourceRequest.erc20Address
      : fromChoice.erc20Address
  useEffect(() => {
    if (sourceRequest !== null) amountInput.current?.focus()
  }, [sourceRequest])

  const sources = supportedBalancesOf(balances.data ?? [], registry)
  const fromSource =
    sources.find(({ token }) => token.origin.erc20Address === fromErc20Address) ?? null
  const fromToken = fromSource?.token ?? null
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
      slippageBps?.toString(),
    ],
    queryFn:
      callerSecret === null ||
      fromToken === null ||
      toToken === null ||
      restingAmount === null ||
      slippageBps === null
        ? skipToken
        : async () => {
            const result = await quoteSwap(callerSecret, {
              erc20AddressIn: fromToken.origin.erc20Address,
              erc20AddressOut: toToken.origin.erc20Address,
              amountIn: BigInt(restingAmount),
              slippageBps,
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
    quote.data.slippageBps === slippageBps &&
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
          : (slippage.error ?? amountIn.error)
  const busy = swapping.isPending
  const ready = blocker === null && missing.length === 0 && quoteCurrent && fromSource !== null

  return (
    <section aria-labelledby="swap-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col items-center gap-5 border-[0.5px] bg-linear-to-b from-swap-panel-from to-swap-panel-to p-[39.5px] md:border-x-0 md:border-y md:p-9.75">
        <h2 id="swap-title" className="text-base/6 font-medium text-swap-panel-foreground">
          Swap on Uniswap
        </h2>
        <TokenAmountField
          label="From"
          amount={fromAmount}
          onAmountChange={(amount) => {
            if (AMOUNT_INPUT.test(amount)) setFromAmount(amount)
          }}
          tokens={sources.map(({ token }) => token)}
          token={fromToken}
          onTokenChange={(erc20Address) => {
            setFromChoice({ erc20Address, after: sourceRequest?.sequence ?? 0 })
            if (erc20Address === toErc20Address) setToErc20Address(null)
          }}
          disabled={busy}
          balance={
            fromSource === null
              ? undefined
              : {
                  amount: fromSource.balance.amount,
                  onMax: () => {
                    setFromAmount(fromSource.balance.amount)
                  },
                }
          }
          inputRef={amountInput}
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
        <Collapsible className="flex flex-col gap-3 self-stretch">
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="self-start text-muted-foreground"
                disabled={busy}
              />
            }
          >
            <SlidersHorizontal aria-hidden />
            <span className="group-aria-expanded/button:hidden">Advanced</span>
            <span className="hidden group-aria-expanded/button:inline">Hide advanced</span>
            <ChevronDown
              className="size-4 transition-transform group-aria-expanded/button:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <TooltipProvider>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Label htmlFor="swap-slippage">Slippage</Label>
                <InputGroup className="h-8 w-24 rounded-xs border-swap-panel-field-border bg-swap-panel-select dark:bg-swap-panel-select">
                  <InputGroupInput
                    id="swap-slippage"
                    inputMode="decimal"
                    autoComplete="off"
                    value={slippageText}
                    disabled={busy}
                    aria-invalid={slippage.error !== null}
                    onChange={(event) => {
                      if (SLIPPAGE_INPUT.test(event.target.value)) {
                        setSlippageText(event.target.value)
                      }
                    }}
                    className="font-mono"
                  />
                  <InputGroupAddon align="inline-end">%</InputGroupAddon>
                </InputGroup>
                <Tooltip>
                  <TooltipTrigger
                    render={<span tabIndex={0} className="inline-flex rounded-md" />}
                    aria-label="About slippage"
                  >
                    <Info aria-hidden className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    How far below the quoted amount the swap still accepts. The price can move
                    between the quote and the trade: within this allowance the trade goes through at
                    the live price, beyond it the trade reverts and your tokens come back as change.
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </CollapsibleContent>
        </Collapsible>
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

/** The typed slippage percentage in basis points, or why the swap cannot be priced with it. */
function slippageBpsOf(text: string): { value: bigint | null; error: string | null } {
  const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(text)
  if (match === null)
    return { value: null, error: 'Enter a slippage percentage, such as 1 or 0.5.' }
  const bps = BigInt(match[1] ?? '0') * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
  if (bps === 0n || bps > SWAP_MAX_SLIPPAGE_BPS) {
    return { value: null, error: 'Slippage must be above 0% and at most 50%.' }
  }
  return { value: bps, error: null }
}

/** A Uniswap fee tier in basis points of a percent as the percentage it is, such as `0.05%`. */
function feeLabel(fee: bigint): string {
  return `${(Number(fee) / 10_000).toString()}%`
}
