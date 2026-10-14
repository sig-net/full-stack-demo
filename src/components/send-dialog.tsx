'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAddress } from 'ethers'
import { CircleCheck, CircleX, LoaderCircle, QrCode, Send, X } from 'lucide-react'
import { type ReactNode, useEffect, useEffectEvent, useState } from 'react'
import { toast } from 'sonner'

import { ACTIVITIES_QUERY_KEY } from '@/components/activity-section'
import { useCaller } from '@/components/contexts/CallerContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { ReadinessChecklist } from '@/components/readiness-checklist'
import { TokenAmountField } from '@/components/token-amount-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { useMidnightBalances } from '@/components/use-midnight-balances'
import { abbreviateHex } from '@/lib/abbreviate-hex'
import type { MidnightBalanceAmount } from '@/lib/balances/midnight-balances'
import { missingReadiness } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import { parseTokenAmount } from '@/lib/tokens/parse-token-amount'
import type { TokenInfo } from '@/lib/tokens/token-info'
import type { TokenInfoRegistry } from '@/lib/tokens/token-info-registry'
import { startWithdraw } from '@/server/actions/withdraw-actions'

const AMOUNT_INPUT = /^\d*\.?\d*$/

interface SendDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The token type of the balance the Send control was pressed on, the field's first choice. */
  tokenType: string
}

/**
 * Sends a vault token the wallet holds to an address on Ethereum: the amount is surrendered
 * whole on Midnight and the vault account pays the destination. The token can be changed to any
 * other supported balance, and the destination is pasted, never connected. While a send is
 * being started the dialog is inert: nothing closes it and no other control answers.
 */
