import 'server-only'

import { setTimeout as delay } from 'node:timers/promises'

import { MessagesStreamFallbackModes, MessagesStreamModes } from '@platformatic/kafka'

import { EXAMPLE_MESSAGES_TOPIC } from '@/lib/example-messages/example-message'
import { createConsumer } from '@/lib/kafka/clients'

const GROUP_ID = 'full-stack-demo.example-messages'
const RESTART_DELAY_MS = 5_000

async function consumeExampleMessages(): Promise<void> {
  const consumer = await createConsumer(GROUP_ID)
  try {
    const stream = await consumer.consume({
      topics: [EXAMPLE_MESSAGES_TOPIC],
      mode: MessagesStreamModes.COMMITTED,
      fallbackMode: MessagesStreamFallbackModes.EARLIEST,
      autocommit: true,
    })
    for await (const record of stream) {
      console.log(
        `Example message received at ${record.partition}:${record.offset.toString()}: ${record.value}`,
      )
    }
  } finally {
    await consumer.close(true)
  }
}

/** Consumes for the life of the server process, restarting after a failure. */
export function startExampleMessageConsumer(): void {
  void (async (): Promise<never> => {
    for (;;) {
      try {
        await consumeExampleMessages()
      } catch (error: unknown) {
        console.error('Example message consumer failed, restarting', error)
      }
      await delay(RESTART_DELAY_MS)
    }
  })()
}
