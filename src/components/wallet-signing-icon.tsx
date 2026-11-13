import { cn } from 'cn'
import { Wallet, Zap } from 'lucide-react'
import type { ReactNode } from 'react'

/** A wallet with a bolt at its corner: the mark of a step only the user's wallet can take. */
export function WalletSigningIcon({ className }: { className?: string }): ReactNode {
  return (
    <span aria-hidden className={cn('relative inline-flex size-5 shrink-0', className)}>
      <Wallet className="size-full" />
      <Zap className="absolute -right-1.5 -bottom-0.5 size-[60%] fill-current" />
    </span>
  )
}
