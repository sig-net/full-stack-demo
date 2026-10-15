'use client'

import { skipToken, useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useCaller } from '@/components/contexts/CallerContext'
import type { ApprovalTarget } from '@/lib/midnight/ethereum-erc20-vault/approval-v1/approval'
import { listApprovalTargets } from '@/server/actions/approval-actions'

/** The first key segment, for a control that changed an allowance to invalidate the read. */
export const APPROVAL_TARGETS_QUERY_KEY = 'approval-targets'

/** The chain's allowance moves only when an approval lands, so the list follows at the sweep's pace. */
const TARGETS_REFETCH_INTERVAL_MS = 15_000

/** Every spender the vault may grant, with the allowance the vault account holds for it now, read for the identity secret's caller. */
export function useApprovalTargets(): UseQueryResult<ApprovalTarget[]> {
  const { callerSecret, callerName } = useCaller()
  return useQuery({
    queryKey: [APPROVAL_TARGETS_QUERY_KEY, callerName],
    queryFn:
      callerSecret === null
        ? skipToken
        : async () => {
            const result = await listApprovalTargets(callerSecret, {})
            if (!result.ok) throw new Error(result.error)
            return result.targets
          },
    refetchInterval: TARGETS_REFETCH_INTERVAL_MS,
  })
}
