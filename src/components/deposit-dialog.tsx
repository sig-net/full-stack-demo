'use client'

import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { getAddress } from 'ethers'
import {
  CircleAlert,
  CircleCheck,
  Download,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react'
import Image from 'next/image'
import { type ReactNode, useEffect, useEffectEvent, useState } from 'react'
import { toast } from 'sonner'

import { ACTIVITIES_QUERY_KEY } from '@/components/activity-section'
import { useCaller } from '@/components/contexts/CallerContext'
import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { CopyButton } from '@/components/copy-button'
import { EthereumAccountLink } from '@/components/ethereum-account-link'
import { LocalErc20FaucetPopover } from '@/components/local-erc20-faucet-popover'
import { QrCode } from '@/components/qr-code'
import { ReadinessChecklist } from '@/components/readiness-checklist'
import { ReadinessRecheckButton } from '@/components/readiness-recheck-button'
import { TokenIcon } from '@/components/token-icon'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { abbreviateHex } from '@/lib/abbreviate-hex'
import { missingReadiness } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import { fundLabel } from '@/lib/tokens/fund-label'
import type { DepositCallStage } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/browser-deposit-calls'
import type { DepositAccountFund } from '@/lib/midnight/ethereum-erc20-vault/supported-token-v1/deposit-account-fund'
import { ORIGIN_NETWORKS } from '@/lib/tokens/token-info'
import { prepareStartDeposit, startDeposit } from '@/server/actions/deposit-actions'
import { listDepositAccountFunds } from '@/server/actions/supported-token-actions'

interface DepositDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The caller's deposit account on Ethereum, in any letter case. */
  address: string
}

/**
 * The deposit address as a QR code and a copyable checksummed address, then what the account
 * holds of the vault's supported tokens, scanned once as the dialog opens and again on demand.
 * The QR panel keeps the design's light palette in both themes, since a code scans dark on
 * light, and its tinted background is the design's own gradient. While a deposit is being
 * started the dialog is inert: nothing closes it and no other control answers.
 */
export function DepositDialog({ open, onOpenChange, address }: DepositDialogProps): ReactNode {
  const checksummed = getAddress(address)
  const [busy, setBusy] = useState(false)
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
            Deposit address
          </DialogTitle>
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" aria-label="Close" disabled={busy} />}
          >
            <X />
          </DialogClose>
        </DialogHeader>
        <p className="text-base font-semibold text-muted-foreground">Ethereum address</p>
        <div className="flex flex-col items-center gap-5.5 rounded-xs border border-muted-foreground/80 bg-white bg-deposit-panel p-5">
          <div className="relative flex aspect-square w-full max-w-67.5 items-center justify-center rounded-xs bg-swiss-coffee-50 p-3.5">
            <QrCode
              value={checksummed}
              label={`QR code of ${checksummed}`}
              logoFraction={LOGO_FRACTION}
              className="size-full fill-black"
            />
            <div className="absolute flex size-12 items-center justify-center rounded-full bg-dark-neutral-950">
              <Image
                src="/icons/ethereum-glyph-mono.svg"
                alt=""
                width={32}
                height={32}
                unoptimized
              />
            </div>
          </div>
          <span className="flex items-center gap-4.75 rounded-xs bg-swiss-coffee-50 px-2 py-1">
            <span className="font-mono text-base text-dark-neutral-400" title={checksummed}>
              {abbreviateHex(checksummed)}
            </span>
            <CopyButton label="deposit address" value={checksummed} />
            <EthereumAccountLink account={checksummed} label="deposit address" />
          </span>
        </div>
        <DialogDescription className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
          <CircleAlert className="size-6 shrink-0" aria-hidden />
          Use this address to deposit on Ethereum
        </DialogDescription>
        <DepositAccountFunds
          address={checksummed}
          busy={busy}
          onBusyChange={setBusy}
          onDeposited={() => onOpenChange(false)}
        />
        <DepositReadiness busy={busy} />
      </DialogContent>
    </Dialog>
  )
}

/** The 48px logo over the 242px code, plus a margin, so the covered modules stay within level H's tolerance. */
const LOGO_FRACTION = 0.22

/**
 * The scan of the deposit account: a status line with a check-again control, then one line per
 * fund with the control that deposits the whole fund. Starting a deposit is the dialog's one
 * action: the page builds, proves and binds the start call, the server records the deposit for
 * the relayer to pay and submit, and the activity row takes it from there.
 */
