import { z } from 'zod'

export const EXAMPLE_MESSAGES_TOPIC = 'full-stack-demo.example-messages'

/** The JSON value of every record on the example messages topic. */
export const exampleMessageSchema = z.object({
  text: z.string().min(1).max(500),
})

export type ExampleMessage = z.infer<typeof exampleMessageSchema>