export function SendDialog({ open, onOpenChange, tokenType }: SendDialogProps): ReactNode {
  const { callerSecret } = useCaller()
  const { wallet } = useMidnightWallet()
  const registry = useTokenInfoRegistry()
  const { checks, recheck } = useVaultReadiness()
  const balances = useMidnightBalances()
  const queryClient = useQueryClient()
  const [erc20Address, setErc20Address] = useState(
    () => registry.get({ ledger: 'shielded', tokenType })?.origin.erc20Address ?? null,
  )
  const [amountText, setAmountText] = useState('')
  const [destination, setDestination] = useState('')

  const sources = supportedBalances(balances.data ?? [], registry)
  const source = sources.find(({ token }) => token.origin.erc20Address === erc20Address) ?? null
  const amount = amountOf(amountText, source)
  const destinationValid = isAddress(destination)
  const missing = missingReadiness('withdraw', checks)
  const recheckOnOpen = useEffectEvent(() => {
    void recheck()
  })
  useEffect(() => {
    recheckOnOpen()
  }, [])

  const sending = useMutation({
    mutationFn: async () => {
      if (callerSecret === null) throw new Error('The identity secret is not set.')
      if (wallet === null) throw new Error('No Midnight wallet is connected.')
      if (source === null || amount.value === null) throw new Error('No amount to send.')
      const result = await startWithdraw(callerSecret, {
        withdrawRequest: {
          erc20Address: source.token.origin.erc20Address,
          amount: amount.value,
          destEvmAddress: destination,
        },
        wallet: wallet.publicKeys,
      })
      if (!result.ok) throw new Error(result.error)
      return result.withdraw
    },
    onSuccess: async () => {
      toast.success(
        `Send of ${amountText} ${source?.token.symbol ?? ''} to ${abbreviateHex(destination)} started. Sign its start call from the Activity row once it is proved.`,
      )
      await queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
      onOpenChange(false)
    },
    onError: async (error) => {
      toast.error(`Starting the send failed: ${error.message}`)
      await recheck()
    },
  })
  const busy = sending.isPending
  const blocker =
    callerSecret === null
      ? 'Set the identity secret to send.'
      : wallet === null
        ? 'Connect a Midnight wallet to send.'
        : sources.length === 0 && balances.isSuccess
          ? 'Deposit a token first: the wallet holds nothing the vault admits.'
          : amount.error
  const ready =
    blocker === null &&
    missing.length === 0 &&
    source !== null &&
    amount.value !== null &&
    destinationValid

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value)
      }}
    >
      <DialogContent showCloseButton={false} className="gap-5 p-6 sm:max-w-110 sm:p-10">
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle className="text-xl font-semibold text-secondary-foreground">
            Send
          </DialogTitle>
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" aria-label="Close" disabled={busy} />}
          >
            <X />
          </DialogClose>
        </DialogHeader>
        <DialogDescription className="sr-only">
          Send a token from your vault balance to an Ethereum address.
        </DialogDescription>
        <TokenAmountField
          label="Send"
          amount={amountText}
          onAmountChange={(text) => {
            if (AMOUNT_INPUT.test(text)) setAmountText(text)
          }}
          tokens={sources.map(({ token }) => token)}
          token={source?.token ?? null}
          onTokenChange={setErc20Address}
          disabled={busy}
          footer={
            <div className="flex items-center justify-between font-mono text-xs/3.5 font-medium text-tertiary-foreground">
              <span>≈ $0.00</span>
              {source !== null && (
                <span className="flex items-center gap-2.5">
                  <span>Balance: {source.balance.amount}</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-3.5 px-0 font-sans text-xs/3.5 font-semibold text-tertiary-foreground"
                    disabled={busy}
                    onClick={() => {
                      setAmountText(source.balance.amount)
                    }}
                  >
                    MAX
                  </Button>
                </span>
              )}
            </div>
          }
        />
        <p className="text-center text-sm/5 font-medium text-muted-foreground">to</p>
        <div className="flex flex-col gap-2.5 rounded-xs border border-swap-panel-field-border bg-swap-panel-field p-5 dark:bg-swap-panel-field">
          <Label
            htmlFor="send-destination"
            className="text-base/7 font-semibold text-muted-foreground"
          >
            Paste an Ethereum address
          </Label>
          <InputGroup className="h-12.5 rounded-xs border-swap-panel-field-border bg-swap-panel-select px-2.5 dark:bg-swap-panel-select">
            <InputGroupAddon>
              <QrCode className="size-7.5 text-tertiary-foreground" aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              id="send-destination"
              placeholder="ethereum address"
              autoComplete="off"
              spellCheck={false}
              value={destination}
              disabled={busy}
              aria-invalid={destination !== '' && !destinationValid}
              onChange={(event) => {
                setDestination(event.target.value.trim())
              }}
              className="font-mono text-base"
            />
          </InputGroup>
          {destination !== '' && (
            <Badge
              variant={destinationValid ? 'success' : 'destructive'}
              role="status"
              className="justify-center gap-1 before:hidden"
            >
              {destinationValid ? (
                <CircleCheck className="size-3" aria-hidden />
              ) : (
                <CircleX className="size-3" aria-hidden />
              )}
              {destinationValid
                ? 'This appears to be an Ethereum address!'
                : 'This is not an Ethereum address'}
            </Badge>
          )}
        </div>
        {blocker !== null && (
          <p role="status" className="text-sm text-muted-foreground">
            {blocker}
          </p>
        )}
        {blocker === null && missing.length > 0 && (
          <div className="text-sm">
            <ReadinessChecklist checkIds={missing} />
          </div>
        )}
        <Button
          variant="pink"
          size="xl"
          disabled={!ready || busy}
          className="w-full"
          onClick={() => {
            sending.mutate()
          }}
        >
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          <span className="px-0.5">{busy ? 'Starting the send…' : 'Send'}</span>
        </Button>
      </DialogContent>
    </Dialog>
  )
}

interface SendSource {
  readonly token: TokenInfo
  readonly balance: MidnightBalanceAmount
}

/** The wallet's balances in tokens the vault admits, each with the registry entry that names it. */
function supportedBalances(
  balances: readonly MidnightBalanceAmount[],
  registry: TokenInfoRegistry,
): SendSource[] {
  return balances.flatMap((balance) => {
    const token = registry.get({ ledger: 'shielded', tokenType: balance.tokenType })
    return token !== undefined && token.supported ? [{ token, balance }] : []
  })
}

/** The typed amount in base units, or why it cannot be sent yet. */
function amountOf(
  text: string,
  source: SendSource | null,
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
