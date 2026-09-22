import type { ReactNode } from 'react'

import { BrandEmblem } from '@/components/brand-emblem'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ThemeSwatch {
  name: string
  className: string
}

const THEME_SWATCHES: readonly ThemeSwatch[] = [
  { name: 'Background', className: 'bg-background' },
  { name: 'Card', className: 'bg-card' },
  { name: 'Primary', className: 'bg-primary' },
  { name: 'Secondary', className: 'bg-secondary' },
  { name: 'Muted', className: 'bg-muted' },
  { name: 'Accent', className: 'bg-accent' },
  { name: 'Destructive', className: 'bg-destructive' },
  { name: 'Border', className: 'bg-border' },
]

export default function HomePage(): ReactNode {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <section className="flex items-center gap-4">
        <BrandEmblem className="h-12 w-10 shrink-0" />
        <div>
          <h1 className="font-heading text-2xl font-semibold">Full stack demo</h1>
          <p className="text-muted-foreground">
            The application shell: theme, palette and component library.
          </p>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
          <CardDescription>Button and badge variants from the shared library.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Semantic colours from the sig.network palette. They follow the light and dark theme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {THEME_SWATCHES.map((swatch) => (
              <li key={swatch.name} className="flex flex-col gap-1">
                <span className={`h-12 rounded-lg border ${swatch.className}`} />
                <span className="text-xs text-muted-foreground">{swatch.name}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  )
}
