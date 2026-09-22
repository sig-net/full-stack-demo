'use client'

import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { useConfig } from '@/contexts/config-context'

export function ConfigSummary(): ReactNode {
  const config = useConfig()
  return (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
      <dt className="text-muted-foreground">Environment</dt>
      <dd>
        <Badge variant="secondary">{config.environment}</Badge>
      </dd>
      <dt className="text-muted-foreground">Node URL</dt>
      <dd className="font-mono break-all">{config.nodeURL}</dd>
    </dl>
  )
}
