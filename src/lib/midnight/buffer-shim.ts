// Side-effect import. It must precede the wallet SDK modules, which capture these globals on load.
import { Buffer } from 'buffer'

if (typeof globalThis.Buffer === 'undefined') {
  Object.defineProperty(globalThis, 'Buffer', { value: Buffer, writable: true, configurable: true })
}

// The SDK transports call the captured fetch without a receiver, which the browser's rejects.
if (typeof globalThis.fetch === 'function') {
  const native = globalThis.fetch
  if (!('boundToGlobal' in native) || !native.boundToGlobal) {
    globalThis.fetch = Object.assign(native.bind(globalThis), { boundToGlobal: true })
  }
}
