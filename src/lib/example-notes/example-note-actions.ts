'use server'

import { z } from 'zod'

import { getDatabase } from '@/lib/db/database'
import { exampleNotes } from '@/lib/db/schema'

const textSchema = z.string().trim().min(1).max(500)

export type SaveExampleNoteResult =
  | { readonly saved: true; readonly id: number }
  | { readonly saved: false; readonly error: string }

/** A server action: the browser calls it like a function and Next.js runs it on the server. */
export async function saveExampleNote(text: string): Promise<SaveExampleNoteResult> {
  // The argument arrives from the browser, so its static type is not a guarantee.
  const parsed = textSchema.safeParse(text)
  if (!parsed.success) {
    return { saved: false, error: z.prettifyError(parsed.error) }
  }
  const database = await getDatabase()
  const [note] = await database
    .insert(exampleNotes)
    .values({ text: parsed.data })
    .returning({ id: exampleNotes.id })
  if (note === undefined) {
    throw new Error('The insert returned no row')
  }
  return { saved: true, id: note.id }
}
