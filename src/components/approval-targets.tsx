'use client'

import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { ACTIVITIES_QUERY_KEY } from '@/components/activity-section'
import { useCaller } from '@/components/contexts/CallerContext'
import { useMidnightWallet } from '@/components/contexts/MidnightWalletContext'
import { useTokenInfoRegistry } from '@/components/contexts/TokenInfoRegistryContext'
import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { ReadinessChecklist } from '@/components/readiness-checklist'
import { ReadinessRecheckButton } from '@/components/readiness-recheck-button'
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
import { missingReadiness } from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { tokenLabel } from '@/lib/tokens/token-label'
import { listApprovalTargets, startApproval } from '@/server/actions/approval-actions'

const TARGETS_REFETCH_INTERVAL_MS = 15_000

const KIND_LABELS: Record<ApprovalKind, string> = {
  router: 'Uniswap router',
  stata: 'Aave static wrapper',
}

/**
 * Every spender the vault may grant, with the allowance the vault account holds for it, and the
 * control that starts the approval the spender still lacks. The allowance is the chain's word:
 * an approval in flight shows in the Approvals list below until the chain reflects it.
 */
export function ApprovalTargets(): ReactNode {
  const { callerSecret, callerName } = useCaller()
  const { wallet } = useMidnightWallet()
  const registry = useTokenInfoRegistry()
  const { checks } = useVaultReadiness()
  const queryClient = useQueryClient()
  const targets = useQuery({
    queryKey: ['approval-targets', callerName],
    queryFn:
      callerSecret === null
        ? skipToken
        : async () => {
            const result = await listApprovalTargets(callerSecret, {})
            if (!result.ok) throw new Error(result.error)
            return result.targets
          },
    // The chain's allowance moves only when an approval lands, so the list follows at the sweep's pace.
    refetchInterval: TARGETS_REFETCH_INTERVAL_MS,
  })
  const approving = useMutation({
    mutationFn: async (target: ApprovalTarget) => {
      if (callerSecret === null) throw new Error('The identity secret is not set.')
      if (wallet === null) throw new Error('No Midnight wallet is connected.')
      const result = await startApproval(callerSecret, {
        approvalRequest:
          target.kind === 'router'
            ? { kind: 'router', erc20Address: target.erc20Address }
            : { kind: 'stata' },
        wallet: wallet.publicKeys,
      })
      if (!result.ok) throw new Error(result.error)
      return result.approval
    },
    onSuccess: async (approval) => {
      toast.success(
        `Approval of ${symbolOf(approval.erc20Address)} for ${KIND_LABELS[approval.kind]} started. Sign its start call from the Approvals row once it is proved.`,
      )
      await queryClient.invalidateQueries({ queryKey: [ACTIVITIES_QUERY_KEY] })
    },
    onError: (error) => {
      toast.error(`Starting the approval failed: ${error.message}`)
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
