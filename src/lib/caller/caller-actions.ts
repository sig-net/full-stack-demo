'use server'

import { resolveCaller } from '@/lib/caller/resolve-caller'

/** The caller name the given caller secret identifies. */
export async function getCallerName(callerSecret: string): Promise<string> {
  return resolveCaller(callerSecret).name
}
