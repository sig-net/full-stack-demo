/**
 * Where an icon comes from: a web3icons entry by its lookup name, an image bundled under `public`
 * by its URL path, or nothing, which renders the generic glyph.
 */
export type IconSource =
  | { readonly source: 'web3icons'; readonly name: string }
  | { readonly source: 'image'; readonly url: string }
  | { readonly source: 'none' }

export const NO_ICON: IconSource = { source: 'none' }
