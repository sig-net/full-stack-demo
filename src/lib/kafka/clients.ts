import 'server-only'

import {
  Consumer,
  Producer,
  stringDeserializers,
  stringSerializers,
  type BaseOptions,
} from '@platformatic/kafka'

import { getServerConfig } from '@/lib/config/server-config'

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

// One producer serves the whole server process.
let producer: Promise<StringProducer> | undefined

export function getProducer(): Promise<StringProducer> {
  producer ??= createProducer().catch((error: unknown) => {
    producer = undefined
    throw error
  })
  return producer
}

/** The caller owns the returned consumer and closes it. */
export async function createConsumer(groupId: string): Promise<StringConsumer> {
  return new Consumer({
    ...(await connectionOptions()),
    groupId,
    deserializers: stringDeserializers,
  })
}
