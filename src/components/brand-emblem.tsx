import Image from 'next/image'
import type { ReactNode } from 'react'

/** The sig.network swan. Decorative: it sits beside text that already names the brand. */
export function BrandEmblem({ className }: { className?: string }): ReactNode {
  return (
    <span className={className}>
      <Image
        src="/icons/signetwork-swan-black.svg"
        alt=""
        width={100}
        height={120}
        className="size-full dark:hidden"
      />
      <Image
        src="/icons/signetwork-swan-white.svg"
        alt=""
        width={100}
        height={120}
        className="hidden size-full dark:block"
      />
    </span>
  )
}
