import { Copy, SquareArrowOutUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

interface ActivityExplorerProps {
  transactionHashLabel: string
}

/**
 * The block explorer link, the abbreviated transaction hash and its copy action. Both actions are
 * inert until activity entries carry an explorer URL and the full hash. The 24px icon buttons take
 * a -2px margin so their 20px icons sit where the design places them, and the fixed hash width puts
 * the copy icon at the column's right edge.
 */
export function ActivityExplorer({ transactionHashLabel }: ActivityExplorerProps): ReactNode {
  return (
    <div className="flex items-center gap-8.5">
      <Button
        variant="ghost"
        size="icon-xs"
        className="-m-0.5 text-subtle-foreground"
        aria-label={`View transaction ${transactionHashLabel} in the block explorer`}
      >
        <SquareArrowOutUpRight className="size-5" aria-hidden />
      </Button>
      <div className="flex items-center gap-1.5">
        <span className="w-22.5 text-xs/5 font-medium text-tertiary-foreground">
          {transactionHashLabel}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="-m-0.5 text-subtle-foreground"
          aria-label={`Copy transaction hash ${transactionHashLabel}`}
        >
          <Copy className="size-5" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
