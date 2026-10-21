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
  type BalanceCheck,
  type BalanceCheckId,
  type InitialisationCheck,
  READINESS_ASSET_DECIMALS,
  type ReadinessAsset,
  type ReadinessCheckId,
} from '@/lib/midnight/ethereum-erc20-vault/readiness-v1/vault-readiness'
import { formatTokenAmount } from '@/lib/tokens/format-token-amount'

/**
 * One bullet per check: its outcome in words, red unless it passes, and an info tip explaining
 * it. A balance check's tip also names the payer, the amounts and the account, with a link to an
 * ETH account on the chain's explorer and, on the local stack, a faucet wand for it.
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
        {checkIds.map((id) =>
          id === 'vaultInitialised' ? (
            <InitialisationItem key={id} check={checks.vaultInitialised} />
          ) : (
            <BalanceItem key={id} id={id} check={checks[id]} />
          ),
        )}
      </ul>
    </TooltipProvider>
  )
}

function InitialisationItem({ check }: { check: InitialisationCheck }): ReactNode {
  return (
    <ChecklistItem
      passed={check.status === 'ok'}
      outcome={INITIALISATION_OUTCOME_BY_STATUS[check.status]}
      subject="vault initialisation"
    >
      <div className="flex flex-col gap-1">
        <p>
          The deployer's initialise call pins the vault's Ethereum account, chain, allowed tokens,
          spenders and gas envelope. No vault action can start before it runs.
        </p>
        {check.status === 'unavailable' && <p>{check.reason}</p>}
      </div>
    </ChecklistItem>
  )
}

const INITIALISATION_OUTCOME_BY_STATUS: Record<InitialisationCheck['status'], string> = {
  ok: 'vault is initialised',
  uninitialised: 'vault is not initialised',
  unavailable: 'vault initialisation could not be checked',
}

function BalanceItem({ id, check }: { id: BalanceCheckId; check: BalanceCheck }): ReactNode {
  return (
    <ChecklistItem
      passed={check.status === 'ok'}
      outcome={`${BALANCE_ITEMS[id].subject} ${BALANCE_OUTCOME_BY_STATUS[check.status](check.asset)}`}
      subject={BALANCE_ITEMS[id].subject}
      controls={
        check.asset === 'ETH' &&
        check.account !== '' && (
          <>
            <EthereumAccountLink account={check.account} label={BALANCE_ITEMS[id].subject} />
            <LocalEthFaucetButton account={check.account} />
          </>
        )
      }
    >
      <BalanceDetail id={id} check={check} />
    </ChecklistItem>
  )
}

function ChecklistItem({
  passed,
  outcome,
  subject,
  controls,
  children,
}: {
  passed: boolean
  outcome: string
  /** What the info tip's accessible name says the check is about. */
  subject: string
  controls?: ReactNode
  /** The info tip's content. */
  children: ReactNode
}): ReactNode {
  return (
    <li className={cn('flex items-center gap-1.5', !passed && 'text-destructive')}>
      <StatusDot tone="current" />
      <span>{outcome}</span>
      <Tooltip>
        <TooltipTrigger
          render={<span tabIndex={0} className="inline-flex rounded-md" />}
          aria-label={`About the ${subject} check`}
        >
          <Info aria-hidden className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{children}</TooltipContent>
      </Tooltip>
      {controls}
    </li>
  )
}

const BALANCE_OUTCOME_BY_STATUS: Record<BalanceCheck['status'], (asset: ReadinessAsset) => string> =
  {
    ok: (asset) => `has enough ${asset}`,
    insufficient: (asset) => `has insufficient ${asset}`,
    unavailable: (asset) => `${asset} could not be checked`,
  }

function BalanceDetail({ id, check }: { id: BalanceCheckId; check: BalanceCheck }): ReactNode {
  const decimals = READINESS_ASSET_DECIMALS[check.asset]
  return (
    <div className="flex flex-col gap-1">
      <p>{BALANCE_ITEMS[id].explanation}</p>
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

const BALANCE_ITEMS: Record<BalanceCheckId, { subject: string; explanation: string }> = {
  callerDust: {
    subject: 'Midnight wallet',
    explanation: 'Your Midnight wallet pays the DUST fees of the two vault calls it signs.',
  },
  relayerDust: {
    subject: 'relayer',
    explanation:
      'The relayer pays the DUST fees of the vault queue flushes, sends and attestations.',
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