function DepositAccountFunds({
  address,
  busy,
  onBusyChange,
  onDeposited,
}: {
  address: string
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onDeposited: () => void
}): ReactNode {
  const { callerSecret, callerName } = useCaller()
  const { wallet } = useMidnightWallet()
  const config = useConfig()
  const registry = useTokenInfoRegistry()
  const { checks, recheck } = useVaultReadiness()
  const queryClient = useQueryClient()
  const ready = missingReadiness('deposit', checks).length === 0
  const [stage, setStage] = useState<DepositCallStage | null>(null)
  const depositing = useMutation({
    mutationFn: async (fund: DepositAccountFund) => {
      if (callerSecret === null) throw new Error('The identity secret is not set.')
      if (wallet === null) throw new Error('No Midnight wallet is connected.')
      // Loaded on first use, so a visitor who never deposits never downloads the call builder and the contract.
      const calls =
        await import('@/lib/midnight/ethereum-erc20-vault/deposit-v1/browser-deposit-calls')
      return calls.startDepositInBrowser({
        actions: { prepareStartDeposit, startDeposit },
        builder: calls.browserDepositCallBuilder(config, window.location.origin),
        wallet,
        callerSecret,
        depositRequest: { erc20Address: fund.erc20Address, amount: fund.amount },
        onStage: setStage,
      })
    },
    onMutate: () => {
      onBusyChange(true)
    },
    onSuccess: async (deposit) => {
      const info = registry.byErc20Address(deposit.erc20Address)
      const amount =
        info === undefined
          ? deposit.amount.toString()
          : `${formatTokenAmount(deposit.amount, info.decimals)} ${info.symbol}`
      toast.success(
        `Deposit of ${amount} started: the backend is paying for its start call and submitting it.`,
      )
      await queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
      onBusyChange(false)
      onDeposited()
    },
    onError: async (error) => {
      toast.error(`Starting the deposit failed: ${error.message}`)
      await Promise.all([funds.refetch(), recheck()])
      onBusyChange(false)
    },
    onSettled: () => {
      setStage(null)
    },
  })
  const funds = useQuery({
    queryKey: ['deposit-account-funds', callerName, address],
    queryFn:
      callerSecret === null
        ? skipToken
        : async () => {
            const result = await listDepositAccountFunds(callerSecret, {})
            if (!result.ok) throw new Error(result.error)
            return result.funds
          },
    // One scan when the dialog opens, then only on demand: the result never goes stale by itself
    // and is dropped with the dialog, so the next opening scans afresh.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
  const summary =
    funds.status === 'pending'
      ? 'Checking for ERC20 Funds'
      : funds.status === 'error'
        ? `Could not check for ERC20 funds: ${funds.error.message}`
        : funds.data.length === 0
          ? 'No ERC20 Funds Found'
          : `${funds.data.length} ERC20 Funds Found`
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span role="status">{summary}</span>
          {funds.isFetching ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Check again"
                    disabled={busy}
                    onClick={() => {
                      void funds.refetch()
                    }}
                  />
                }
              >
                <RefreshCw />
              </TooltipTrigger>
              <TooltipContent>Check again</TooltipContent>
            </Tooltip>
          )}
          <LocalErc20FaucetPopover
            account={address}
            disabled={busy}
            onFunded={() => funds.refetch()}
          />
        </div>
        {funds.status === 'success' && funds.data.length > 0 && (
          <ul className="grid w-fit grid-cols-[auto_auto_auto_auto] items-center gap-x-2 gap-y-1.5">
            {/* One grid for every line, so the amounts and the deposit controls share columns. */}
            {funds.data.map((fund) => {
              const info = registry.byErc20Address(fund.erc20Address)
              const network = info === undefined ? undefined : ORIGIN_NETWORKS[info.origin.kind]
              const label = fundLabel(fund, funds.data, registry)
              return (
                <li key={fund.erc20Address} className="contents">
                  {info !== undefined && network !== undefined && (
                    <TokenIcon
                      assetSymbol={info.symbol}
                      networkName={network.name}
                      icon={info.icon}
                      networkIcon={network.icon}
                    />
                  )}
                  <span>{label}</span>
                  <span className="text-right">
                    {info === undefined
                      ? fund.amount.toString()
                      : formatTokenAmount(fund.amount, info.decimals)}
                  </span>
                  {/* A disabled button takes no pointer events, so the wrapper is the hover target. */}
                  {depositing.isPending &&
                  depositing.variables.erc20Address === fund.erc20Address ? (
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-label="Starting the deposit"
                    />
                  ) : (
                    <Tooltip>
                      <TooltipTrigger
                        render={<span tabIndex={0} className="inline-flex rounded-md" />}
                      >
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={!ready || busy}
                          aria-label={`Deposit ${label}`}
                          onClick={() => {
                            depositing.mutate(fund)
                          }}
                        >
                          <Download />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {ready ? 'Deposit these funds' : 'Not ready to deposit'}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {depositing.isPending && stage !== null && <p role="status">{START_STAGE_LABELS[stage]}</p>}
      </div>
    </TooltipProvider>
  )
}

const START_STAGE_LABELS: Record<DepositCallStage, string> = {
  preparing: 'Preparing the deposit',
  building: 'Building and proving the start call',
  signing: 'Signing with your wallet',
  recording: 'Recording the deposit',
}

/** Whether every payer of a deposit holds what it costs, read afresh as the dialog opens and again on demand. */
function DepositReadiness({ busy }: { busy: boolean }): ReactNode {
  const { checks, recheck } = useVaultReadiness()
  const missing = missingReadiness('deposit', checks)
  const recheckOnOpen = useEffectEvent(() => {
    void recheck()
  })
  useEffect(() => {
    recheckOnOpen()
  }, [])
  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
      <div
        className={cn(
          'flex items-center justify-center gap-2',
          missing.length > 0 && 'text-destructive',
        )}
      >
        {missing.length === 0 ? (
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
        ) : (
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
        )}
        <span role="status">
          {missing.length === 0 ? 'Ready to deposit' : 'Not ready to deposit'}
        </span>
        <ReadinessRecheckButton disabled={busy} />
      </div>
      {missing.length > 0 && <ReadinessChecklist checkIds={missing} />}
    </div>
  )
}
