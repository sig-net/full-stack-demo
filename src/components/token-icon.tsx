'use client'

import { NetworkIcon, TokenIcon as Web3TokenIcon } from '@web3icons/react/dynamic'
import { cn } from 'cn'
import { Coins } from 'lucide-react'
import Image from 'next/image'
import type { ReactNode } from 'react'

import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { IconSource } from '@/lib/icon-source'

interface TokenIconProps {
  assetSymbol: string
  networkName: string
  icon: IconSource
  networkIcon: IconSource
}

/**
 * A 28px asset icon with a 12px badge of the network the asset came from on its bottom-right
 * corner. A bundled badge image carries its own rounded border, so the badge frame draws none.
 */
export function TokenIcon({
  assetSymbol,
  networkName,
  icon,
  networkIcon,
}: TokenIconProps): ReactNode {
  const glyph = <Coins className="size-4" aria-hidden />
  return (
    <Avatar
      className="size-7 after:hidden"
      role="img"
      aria-label={`${assetSymbol} on ${networkName}`}
    >
      {icon.source === 'image' && <AvatarImage src={icon.url} alt="" />}
      <AvatarFallback className="overflow-hidden">
        {icon.source === 'web3icons' ? (
          <Web3TokenIcon
            symbol={icon.name}
            variant="branded"
            size={WEB3ICONS_TOKEN_SIZE}
            className="shrink-0"
            fallback={glyph}
            aria-hidden
          />
        ) : (
          glyph
        )}
      </AvatarFallback>
      <AvatarBadge
        className={cn(
          'overflow-hidden rounded-xs ring-0 group-data-[size=default]/avatar:size-3 group-data-[size=default]/avatar:[&>svg]:size-3',
          networkIcon.source === 'image' ? 'border-0 bg-transparent' : 'border',
        )}
      >
        {networkIcon.source === 'image' && (
          <Image
            src={networkIcon.url}
            alt=""
            width={12}
            height={12}
            unoptimized
            className="size-3"
          />
        )}
        {networkIcon.source === 'web3icons' && (
          <NetworkIcon name={networkIcon.name} variant="branded" size={12} aria-hidden />
        )}
      </AvatarBadge>
    </Avatar>
  )
}

/** A branded web3icons token draws its circle with radius 9 in a 24-unit box, so this scale fills the 28px avatar with it. */
const WEB3ICONS_TOKEN_SIZE = 28 * (24 / 18)
