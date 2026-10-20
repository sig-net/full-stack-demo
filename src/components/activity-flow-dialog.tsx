'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  Circle,
  CircleCheck,
  CornerDownRight,
  Info,
  LoaderCircle,
  SquareArrowOutUpRight,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { ACTIVITIES_QUERY_KEY } from '@/components/activity-section'
import { useCaller } from '@/components/contexts/CallerContext'
import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { CopyButton } from '@/components/copy-button'
import { ReadinessChecklist } from '@/components/readiness-checklist'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { WalletSigningIcon } from '@/components/wallet-signing-icon'
import { abbreviateHex } from '@/lib/abbreviate-hex'
import { formatTimestamp } from '@/lib/activity/activity-entries'
import type { ClientConfig } from '@/lib/config/client-config'
import { ethereumExplorerOf } from '@/lib/config/ethereum-explorer'
import { midnightExplorerOf } from '@/lib/config/midnight-explorer'
import { signetExplorerOf } from '@/lib/config/signet-explorer'
import {
  ACTIVITY_KIND_LABELS,
  type ActivityEntry,
  type ActivityStatus,
} from '@/lib/activity/activity-entry'
import type { ActivityWalletTransaction } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import type {
  ActivityReference,
  ActivityReferenceKind,
  ActivityStepStatus,
} from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity-progress'
import { listTransactions, submitTransaction } from '@/server/actions/transaction-actions'

interface ActivityFlowDialogProps {
  entry: ActivityEntry
  onOpenChange: (open: boolean) => void
}

/**
 * Where an activity stands and what, if anything, the user must do for it: the wallet's turn as
 * the footer's signing button, and every step behind a details pane that opens closed. The
 * dialog holds no state the server does not, so closing it loses nothing: the row offers the
 * same turn again on its next refresh.
 */
