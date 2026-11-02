import { Buffer } from 'buffer';

// Anchor's browser coder and its dependencies serialize public account bytes
// using the Buffer API. This polyfill handles bytes only, never signing keys.
if (!('Buffer' in globalThis)) {
  Object.defineProperty(globalThis, 'Buffer', { value: Buffer, configurable: true, writable: true });
}
