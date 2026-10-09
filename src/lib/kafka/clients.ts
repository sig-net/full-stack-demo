import 'server-only'

import {
  Consumer,
  Producer,
  stringDeserializers,
  stringSerializers,
  type BaseOptions,
} from '@platformatic/kafka'

export type StringProducer = Producer<string, string, string, string>
export type StringConsumer = Consumer<string, string, string, string>

export function createProducer(options: BaseOptions): StringProducer {
  return new Producer({ ...options, serializers: stringSerializers })
}

/** The caller owns the returned consumer and closes it. */
export function createConsumer(options: BaseOptions, groupId: string): StringConsumer {
  return new Consumer({ ...options, groupId, deserializers: stringDeserializers })
}

export function kafkaConnectionOptions(brokers: readonly string[]): BaseOptions {
  return {
    clientId: 'full-stack-demo',
    bootstrapBrokers: [...brokers],
    // Topics come into existence on first use, which needs the broker's auto.create.topics.enable.
    autocreateTopics: true,
  }
}
