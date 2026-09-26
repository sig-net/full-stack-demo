import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { BrandEmblem } from '@/components/brand-emblem'
import { ConfigSummary } from '@/components/config-summary'
import { ModeToggle } from '@/components/mode-toggle'
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
  { name: 'Side column', className: 'bg-side-column' },
  { name: 'Pink', className: 'bg-pink' },
  { name: 'Green', className: 'bg-green' },
]

export const metadata: Metadata = { title: 'Design' }

export default function DesignPage(): ReactNode {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <section className="flex items-center gap-4">
        <BrandEmblem className="h-12 w-10 shrink-0" />
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-semibold">Design</h1>
          <p className="text-muted-foreground">
            Configuration, theme, palette and component library.
          </p>
        </div>
        <ModeToggle />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            The client configuration, read from the server at request time and injected through
            ConfigProvider.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfigSummary />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
          <CardDescription>Button and badge variants from the shared library.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Tertiary</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="pink">Pink</Button>
            <Button variant="green">Green</Button>
            <Button disabled>Disabled</Button>
            <Button variant="pink" disabled>
              Pink disabled
            </Button>
            <Button variant="green" disabled>
              Green disabled
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button>Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="xl">Extra large</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="success">Complete</Badge>
            <Badge variant="warning">Pending</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Typography</CardTitle>
          <CardDescription>
            Elza Text for interface text, Söhne Mono for technical content.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-2xl font-light">Elza Text Light 300</p>
          <p className="text-2xl">Elza Text Regular 400</p>
          <p className="text-2xl font-medium">Elza Text Medium 500</p>
          <p className="text-2xl font-semibold">Elza Text Semibold 600</p>
          <p className="text-2xl font-bold">Elza Text Bold 700</p>
          <p className="font-mono text-xl font-extralight">Söhne Mono Extraleicht 200</p>
          <p className="font-mono text-xl font-light">Söhne Mono Leicht 300</p>
          <p className="font-mono text-xl">Söhne Mono Buch 400 0x10B4…6dFa</p>
          <p className="font-mono text-xl font-medium">Söhne Mono Kräftig 500 $6888.02</p>
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
