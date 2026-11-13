import { type Backend, getBackend } from '@/server/backend'

/** The backend of this test file's module graph, built from `.env.local` as the server's is. */
export function testBackend(): Promise<Backend> {
  return getBackend()
}

/** A caller name no other run shares, so a file's rows are its own to create and delete. */
export function uniqueCallerName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `callers/${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
