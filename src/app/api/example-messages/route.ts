import { z } from 'zod'

import { exampleMessageSchema } from '@/lib/example-messages/example-message'
import { publishExampleMessage } from '@/lib/example-messages/example-message-publisher'

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'The request body is not JSON.' }, { status: 400 })
  }
  const parsed = exampleMessageSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 })
  }
  await publishExampleMessage(parsed.data)
  return Response.json({ accepted: true }, { status: 202 })
}
