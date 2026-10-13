import qrcode from 'qrcode-generator'

/** The module grid of a QR code: `size` modules a side, `dark(row, column)` for each. */
export interface QrModules {
  readonly size: number
  readonly dark: (row: number, column: number) => boolean
}

/** Encodes `value` at error correction level H, which keeps the code readable with a logo over its centre. */
export function qrModules(value: string): QrModules {
  const code = qrcode(0, 'H')
  code.addData(value)
  code.make()
  return { size: code.getModuleCount(), dark: (row, column) => code.isDark(row, column) }
}

/** Finder patterns are seven modules square in the top-left, top-right and bottom-left corners. */
export const FINDER_SIZE = 7

export function inFinder(size: number, row: number, column: number): boolean {
  const low = (index: number): boolean => index < FINDER_SIZE
  const high = (index: number): boolean => index >= size - FINDER_SIZE
  return (low(row) && low(column)) || (low(row) && high(column)) || (high(row) && low(column))
}
