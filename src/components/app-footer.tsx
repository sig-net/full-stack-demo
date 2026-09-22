import type { ReactNode } from 'react'

import { GithubIcon } from '@/components/github-icon'
import { Button } from '@/components/ui/button'

const REPOSITORY_URL = 'https://github.com/sig-net/full-stack-demo'

export function AppFooter(): ReactNode {
  return (
    // Half of the AppBar's h-14.
    <footer className="flex h-7 shrink-0 items-center border-t bg-secondary px-4">
      <Button
        variant="ghost"
        size="icon-xs"
        nativeButton={false}
        aria-label="Open on GitHub"
        render={<a href={REPOSITORY_URL} target="_blank" rel="noreferrer" />}
      >
        <GithubIcon />
      </Button>
    </footer>
  )
}