export function ActivityFlowDialog({ entry, onOpenChange }: ActivityFlowDialogProps): ReactNode {
  const { wallet } = useMidnightWallet()
  const { checks } = useVaultReadiness()
  const kindLabel = ACTIVITY_KIND_LABELS[entry.kind]
  const walletTransaction = entry.action.kind === 'balance' ? entry.action.transaction : null
  const signing = useWalletSigning(entry, walletTransaction, () => {
    onOpenChange(false)
  })
  const busy = signing.isPending
  const dustReady = checks.callerDust.status === 'ok'
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value)
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle>
            {kindLabel} {TITLE_BY_STATUS[entry.status]}
          </DialogTitle>
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" aria-label="Close" disabled={busy} />}
          >
            <X />
          </DialogClose>
        </DialogHeader>
        <DialogDescription>{description(entry, walletTransaction)}</DialogDescription>
        {walletTransaction !== null &&
          (wallet === null ? (
            <p role="alert" className="text-sm text-destructive">
              Connect your Midnight wallet to sign the {callLabel(walletTransaction)} call.
            </p>
          ) : (
            !dustReady && <ReadinessChecklist checkIds={['callerDust']} />
          ))}
        {entry.error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {entry.error}
          </p>
        )}
        <Collapsible className="flex flex-col gap-2">
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
            <ChevronDown
              className="size-4 transition-transform group-aria-expanded/button:rotate-180"
              aria-hidden
            />
            <span className="group-aria-expanded/button:hidden">See more details</span>
            <span className="hidden group-aria-expanded/button:inline">See less details</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <TooltipProvider>
              <div className="flex flex-col gap-2 text-sm">
                <p className="font-medium">{kindLabel} progress</p>
                <ol className="flex flex-col gap-1.5">
                  {entry.steps.map((step) => {
                    const { Icon, tone, spin } = STEP_ITEMS[step.status]
                    return (
                      <li key={step.label} className={`flex flex-col gap-1 ${tone}`}>
                        <div className="flex items-center gap-2">
                          <Icon
                            aria-hidden
                            className={`size-4 shrink-0 ${spin ? 'animate-spin' : ''}`}
                          />
                          <span>{step.label}</span>
                          <span className="sr-only">({step.status})</span>
                          {step.walletTurn !== null && <WalletSigningIcon className="size-4" />}
                        </div>
                        {step.reference !== null && (
                          <ActivityReferenceLine reference={step.reference} />
                        )}
                      </li>
                    )
                  })}
                </ol>
              </div>
            </TooltipProvider>
          </CollapsibleContent>
        </Collapsible>
        {walletTransaction !== null && (
          <DialogFooter>
            <Button
              type="button"
              disabled={busy || wallet === null || !dustReady}
              onClick={() => {
                signing.mutate()
              }}
            >
              {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <WalletSigningIcon />}
              {busy ? 'Signing…' : 'Sign with wallet'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

const TITLE_BY_STATUS: Record<ActivityStatus, string> = {
  pending: 'in progress',
  complete: 'complete',
  failed: 'failed',
}

function description(
  entry: ActivityEntry,
  walletTransaction: ActivityWalletTransaction | null,
): string {
  const subject = `The ${entry.description}`
  if (entry.status === 'complete') return `${subject} is complete.`
  if (entry.status === 'failed') return `${subject} failed.`
  if (walletTransaction !== null) {
    const expiry =
      walletTransaction.expireTime === null
        ? ''
        : ` It expires at ${formatTimestamp(walletTransaction.expireTime)}.`
    return `${subject} is in progress. You need to sign with your wallet for the ${callLabel(walletTransaction)} call: it is proved, your Midnight wallet pays its DUST fee and signs it, then the backend submits it.${expiry}`
  }
  const remaining = entry.steps.filter((step) => step.status !== 'done')
  const inPage = remaining.some((step) => step.walletTurn === 'inPage')
  if (entry.action.kind === 'complete') {
    return inPage
      ? `${subject} is in progress. Nothing for you to do now: this page builds, proves and signs the completion call with your wallet by itself while it is open with the wallet connected, then the backend pays its fee and submits it.`
      : `${subject} is in progress. Nothing for you to do now: the completion call is being built for your wallet, and starts by itself while this page is open with the wallet connected.`
  }
  const turns = remaining.filter((step) => step.walletTurn === 'signTurn').length
  const approvals =
    turns === 0 ? '' : ` Your wallet will need to approve ${TURN_WORDS[turns] ?? String(turns)}.`
  const signedInPage = inPage
    ? ' This page signs the completion call with your wallet by itself once it is due, while it is open with the wallet connected.'
    : ''
  return `${subject} is in progress. Nothing for you to do now.${approvals}${signedInPage}`
}

const TURN_WORDS: Record<number, string> = { 1: 'once more', 2: 'twice' }

function callLabel(transaction: ActivityWalletTransaction): string {
  return CIRCUIT_LABELS[transaction.circuit] ?? transaction.circuit
}

const CIRCUIT_LABELS: Record<string, string> = {
  startSwap: 'start',
  completeSwap: 'completion',
  startApproveRouter: 'start',
  startApproveStata: 'start',
  completeApprove: 'completion',
}

/**
 * The wallet's turn: the proved call is read afresh, balanced and signed by the wallet, then
 * handed back to the backend to submit.
 */
function useWalletSigning(
  entry: ActivityEntry,
  transaction: ActivityWalletTransaction | null,
  onSigned: () => void,
): ReturnType<typeof useMutation<void, Error, void>> {
  const { callerSecret } = useCaller()
  const { wallet } = useMidnightWallet()
  const queryClient = useQueryClient()
  const label = transaction === null ? '' : callLabel(transaction)
  return useMutation({
    mutationFn: async () => {
      if (transaction === null) throw new Error('No call is waiting for the wallet.')
      if (callerSecret === null) throw new Error('The identity secret is not set.')
      if (wallet === null) throw new Error('No Midnight wallet is connected.')
      const listed = await listTransactions(callerSecret, { parent: entry.name })
      if (!listed.ok) throw new Error(listed.error)
      const live = listed.transactions.find((candidate) => candidate.name === transaction.name)
      if (live === undefined || live.unboundTx === null || live.state !== 'AwaitingWallet') {
        throw new Error('The call is not waiting for the wallet any more.')
      }
      const finalizedTx = await wallet.finalize(live.unboundTx)
      const submitted = await submitTransaction(callerSecret, { name: live.name, finalizedTx })
      if (!submitted.ok) throw new Error(submitted.error)
    },
    onSuccess: async () => {
      toast.success(`The ${label} call is signed and submitted.`)
      await queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
      onSigned()
    },
    onError: (error) => {
      toast.error(`Signing the ${label} call failed: ${error.message}`)
    },
  })
}

/**
 * The identifier a step left behind, abbreviated with its meaning in a tip, a copy action and the
 * explorer link, or the word pending until the step assigns it.
 */
function ActivityReferenceLine({ reference }: { reference: ActivityReference }): ReactNode {
  const config = useConfig()
  const item = REFERENCE_ITEMS[reference.kind]
  const link = referenceLink(config, reference)
  return (
    <div className="flex items-center gap-1 pl-6 text-muted-foreground">
      <CornerDownRight aria-hidden className="size-3.5 shrink-0" />
      {reference.id === null ? (
        <span className="text-xs">pending</span>
      ) : (
        <span className="font-mono text-xs text-foreground" title={reference.id}>
          {abbreviateHex(reference.id)}
        </span>
      )}
      <Tooltip>
        <TooltipTrigger
          render={<span tabIndex={0} className="inline-flex rounded-md" />}
          aria-label={`About the ${item.name}`}
        >
          <Info aria-hidden className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {reference.id === null ? item.pending : item.explanation}
        </TooltipContent>
      </Tooltip>
      {reference.id !== null && (
        <>
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <CopyButton label={item.name} value={reference.id} />
            </TooltipTrigger>
            <TooltipContent>Copy the {item.name}</TooltipContent>
          </Tooltip>
          {link === null ? (
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled
                  aria-label={`Open the ${item.name} in ${item.explorer}`}
                >
                  <SquareArrowOutUpRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in {item.explorer}, not available yet</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    nativeButton={false}
                    render={<a href={link.url} target="_blank" rel="noreferrer" />}
                    aria-label={`Open the ${item.name} in ${link.name}`}
                  />
                }
              >
                <SquareArrowOutUpRight />
              </TooltipTrigger>
              <TooltipContent>
                {reference.kind === 'midnightTransaction'
                  ? `Open its block in ${link.name}`
                  : `Open in ${link.name}`}
              </TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The explorer page a reference opens: an Ethereum transaction's own page, a Midnight
 * transaction's block once the chain recorded it, a Sig Network request's lifecycle, and none
 * where no explorer serves the chain.
 */
function referenceLink(
  config: ClientConfig,
  reference: ActivityReference,
): { name: string; url: string } | null {
  switch (reference.kind) {
    case 'ethereumTransaction': {
      const explorer = ethereumExplorerOf(config)
      return explorer === null || reference.id === null
        ? null
        : { name: explorer.name, url: explorer.transactionURL(reference.id) }
    }
    case 'midnightTransaction': {
      if (reference.blockNumber === null) return null
      const explorer = midnightExplorerOf(config)
      return { name: explorer.name, url: explorer.blockURL(reference.blockNumber) }
    }
    case 'vaultRequest': {
      if (reference.id === null) return null
      const explorer = signetExplorerOf(config)
      return { name: explorer.name, url: explorer.requestURL(reference.id) }
    }
    default: {
      const unhandled: never = reference.kind
      throw new Error(`Unhandled reference ${JSON.stringify(unhandled)}`)
    }
  }
}

const REFERENCE_ITEMS: Record<
  ActivityReferenceKind,
  { name: string; explorer: string; explanation: string; pending: string }
> = {
  midnightTransaction: {
    name: 'Midnight transaction id',
    explorer: 'the Midnight explorer',
    explanation: 'The id of the transaction that carried this call on Midnight.',
    pending: 'The transaction id appears once the call is submitted to Midnight.',
  },
  vaultRequest: {
    name: 'Sig Network request id',
    explorer: 'the Sig Network explorer',
    explanation:
      'The id of the bidirectional request the Sig Network MPC signs and attests for the vault.',
    pending: 'The request id appears once the request is sent to the MPC.',
  },
  ethereumTransaction: {
    name: 'Ethereum transaction hash',
    explorer: 'the Ethereum explorer',
    explanation: 'The hash of the sweep transaction sent from the deposit account on Ethereum.',
    pending: 'The transaction hash appears once the sweep is broadcast on Ethereum.',
  },
}

const STEP_ITEMS: Record<ActivityStepStatus, { Icon: typeof Circle; tone: string; spin: boolean }> =
  {
    done: { Icon: CircleCheck, tone: 'text-success', spin: false },
    current: { Icon: LoaderCircle, tone: '', spin: true },
    pending: { Icon: Circle, tone: 'text-muted-foreground', spin: false },
    failed: { Icon: TriangleAlert, tone: 'text-destructive', spin: false },
  }
