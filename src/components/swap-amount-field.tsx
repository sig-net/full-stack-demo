import type { ReactNode } from 'react'

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SwapAmountFieldProps<TToken extends string> {
  /** Names the field for assistive technology, e.g. "From" or "To". */
  label: string
  amount: string
  onAmountChange: (amount: string) => void
  tokens: readonly TToken[]
  token: TToken | null
  onTokenChange: (token: TToken | null) => void
}

export function SwapAmountField<TToken extends string>({
  label,
  amount,
  onAmountChange,
  tokens,
  token,
  onTokenChange,
}: SwapAmountFieldProps<TToken>): ReactNode {
  return (
    <InputGroup
      aria-label={label}
      className="h-17.5 rounded-xs border-swap-panel-field-border bg-swap-panel-field px-4.75 dark:bg-swap-panel-field"
    >
      <InputGroupInput
        aria-label={`${label} amount`}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={amount}
        onChange={(event) => onAmountChange(event.target.value)}
        className="h-7.5 p-0 font-mono text-xl/7.5 font-light text-tertiary-foreground placeholder:text-tertiary-foreground md:text-xl/7.5"
      />
      <InputGroupAddon align="inline-end" className="p-0 has-[>button]:mr-0">
        <Select value={token} onValueChange={onTokenChange}>
          <SelectTrigger
            size="sm"
            aria-label={`${label} token`}
            className="gap-2.5 border-border bg-swap-panel-select px-1.75 py-0.75 text-base/4.75 font-medium text-swap-panel-foreground data-placeholder:text-swap-panel-foreground data-[size=sm]:rounded-xs dark:bg-swap-panel-select [&_svg]:size-5 [&_svg]:text-swap-panel-foreground"
          >
            <SelectValue placeholder="Select Token" />
          </SelectTrigger>
          <SelectContent>
            {tokens.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </InputGroupAddon>
    </InputGroup>
  )
}
