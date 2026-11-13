import type { OutboxEntry } from '@/lib/event/outbox-entry-v1/outbox-entry'
import type { Repository } from '@/lib/repository/repository'

export type OutboxEntryRepository = Repository<OutboxEntry>
