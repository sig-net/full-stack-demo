import { cn } from 'cn'
import type { ReactNode, Ref } from 'react'

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TokenInfo } from '@/lib/tokens/token-info'
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
  /** A line under the amount row inside the field, such as the balance it draws on. */
  footer?: ReactNode
  /** The amount input, for a caller that moves focus to it. */
  inputRef?: Ref<HTMLInputElement>
}

/** An amount beside the token it is in, chosen from the tokens offered: one side of a swap, or what a send moves. */
export function TokenAmountField({
  label,
  amount,
  onAmountChange,
  tokens,
  token,
  onTokenChange,
  disabled = false,
  footer,
  inputRef,
}: TokenAmountFieldProps): ReactNode {
  return (
    <InputGroup
      aria-label={label}
      className={cn(
        'h-17.5 rounded-xs border-swap-panel-field-border bg-swap-panel-field px-4.75 dark:bg-swap-panel-field',
        footer !== undefined && 'h-auto flex-wrap gap-y-3 py-5',
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
            label: tokenLabel(option),
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
                {tokenLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </InputGroupAddon>
      {/* The inline-end addon is ordered last, so the footer shares that order to wrap under it. */}
      {footer !== undefined && <div className="order-last basis-full">{footer}</div>}
    </InputGroup>
  )
}
