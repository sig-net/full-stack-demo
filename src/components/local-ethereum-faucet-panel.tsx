'use client'

import { useMutation } from '@tanstack/react-query'
import { isAddress } from 'ethers'
import { LoaderCircle, WandSparkles } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { toast } from 'sonner'

import { useCaller } from '@/components/contexts/CallerContext'
import { useConfig } from '@/components/contexts/ConfigContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isLocalEnvironment } from '@/lib/config/local-environment'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import { parseTokenAmount } from '@/lib/tokens/parse-token-amount'
import type { TokenInfo } from '@/lib/tokens/token-info'
import { tokenLabel } from '@/lib/tokens/token-label'
import { fundAccount, fundErc20 } from '@/server/actions/local-ethereum-faucet-actions'

/** The select's value for the chain's own coin, beside the ERC20s keyed by address. */
const ETH = 'ETH'
const ETH_DECIMALS = 18

/** Whole units the amount field starts with. */
const DEFAULT_AMOUNT = '1'

/**
 * The admin page's local faucet: any account, ETH or any token the vault admits, any amount.
 * It renders on the local stack only, where the faucet exists, and starts on the caller's
 * deposit account since that is the account most often short.
 */
export function LocalEthereumFaucetPanel(): ReactNode {
  const config = useConfig()
  const registry = useTokenInfoRegistry()
  const { depositAccount } = useCaller()
  const { recheck } = useVaultReadiness()
  const id = useId()
  const [account, setAccount] = useState(depositAccount ?? '')
  const [asset, setAsset] = useState(ETH)
  const [amount, setAmount] = useState(DEFAULT_AMOUNT)
  const tokens = registry.supported()
  const token = tokens.find((candidate) => candidate.origin.erc20Address === asset)
  const symbol = token?.symbol ?? ETH
  const decimals = token?.decimals ?? ETH_DECIMALS
  const funding = useMutation({
    mutationFn: async (target: TokenInfo | undefined) => {
      const baseUnits = parseTokenAmount(amount, decimals)
      if (target === undefined) {
        const result = await fundAccount({ account, amount: baseUnits })
        if (!result.ok) throw new Error(result.error)
        return formatTokenAmount(result.funding.balance, ETH_DECIMALS)
      }
      const result = await fundErc20({
        account,
        erc20Address: target.origin.erc20Address,
        amount: baseUnits,
      })
      if (!result.ok) throw new Error(result.error)
      return formatTokenAmount(result.funding.balance, target.decimals)
    },
    onSuccess: (balance) => {
      toast.success(`Funded ${amount} ${symbol}: ${account} now holds ${balance} ${symbol}.`)
      void recheck()
    },
  })
  if (!isLocalEnvironment(config)) return null
  const accountValid = isAddress(account)
  return (
    <section aria-labelledby="local-faucet-title" className="flex flex-col gap-4">
      <h2
        id="local-faucet-title"
        className="text-base/4.5 font-bold tracking-widest text-subtle-foreground uppercase"
      >
        Local faucet
      </h2>
      <p className="text-muted-foreground">
        Gives any account on the local fork ETH or a token the vault admits. Balances here are test
        fixtures, so nothing is spent.
      </p>
      <form
        className="flex flex-col gap-3 md:flex-row md:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          funding.mutate(token)
        }}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-account`}>Account</Label>
          <Input
            id={`${id}-account`}
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
            value={account}
            aria-invalid={account !== '' && !accountValid}
            disabled={funding.isPending}
            onChange={(event) => {
              setAccount(event.target.value.trim())
            }}
            className="font-mono"
          />
        </div>
        <div className="flex flex-col gap-1.5 md:w-56">
          <Label htmlFor={`${id}-asset`}>Asset</Label>
          <Select
            value={asset}
            onValueChange={(value) => {
              if (value !== null) setAsset(value)
            }}
            disabled={funding.isPending}
            items={[
              { value: ETH, label: ETH },
              ...tokens.map((candidate) => ({
                value: candidate.origin.erc20Address,
                label: tokenLabel(candidate),
              })),
            ]}
          >
            <SelectTrigger id={`${id}-asset`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ETH}>{ETH}</SelectItem>
              {tokens.map((candidate) => (
                <SelectItem
                  key={candidate.origin.erc20Address}
                  value={candidate.origin.erc20Address}
                >
                  {tokenLabel(candidate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 md:w-40">
          <Label htmlFor={`${id}-amount`}>Amount in {symbol}</Label>
          <Input
            id={`${id}-amount`}
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            disabled={funding.isPending}
            onChange={(event) => {
              setAmount(event.target.value)
            }}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          variant="secondary"
          aria-label={`Fund the account with ${amount} ${symbol} from the local faucet`}
          disabled={!accountValid || amount === '' || funding.isPending}
        >
          {funding.isPending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <WandSparkles aria-hidden />
          )}
        </Button>
      </form>
      {funding.isError && (
        <p role="alert" className="text-sm text-destructive">
          {funding.error.message}
        </p>
      )}
    </section>
  )
}
