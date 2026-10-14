'use client'

import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, X } from 'lucide-react'
import { type ReactNode, useEffect, useEffectEvent, useRef } from 'react'
import { toast } from 'sonner'

import { ACTIVITIES_QUERY_KEY } from '@/components/activity-section'
import { useCaller } from '@/components/contexts/CallerContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { ReadinessChecklist } from '@/components/readiness-checklist'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ActivityEntry } from '@/lib/activity/activity-entry'
import { formatTimestamp } from '@/lib/activity/activity-entries'
import type { ActivityWalletTransaction } from '@/lib/midnight/ethereum-erc20-vault/activity-v1/activity'
import { completeDeposit } from '@/server/actions/deposit-actions'
import { listTransactions, submitTransaction } from '@/server/actions/transaction-actions'

interface DepositActionDialogProps {
  entry: ActivityEntry
  onOpenChange: (open: boolean) => void
}

/**
 * The user's turn on a deposit, read from the row's action: balance a proved call with the
 * wallet, or start the completion and then balance its call once proved. The dialog holds no
 * state the server does not, so closing it at any point loses nothing: the row offers the same
 * step again on its next refresh.
 */
export function DepositActionDialog({ entry, onOpenChange }: DepositActionDialogProps): ReactNode {
  const { action } = entry
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        {action.kind === 'balance' ? (
          <BalanceStep entry={entry} transaction={action.transaction} onOpenChange={onOpenChange} />
        ) : action.kind === 'complete' ? (
          <CompleteStep entry={entry} onOpenChange={onOpenChange} />
        ) : (
          <NothingToDo onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  )
}

const CIRCUIT_LABELS: Record<string, string> = {
  startDeposit: 'start',
  completeDeposit: 'completion',
}

/** The proved call is handed to the wallet to balance and sign, then back to the backend to submit. */
function BalanceStep({
  entry,
  transaction,
  onOpenChange,
}: {
  entry: ActivityEntry
  transaction: ActivityWalletTransaction
  onOpenChange: (open: boolean) => void
}): ReactNode {
  const { callerSecret } = useCaller()
  const { wallet } = useMidnightWallet()
  const { checks } = useVaultReadiness()
  const queryClient = useQueryClient()
  const label = CIRCUIT_LABELS[transaction.circuit] ?? transaction.circuit
  const balancing = useMutation({
    mutationFn: async () => {
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
      return submitted.transaction
    },
    onSuccess: async () => {
      toast.success(`The ${label} call is balanced and submitted.`)
      await queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(`Balancing the ${label} call failed: ${error.message}`)
    },
  })
  const dustReady = checks.callerDust.status === 'ok'
  const busy = balancing.isPending
  return (
    <>
      <DialogHeader className="flex-row items-center justify-between">
        <DialogTitle>Balance the {label} call</DialogTitle>
        <DialogClose
          render={<Button variant="ghost" size="icon-sm" aria-label="Close" disabled={busy} />}
        >
          <X />
        </DialogClose>
      </DialogHeader>
      <DialogDescription>
        The {label} call of your deposit of {entry.from.amount} {entry.from.assetSymbol} is proved.
        Your Midnight wallet pays its DUST fee and signs it, then the backend submits it.
        {transaction.expireTime !== null &&
          ` It expires at ${formatTimestamp(transaction.expireTime)}.`}
      </DialogDescription>
      {wallet === null ? (
        <p role="alert" className="text-sm text-destructive">
          Connect your Midnight wallet to balance the call.
        </p>
      ) : (
        !dustReady && <ReadinessChecklist checkIds={['callerDust']} />
      )}
      <DialogFooter>
        <Button
          type="button"
          disabled={busy || wallet === null || !dustReady}
          onClick={() => {
            balancing.mutate()
          }}
        >
          {busy && <LoaderCircle className="animate-spin" aria-hidden />}
          {busy ? 'Balancing…' : 'Balance with your wallet'}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Polls the deposit's calls while the backend proves the completion call. */
const PROVING_POLL_INTERVAL_MS = 2_000

/**
 * Starts the completion as the dialog opens, then waits for the backend to prove the call and
 * offers the balance step for it. A close while proving loses nothing: the row shows the balance
 * step once the proof lands.
 */
function CompleteStep({
  entry,
  onOpenChange,
}: {
  entry: ActivityEntry
  onOpenChange: (open: boolean) => void
}): ReactNode {
  const { callerSecret } = useCaller()
  const { wallet } = useMidnightWallet()
  const queryClient = useQueryClient()
  const completing = useMutation({
    mutationFn: async () => {
      if (callerSecret === null) throw new Error('The identity secret is not set.')
      if (wallet === null) throw new Error('No Midnight wallet is connected.')
      const result = await completeDeposit(callerSecret, {
        name: entry.name,
        wallet: wallet.publicKeys,
      })
      if (!result.ok) throw new Error(result.error)
      return result.deposit
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
    },
    onError: (error) => {
      toast.error(`Completing the deposit failed: ${error.message}`)
      onOpenChange(false)
    },
  })
  // A remount of the same instance must not call the server twice: the second call would be refused.
  const started = useRef(false)
  const startCompletion = useEffectEvent(() => {
    if (started.current) return
    started.current = true
    completing.mutate()
  })
  useEffect(() => {
    startCompletion()
  }, [])
  const calls = useQuery({
    queryKey: ['deposit-calls', entry.name],
    queryFn:
      callerSecret === null || !completing.isSuccess
        ? skipToken
        : async () => {
            const result = await listTransactions(callerSecret, { parent: entry.name })
            if (!result.ok) throw new Error(result.error)
            return result.transactions
          },
    refetchInterval: PROVING_POLL_INTERVAL_MS,
  })
  const proved = calls.data?.find(
    (call) => call.circuit === 'completeDeposit' && call.state === 'AwaitingWallet',
  )
  const failed = calls.data?.find(
    (call) => call.circuit === 'completeDeposit' && call.state === 'Failed',
  )
  if (proved !== undefined) {
    return (
      <BalanceStep
        entry={entry}
        transaction={{ name: proved.name, circuit: proved.circuit, expireTime: proved.expireTime }}
        onOpenChange={onOpenChange}
      />
    )
  }
  return (
    <>
      <DialogHeader className="flex-row items-center justify-between">
        <DialogTitle>Complete the deposit</DialogTitle>
        <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
          <X />
        </DialogClose>
      </DialogHeader>
      <DialogDescription>
        The sweep of your {entry.from.amount} {entry.from.assetSymbol} is attested. The backend
        builds and proves the completion call, which your wallet then balances to mint the vault
        token. You can close this and come back from the row at any time.
      </DialogDescription>
      {failed !== undefined ? (
        <p role="alert" className="text-sm text-destructive">
          The completion call failed: {failed.error ?? failed.failure ?? 'unknown'}. Close and try
          again from the row.
        </p>
      ) : (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {completing.isPending ? 'Building the completion call…' : 'Proving the completion call…'}
        </p>
      )}
    </>
  )
}

function NothingToDo({ onOpenChange }: { onOpenChange: (open: boolean) => void }): ReactNode {
  return (
    <>
      <DialogHeader className="flex-row items-center justify-between">
        <DialogTitle>Nothing to do</DialogTitle>
        <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
          <X />
        </DialogClose>
      </DialogHeader>
      <DialogDescription>The backend is working on this deposit.</DialogDescription>
      <DialogFooter>
        <Button
          type="button"
          onClick={() => {
            onOpenChange(false)
          }}
        >
          Close
        </Button>
      </DialogFooter>
    </>
  )
}
