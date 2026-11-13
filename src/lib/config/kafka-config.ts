import { z } from 'zod'

export interface KafkaConfig {
  /** Bootstrap brokers as `host:port`. */
  readonly brokers: readonly string[]
}

export const kafkaEnvSchema = z.object({
  KAFKA_BROKERS: z
    .string()
    .transform((value) => value.split(',').map((broker) => broker.trim()))
    .pipe(z.array(z.string().regex(/^\S+:[0-9]+$/, 'expected host:port')).min(1)),
})

export type KafkaEnv = z.infer<typeof kafkaEnvSchema>

export function kafkaConfigFromEnv(env: KafkaEnv): KafkaConfig {
  return { brokers: env.KAFKA_BROKERS }
}
