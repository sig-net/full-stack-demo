import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ErrorNoticeProps {
  error: Error & { digest?: string }
  retry: () => void
}

export function ErrorNotice({ error, retry }: ErrorNoticeProps): ReactNode {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Something went wrong</CardTitle>
        <CardDescription>{error.message}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error.digest !== undefined && (
          <p className="font-mono text-xs text-muted-foreground">Error ID: {error.digest}</p>
        )}
        <Button onClick={retry}>Try again</Button>
      </CardContent>
    </Card>
  )
}
