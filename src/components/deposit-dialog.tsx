'use client'

import { skipToken, useQuery } from '@tanstack/react-query'
import { getAddress } from 'ethers'
import { CircleAlert, Download, LoaderCircle, RefreshCw, X } from 'lucide-react'
import Image from 'next/image'
import type { ReactNode } from 'react'

import { useCaller } from '@/components/contexts/CallerContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { CopyButton } from '@/components/copy-button'
import { QrCode } from '@/components/qr-code'
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
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'
import { fundLabel } from '@/lib/tokens/fund-label'
import { ORIGIN_NETWORKS } from '@/lib/tokens/token-info'
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
 * light, and its tinted background is the design's own gradient.
 */
export function DepositDialog({ open, onOpenChange, address }: DepositDialogProps): ReactNode {
  const checksummed = getAddress(address)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-5 p-6 sm:max-w-110 sm:p-10">
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle className="text-xl font-semibold text-secondary-foreground">
            Deposit address
          </DialogTitle>
          <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
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
          </span>
        </div>
        <DialogDescription className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
          <CircleAlert className="size-6 shrink-0" aria-hidden />
          Use this address to deposit on Ethereum
        </DialogDescription>
        <DepositAccountFunds address={checksummed} />
      </DialogContent>
    </Dialog>
  )
}

/** The 48px logo over the 242px code, plus a margin, so the covered modules stay within level H's tolerance. */
const LOGO_FRACTION = 0.22

/** The scan of the deposit account: a status line with a check-again control, then one line per fund. */
function DepositAccountFunds({ address }: { address: string }): ReactNode {
  const { callerSecret, callerName } = useCaller()
  const registry = useTokenInfoRegistry()
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
                  <Tooltip>
                    <TooltipTrigger
                      render={<span tabIndex={0} className="inline-flex rounded-md" />}
                    >
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled
                        aria-label={`Deposit ${label}`}
                      >
                        <Download />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Deposit these funds</TooltipContent>
                  </Tooltip>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </TooltipProvider>
  )
}
