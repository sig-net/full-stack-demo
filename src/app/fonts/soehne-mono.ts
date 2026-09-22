import localFont from 'next/font/local'

/**
 * Söhne Mono, licensed from Klim Type Foundry for sig.network. The files come from the brand
 * assets in Notion and stay in this folder so the application serves them itself.
 */
export const soehneMono = localFont({
  variable: '--font-soehne-mono',
  src: [
    { path: './soehne-mono-extraleicht.woff2', weight: '200', style: 'normal' },
    { path: './soehne-mono-leicht.woff2', weight: '300', style: 'normal' },
    { path: './soehne-mono-buch.woff2', weight: '400', style: 'normal' },
    { path: './soehne-mono-kraftig.woff2', weight: '500', style: 'normal' },
  ],
})
