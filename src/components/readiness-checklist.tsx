'use client'

import { cn } from 'cn'
import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

import { useVaultReadiness } from '@/components/contexts/VaultReadinessContext'
import { EthereumAccountLink } from '@/components/ethereum-account-link'
import { LocalEthFaucetButton } from '@/components/local-eth-faucet-button'
import { StatusDot } from '@/components/status-dot'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { abbreviateHex } from '@/lib/abbreviate-hex'
import {
  READINESS_ASSET_DECIMALS,
  type ReadinessAsset,
  type ReadinessCheck,
  type ReadinessCheckId,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'

/**
 * One bullet per check: its outcome in words, red unless it passes, an info tip naming the payer,
 * the amounts and the account, a link to an ETH account on the chain's explorer, and on the
 * local stack a faucet wand for it.
 */
export function ReadinessChecklist({
  checkIds,
}: {
  checkIds: readonly ReadinessCheckId[]
}): ReactNode {
  const { checks } = useVaultReadiness()
  return (
    <TooltipProvider>
      {/* A flex row keeps the dot, the text and the taller controls on one centred axis, which a list marker cannot. */}
      <ul role="list" className="flex flex-col gap-1">
        {checkIds.map((id) => {
          const check = checks[id]
          return (
            <li
              key={id}
              className={cn(
                'flex items-center gap-1.5',
                check.status !== 'ok' && 'text-destructive',
              )}
            >
              <StatusDot tone="current" />
              <span>{outcome(id, check)}</span>
              <Tooltip>
                <TooltipTrigger
                  render={<span tabIndex={0} className="inline-flex rounded-md" />}
                  aria-label={`About the ${READINESS_ITEMS[id].subject} check`}
                >
                  <Info aria-hidden className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <ReadinessDetail id={id} check={check} />
                </TooltipContent>
              </Tooltip>
              {check.asset === 'ETH' && check.account !== '' && (
                <>
                  <EthereumAccountLink
                    account={check.account}
                    label={READINESS_ITEMS[id].subject}
                  />
                  <LocalEthFaucetButton account={check.account} />
                </>
              )}
            </li>
          )
        })}
      </ul>
    </TooltipProvider>
  )
}

function outcome(id: ReadinessCheckId, check: ReadinessCheck): string {
  return `${READINESS_ITEMS[id].subject} ${OUTCOME_BY_STATUS[check.status](check.asset)}`
}

const OUTCOME_BY_STATUS: Record<ReadinessCheck['status'], (asset: ReadinessAsset) => string> = {
  ok: (asset) => `has enough ${asset}`,
  insufficient: (asset) => `has insufficient ${asset}`,
  unavailable: (asset) => `${asset} could not be checked`,
}

function ReadinessDetail({
  id,
  check,
}: {
  id: ReadinessCheckId
  check: ReadinessCheck
}): ReactNode {
  const decimals = READINESS_ASSET_DECIMALS[check.asset]
  return (
    <div className="flex flex-col gap-1">
      <p>{READINESS_ITEMS[id].explanation}</p>
      {check.status === 'unavailable' ? (
        <p>{check.reason}</p>
      ) : (
        <p>
          Has {formatTokenAmount(check.available, decimals)} {check.asset}, needs{' '}
          {formatTokenAmount(check.required, decimals)} {check.asset}.
        </p>
      )}
      {check.account !== '' && (
        <p className="font-mono" title={check.account}>
          {abbreviateHex(check.account)}
        </p>
      )}
    </div>
  )
}

const READINESS_ITEMS: Record<ReadinessCheckId, { subject: string; explanation: string }> = {
  relayerDust: {
    subject: 'relayer',
    explanation:
      'The relayer pays the DUST fees of your vault calls and of the vault queue flushes, sends and attestations.',
  },
  depositAccountEth: {
    subject: 'deposit account',
    explanation: 'The deposit account pays the gas of the deposit on Ethereum.',
  },
  vaultAccountEth: {
    subject: 'vault account',
    explanation:
      'The vault account pays the gas of withdrawals, swaps and the other vault actions on Ethereum.',
  },
}
