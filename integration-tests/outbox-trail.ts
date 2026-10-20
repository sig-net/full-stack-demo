import type { Backend } from '@/server/backend'

/** The lifecycle event types the outbox holds for one resource, oldest first. */
export async function outboxTrail(backend: Backend, name: string): Promise<string[]> {
  const events = await backend.event.outboxEntryV1.repository.search({
    criteria: [],
    order: { field: 'createdAt', direction: 'asc' },
  })
  return events
    .filter((entry) => new TextDecoder().decode(entry.data).includes(name))
    .map((entry) => entry.type)
}
