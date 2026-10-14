'use client'

import { useMutation } from '@tanstack/react-query'
import { LoaderCircle, WandSparkles } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { toast } from 'sonner'

import { useConfig } from '@/components/contexts/ConfigContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isLocalEnvironment } from '@/lib/config/local-environment'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import { parseTokenAmount } from '@/lib/tokens/parse-token-amount'
import type { TokenInfo } from '@/lib/tokens/token-info'
import { fundErc20 } from '@/server/actions/local-faucet-actions'

interface LocalErc20FaucetPopoverProps {
  /** The deposit account to fund, in any letter case. */
  account: string
  disabled?: boolean
  /** Runs after a successful funding, for the host to read the account again. */
  onFunded: () => Promise<unknown>
}

/** Whole tokens the amount field starts with. */
const DEFAULT_AMOUNT = '100'

/**
 * The wand that gives the deposit account any token the vault admits, from the local faucet.
 * It renders on the local stack only, where the faucet exists; a host must provide the tooltip.
 */
export function LocalErc20FaucetPopover({
  account,
  disabled = false,
  onFunded,
}: LocalErc20FaucetPopoverProps): ReactNode {
  const config = useConfig()
  const registry = useTokenInfoRegistry()
  const id = useId()
  const [open, setOpen] = useState(false)
  const tokens = registry.supported()
  const [erc20Address, setErc20Address] = useState<string | null>(null)
  const [amount, setAmount] = useState(DEFAULT_AMOUNT)
  const selected = tokens.find((token) => token.origin.erc20Address === erc20Address) ?? tokens[0]
  const funding = useMutation({
    mutationFn: async (token: TokenInfo) => {
      const result = await fundErc20({
        account,
        erc20Address: token.origin.erc20Address,
        amount: parseTokenAmount(amount, token.decimals),
      })
      if (!result.ok) throw new Error(result.error)
      return { token, funding: result.funding }
    },
    onSuccess: async ({ token, funding: result }) => {
      toast.success(
        `Funded ${amount} ${token.symbol}: the deposit account now holds ${formatTokenAmount(result.balance, token.decimals)} ${token.symbol}.`,
      )
      setOpen(false)
      await onFunded()
    },
  })
  if (!isLocalEnvironment(config) || selected === undefined) return null
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (!funding.isPending) setOpen(value)
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={disabled}
                  aria-label="Fund the deposit account from the local faucet"
                />
              }
            />
          }
        >
          <WandSparkles />
        </TooltipTrigger>
        <TooltipContent>Fund the deposit account from the local faucet</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-72">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            funding.mutate(selected)
          }}
        >
          <p className="text-sm font-medium">Local faucet</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-token`}>Token</Label>
            <Select
              value={selected.origin.erc20Address}
              onValueChange={(value) => {
                setErc20Address(value)
              }}
              items={tokens.map((token) => ({
                value: token.origin.erc20Address,
                label: tokenLabel(token),
              }))}
            >
              <SelectTrigger id={`${id}-token`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tokens.map((token) => (
                  <SelectItem key={token.origin.erc20Address} value={token.origin.erc20Address}>
                    {tokenLabel(token)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-amount`}>Amount in {selected.symbol}</Label>
            <Input
              id={`${id}-amount`}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
              }}
            />
          </div>
          {funding.isError && (
            <p role="alert" className="text-sm text-destructive">
              {funding.error.message}
            </p>
          )}
          <Button type="submit" size="sm" disabled={funding.isPending}>
            {funding.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            {funding.isPending ? 'Funding…' : 'Fund'}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** The symbol, qualified by the issuer where the vault admits more than one token of that symbol. */
function tokenLabel(token: TokenInfo): string {
  return token.origin.issuer === undefined
    ? token.symbol
    : `${token.symbol} (${token.origin.issuer})`
}
