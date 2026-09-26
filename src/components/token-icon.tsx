import { Coins } from 'lucide-react'
import type { ReactNode } from 'react'

import { Avatar, AvatarBadge, AvatarFallback } from '@/components/ui/avatar'

interface TokenIconProps {
  assetSymbol: string
  networkName: string
}

/** A 28px asset icon with a 12px network badge on its bottom-right corner. */
export function TokenIcon({ assetSymbol, networkName }: TokenIconProps): ReactNode {
  return (
    <Avatar className="size-7" role="img" aria-label={`${assetSymbol} on ${networkName}`}>
      <AvatarFallback>
        <Coins className="size-4" aria-hidden />
      </AvatarFallback>
      <AvatarBadge className="rounded-xs border ring-0 group-data-[size=default]/avatar:size-3" />
    </Avatar>
  )
}
