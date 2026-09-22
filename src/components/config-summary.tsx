'use client'

import type { ReactNode } from 'react'

import { useConfig } from '@/components/contexts/ConfigContext'
import { Badge } from '@/components/ui/badge'

export function ConfigSummary(): ReactNode {
  const { midnight, ethereum } = useConfig()
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        <dt className="col-span-2 font-medium">Midnight</dt>
        <dt className="text-muted-foreground">Network</dt>
        <dd>
          <Badge variant="secondary">{midnight.networkId}</Badge>
        </dd>
        <dt className="text-muted-foreground">Indexer</dt>
        <dd className="font-mono break-all">{midnight.indexerURL}</dd>
        <dt className="text-muted-foreground">Indexer WS</dt>
        <dd className="font-mono break-all">{midnight.indexerWsURL}</dd>
        <dt className="text-muted-foreground">Node</dt>
        <dd className="font-mono break-all">{midnight.nodeURL}</dd>
        <dt className="text-muted-foreground">Proof server</dt>
        <dd className="font-mono break-all">{midnight.proofServerURL}</dd>
      </dl>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        <dt className="col-span-2 font-medium">Ethereum</dt>
        <dt className="text-muted-foreground">Chain ID</dt>
        <dd className="font-mono">{ethereum.chainId}</dd>
        <dt className="text-muted-foreground">RPC</dt>
        <dd className="font-mono break-all">{ethereum.rpcURL}</dd>
      </dl>
    </div>
  )
}
