'use client'

import type { ReactNode } from 'react'

import { ActivitySection } from '@/components/activity-section'
import { ApprovalTargets } from '@/components/approval-targets'
import { useCaller } from '@/components/contexts/CallerContext'
import { LocalEthereumFaucetPanel } from '@/components/local-ethereum-faucet-panel'

/**
 * The vault's administration: the deployer's approvals of the vault's spenders. Everything
 * waits behind a connected wallet and the vault secret, and the contract itself refuses any
 * secret but the deployer's, so the page needs no gate of its own.
 */
export function AdminPage(): ReactNode {
  const { callerAddress, vaultSecret } = useCaller()
  if (callerAddress === null || vaultSecret === null) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-20 text-center">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p role="status" className="text-muted-foreground">
          Connect a Midnight wallet and set the vault secret to access admin functionality.
        </p>
      </main>
    )
  }
  return (
    <main className="flex flex-1 flex-col gap-10 px-5 py-10 md:px-[calc(100vw*60/1440)] md:py-19.75">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-muted-foreground">
          The vault's approvals run under its deployer's vault secret only: any other secret is
          refused when the call is built.
        </p>
      </div>
      <ApprovalTargets />
      <LocalEthereumFaucetPanel />
      <ActivitySection types={['Approval']} title="Approvals" />
    </main>
  )
}
