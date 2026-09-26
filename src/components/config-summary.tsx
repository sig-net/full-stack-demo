'use client'

import type { ReactNode } from 'react'

import { useConfig } from '@/components/contexts/ConfigContext'
import { Badge } from '@/components/ui/badge'

function Entry({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono break-all">{value}</dd>
    </>
  )
}

export function ConfigSummary(): ReactNode {
  const { midnightNetwork, midnightSignet, midnightVault, ethereum } = useConfig()
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        <dt className="col-span-2 font-medium">Midnight network</dt>
        <dt className="text-muted-foreground">Network</dt>
        <dd>
          <Badge variant="secondary">{midnightNetwork.networkId}</Badge>
        </dd>
        <Entry label="Indexer" value={midnightNetwork.indexerURL} />
        <Entry label="Indexer WS" value={midnightNetwork.indexerWsURL} />
        <Entry label="Node" value={midnightNetwork.nodeURL} />
        <Entry label="Proof server" value={midnightNetwork.proofServerURL} />
      </dl>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        <dt className="col-span-2 font-medium">Signet</dt>
        <Entry label="Contract" value={midnightSignet.contractAddress} />
        <Entry label="MPC root key" value={midnightSignet.mpcRootPublicKey} />
      </dl>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        <dt className="col-span-2 font-medium">Vault</dt>
        <Entry label="Contract" value={midnightVault.contractAddress} />
      </dl>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        <dt className="col-span-2 font-medium">Ethereum</dt>
        <Entry label="Chain ID" value={ethereum.chainId} />
        <Entry label="RPC" value={ethereum.rpcURL} />
      </dl>
    </div>
  )
}
