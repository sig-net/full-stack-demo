import { Settings } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function SettingsPopover(): ReactNode {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="h-auto flex-col gap-1.75 px-4 py-2 text-muted-foreground"
          />
        }
      >
        <Settings className="size-5" />
        Settings
      </PopoverTrigger>
      <PopoverContent align="end">Settings</PopoverContent>
    </Popover>
  )
}
