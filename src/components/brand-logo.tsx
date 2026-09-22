import Image from 'next/image'
import type { ReactNode } from 'react'

export function BrandLogo(): ReactNode {
  return (
    <a href="https://sig.network" className="flex items-center">
      <Image
        src="/icons/signetwork-logo-black.svg"
        alt="sig.network"
        width={600}
        height={102}
        priority
        className="h-5 w-auto dark:hidden"
      />
      <Image
        src="/icons/signetwork-logo-white.svg"
        alt="sig.network"
        width={600}
        height={102}
        priority
        className="hidden h-5 w-auto dark:block"
      />
    </a>
  )
}
