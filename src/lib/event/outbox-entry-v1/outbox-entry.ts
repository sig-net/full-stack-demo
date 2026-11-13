import { z } from 'zod'

import { UUID } from '@/lib/value-schemas'

/** The collection segment of an outbox entry's resource name. */
export const OUTBOX_ENTRY_COLLECTION = 'outbox-entries'

/** `outbox-entries/{entry}`, where the entry is the id of the event it holds. */
export const outboxEntryNameSchema = z
  .string()
  .regex(
    new RegExp(`^${OUTBOX_ENTRY_COLLECTION}/${UUID}$`),
    `expected ${OUTBOX_ENTRY_COLLECTION}/{uuid}`,
  )

/** One event waiting to be relayed to Kafka, written in the transaction that produced it. */
export const outboxEntrySchema = z.object({
  name: outboxEntryNameSchema,
  /** The event's type, so the table can be read without decoding `data`. */
  type: z.string().min(1),
  /** The serialised event. */
  data: z.instanceof(Uint8Array),
  sent: z.boolean(),
  createdAt: z.date(),
})

export type OutboxEntry = z.infer<typeof outboxEntrySchema>

export function outboxEntryName(id: string): string {
  return `${OUTBOX_ENTRY_COLLECTION}/${id}`
}
