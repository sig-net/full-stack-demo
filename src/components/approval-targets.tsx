'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'

import { ACTIVITIES_QUERY_KEY } from '@/components/activity-section'
import { useCaller } from '@/components/contexts/CallerContext'
import { useConfig } from '@/components/contexts/ConfigContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { ReadinessChecklist } from '@/components/readiness-checklist'
import { ReadinessRecheckButton } from '@/components/readiness-recheck-button'
import { useApprovalTargets } from '@/components/use-approval-targets'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { abbreviateHex } from '@/lib/abbreviate-hex'
import type {
  ApprovalKind,
  ApprovalTarget,
} from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import type { CallerCallStage } from '@/lib/midnight/ethereum-erc20-vault/caller-operation/browser-caller-calls'
import { missingReadiness } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { tokenLabel } from '@/lib/tokens/token-label'
import { prepareStartApproval, startApproval } from '@/server/actions/approval-actions'

const KIND_LABELS: Record<ApprovalKind, string> = {
  router: 'Uniswap router',
  stata: 'Aave static wrapper',
}

/**
 * Every spender the vault may grant, with the allowance the vault account holds for it, and the
 * control that starts the approval the spender still lacks. The allowance is the chain's word:
 * an approval in flight shows in the Approvals list below until the chain reflects it. The page
 * builds, proves and binds the approval's start call, and the server records it for the relayer
 * to pay and submit.
 */
export function ApprovalTargets(): ReactNode {
  const { callerSecret } = useCaller()
  const { wallet } = useMidnightWallet()
  const config = useConfig()
  const registry = useTokenInfoRegistry()
  const { checks } = useVaultReadiness()
  const queryClient = useQueryClient()
  const targets = useApprovalTargets()
  const [stage, setStage] = useState<CallerCallStage | null>(null)
  const approving = useMutation({
    mutationFn: async (target: ApprovalTarget) => {
      if (callerSecret === null) throw new Error('The identity secret is not set.')
      if (wallet === null) throw new Error('No Midnight wallet is connected.')
      // Loaded on first use, so a visitor who never approves never downloads the call builder and the contract.
      const calls =
        await import('@/lib/midnight/ethereum-erc20-vault/approval-v1/browser-approval-calls')
      return calls.startApprovalInBrowser({
        actions: { prepareStartApproval, startApproval },
        builder: calls.browserApprovalCallBuilder(config, window.location.origin),
        wallet,
        callerSecret,
        approvalRequest:
          target.kind === 'router'
            ? { kind: 'router', erc20Address: target.erc20Address }
            : { kind: 'stata' },
        onStage: setStage,
      })
    },
    onSuccess: async (approval) => {
      toast.success(
        `Approval of ${symbolOf(approval.erc20Address)} for ${KIND_LABELS[approval.kind]} started: the backend is paying for its start call and submitting it.`,
      )
      await queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
    },
    onError: (error) => {
      toast.error(`Starting the approval failed: ${error.message}`)
    },
    onSettled: () => {
      setStage(null)
    },
  })
  const symbolOf = (erc20Address: string): string => {
    const info = registry.byErc20Address(erc20Address)
    return info === undefined ? abbreviateHex(erc20Address) : tokenLabel(info)
  }
  const missing = missingReadiness('approve', checks)
  const canApprove = wallet !== null && missing.length === 0 && !approving.isPending
  return (
    <section aria-labelledby="approval-targets-title" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2
          id="approval-targets-title"
          className="text-base/4.5 font-bold tracking-widest text-subtle-foreground uppercase"
        >
          Spenders
        </h2>
        <ReadinessRecheckButton />
      </div>
      {wallet === null ? (
        <p role="status" className="text-muted-foreground">
          Connect the deployer's Midnight wallet to approve a spender.
        </p>
      ) : (
        missing.length > 0 && <ReadinessChecklist checkIds={missing} />
      )}
      {approving.isPending && stage !== null && (
        <p role="status" className="text-sm text-muted-foreground">
          {START_STAGE_LABELS[stage]}
        </p>
      )}
      {targets.isError ? (
        <p role="alert" className="text-destructive">
          {targets.error.message}
        </p>
      ) : targets.isPending ? (
        <p role="status" className="text-muted-foreground">
          Reading the vault's spenders…
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Spender</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Allowance</TableHead>
              <TableHead>
                <span className="sr-only">Approve</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.data.map((target) => (
              <TableRow key={`${target.kind}:${target.erc20Address}`}>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{KIND_LABELS[target.kind]}</span>
                    <span
                      className="font-mono text-xs text-muted-foreground"
                      title={target.spender}
                    >
                      {abbreviateHex(target.spender)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{symbolOf(target.erc20Address)}</TableCell>
                <TableCell>
                  {target.allowance > 0n ? (
                    <Badge variant="success">Approved</Badge>
                  ) : (
                    <Badge variant="warning">None</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    disabled={!canApprove || target.allowance > 0n}
                    aria-label={`Approve ${KIND_LABELS[target.kind]} on ${symbolOf(target.erc20Address)}`}
                    onClick={() => {
                      approving.mutate(target)
                    }}
                  >
                    {approving.isPending && approving.variables === target && (
                      <LoaderCircle className="animate-spin" aria-hidden />
                    )}
                    Approve
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}

const START_STAGE_LABELS: Record<CallerCallStage, string> = {
  preparing: 'Preparing the approval',
  building: 'Building and proving the start call',
  signing: 'Signing with your wallet',
  recording: 'Recording the approval',
}
