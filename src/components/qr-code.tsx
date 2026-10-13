import type { ReactNode } from 'react'

import { FINDER_SIZE, inFinder, qrModules } from '@/lib/qr-modules'

interface QrCodeProps {
  value: string
  /** The accessible name, since the picture itself says nothing to a screen reader. */
  label: string
  /** The width of the centre square left empty for a logo, as a fraction of the code's width. */
  logoFraction?: number
  className?: string
}

/**
 * A QR code drawn as the design draws it: round modules, square finder patterns and an empty
 * centre for a logo. Dynamic geometry with no shadcn counterpart, so it is built as raw SVG.
 */
export function QrCode({ value, label, logoFraction = 0, className }: QrCodeProps): ReactNode {
  const { size, dark } = qrModules(value)
  const clear = Math.ceil(size * logoFraction)
  const clearStart = Math.floor((size - clear) / 2)
  const inLogo = (index: number): boolean => index >= clearStart && index < clearStart + clear
  const dots: ReactNode[] = []
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!dark(row, column) || inFinder(size, row, column) || (inLogo(row) && inLogo(column))) {
        continue
      }
      dots.push(<circle key={`${row}-${column}`} cx={column + 0.5} cy={row + 0.5} r={DOT_RADIUS} />)
    }
  }
  const finderOrigins: [number, number][] = [
    [0, 0],
    [size - FINDER_SIZE, 0],
    [0, size - FINDER_SIZE],
  ]
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className={className}>
      {finderOrigins.map(([x, y]) => (
        <path
          key={`${x}-${y}`}
          fillRule="evenodd"
          d={`M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z M${x + 2} ${y + 2}h3v3h-3z`}
        />
      ))}
      {dots}
    </svg>
  )
}

/** Modules are drawn as dots four fifths of a module wide, leaving a visible gap between neighbours. */
const DOT_RADIUS = 0.4
