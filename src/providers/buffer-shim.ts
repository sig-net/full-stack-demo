// This side-effect import must precede SDK modules that capture the browser globals.
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  Object.defineProperty(globalThis, "Buffer", {
    value: Buffer,
    writable: true,
    configurable: true,
  });
}

// SDK transports must capture a bound fetch to preserve its browser receiver.
if (typeof globalThis.fetch === "function") {
  const native = globalThis.fetch;
  // The retained marker prevents hot reload from binding the captured fetch repeatedly.
  if (!("__bound__" in native) || !native.__bound__) {
    globalThis.fetch = Object.assign(native.bind(globalThis), { __bound__: true });
  }
}
