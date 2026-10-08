import 'server-only'

import {
  Consumer,
  Producer,
  stringDeserializers,
  stringSerializers,
  type BaseOptions,
} from '@platformatic/kafka'

import { getServerConfig } from '@/lib/config/server-config'
import { lazySingleton } from '@/lib/lazy-singleton'

export type StringProducer = Producer<string, string, string, string>
export type StringConsumer = Consumer<string, string, string, string>

async function connectionOptions(): Promise<BaseOptions> {
  const { serverOnly } = await getServerConfig()
  return {
    clientId: 'full-stack-demo',
    bootstrapBrokers: [...serverOnly.kafka.brokers],
    // Topics come into existence on first use, which needs the broker's auto.create.topics.enable.
    autocreateTopics: true,
  }
}

async function createProducer(): Promise<StringProducer> {
  return new Producer({ ...(await connectionOptions()), serializers: stringSerializers })
}

/** One producer serves the whole server process. */
export const getProducer: () => Promise<StringProducer> = lazySingleton(createProducer)

/** The caller owns the returned consumer and closes it. */
export async function createConsumer(groupId: string): Promise<StringConsumer> {
  return new Consumer({
    ...(await connectionOptions()),
    groupId,
    deserializers: stringDeserializers,
  })
}
