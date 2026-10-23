'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

export function ModeToggle(): ReactNode {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    // The resolved theme is unknown during server rendering, so the icon follows the `dark` class
    // and the label stays theme-neutral: both render identically on server and client.
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Toggle colour theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  )
}
