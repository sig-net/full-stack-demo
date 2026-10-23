import { cn } from 'cn'
import type { ReactNode, Ref } from 'react'

import { TokenIcon } from '@/components/token-icon'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ORIGIN_NETWORKS, type TokenInfo } from '@/lib/tokens/token-info'
import { tokenLabel } from '@/lib/tokens/token-label'

interface TokenAmountFieldProps {
  /** Names the field for assistive technology, e.g. "From" or "To". */
  label: string
  amount: string
  /** Absent for a field whose amount the quote fills in. */
  onAmountChange?: (amount: string) => void
  tokens: readonly TokenInfo[]
  token: TokenInfo | null
  onTokenChange: (erc20Address: string) => void
  disabled?: boolean
  /** The balance the amount draws on, shown under it with the control that spends it whole. */
  balance?: TokenAmountBalance
  /** The typed amount's value to the cent at the spot price, shown with the balance; null while the token is unpriced or the amount is empty. */
  usdEstimate?: string | null
  /** The amount input, for a caller that moves focus to it. */
  inputRef?: Ref<HTMLInputElement>
}

export interface TokenAmountBalance {
  /** In whole tokens, as the amount input takes it. */
  readonly amount: string
  onMax(): void
}

/**
 * An amount beside the token it is in, chosen from the tokens offered with their icons: one side
 * of a swap, or what a send moves. With a balance, a second line shows the amount's value, the
 * balance and a MAX control.
 */
export function TokenAmountField({
  label,
  amount,
  onAmountChange,
  tokens,
  token,
  onTokenChange,
  disabled = false,
  balance,
  usdEstimate = null,
  inputRef,
}: TokenAmountFieldProps): ReactNode {
  return (
    <InputGroup
      aria-label={label}
      className={cn(
        'h-17.5 rounded-xs border-swap-panel-field-border bg-swap-panel-field px-4.75 dark:bg-swap-panel-field',
        balance !== undefined && 'h-auto flex-wrap gap-y-3 py-5',
      )}
    >
      <InputGroupInput
        ref={inputRef}
        aria-label={`${label} amount`}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={amount}
        readOnly={onAmountChange === undefined}
        disabled={disabled}
        onChange={(event) => onAmountChange?.(event.target.value)}
        className="h-7.5 min-w-0 basis-0 p-0 font-mono text-xl/7.5 font-light text-tertiary-foreground placeholder:text-tertiary-foreground md:text-xl/7.5"
      />
      <InputGroupAddon align="inline-end" className="p-0 has-[>button]:mr-0">
        <Select
          value={token?.origin.erc20Address ?? null}
          onValueChange={(value) => {
            if (value !== null) onTokenChange(value)
          }}
          disabled={disabled}
          items={tokens.map((option) => ({
            value: option.origin.erc20Address,
            label: <TokenOption token={option} />,
          }))}
        >
          <SelectTrigger
            size="sm"
            aria-label={`${label} token`}
            className="gap-2.5 border-border bg-swap-panel-select px-1.75 py-0.75 text-base/4.75 font-medium text-swap-panel-foreground data-placeholder:text-swap-panel-foreground data-[size=sm]:rounded-xs dark:bg-swap-panel-select [&_svg]:size-5 [&_svg]:text-swap-panel-foreground"
          >
            <SelectValue placeholder="Select Token" />
          </SelectTrigger>
          <SelectContent>
            {tokens.map((option) => (
              <SelectItem key={option.origin.erc20Address} value={option.origin.erc20Address}>
                <TokenOption token={option} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </InputGroupAddon>
      {/* The inline-end addon is ordered last, so the balance line shares that order to wrap under it. */}
      {balance !== undefined && (
        <div className="order-last flex basis-full items-center justify-between font-mono text-xs/3.5 font-medium text-tertiary-foreground">
          <span>{usdEstimate === null ? '' : `≈ $${usdEstimate}`}</span>
          <span className="flex items-center gap-2.5">
            <span>Balance: {balance.amount}</span>
            <Button
              variant="ghost"
              size="xs"
              className="h-3.5 px-0 font-sans text-xs/3.5 font-semibold text-tertiary-foreground"
              disabled={disabled}
              onClick={() => {
                balance.onMax()
              }}
            >
              MAX
            </Button>
          </span>
        </div>
      )}
    </InputGroup>
  )
}

/** A token as the select lists it: its icon with the chain badge, then its label. */
function TokenOption({ token }: { token: TokenInfo }): ReactNode {
  const network = ORIGIN_NETWORKS[token.origin.kind]
  return (
    <span className="flex items-center gap-1.5">
      <TokenIcon
        size="sm"
        assetSymbol={token.symbol}
        networkName={network.name}
        icon={token.icon}
        networkIcon={network.icon}
      />
      {tokenLabel(token)}
    </span>
  )
}
