import 'server-only'

import { EXAMPLE_MESSAGES_TOPIC, type ExampleMessage } from '@/lib/example-messages/example-message'
import { getProducer } from '@/lib/kafka/clients'

/** Resolves once the broker has acknowledged the record. */
export async function publishExampleMessage(message: ExampleMessage): Promise<void> {
  const producer = await getProducer()
  await producer.send({
    messages: [{ topic: EXAMPLE_MESSAGES_TOPIC, value: JSON.stringify(message) }],
  })
}
