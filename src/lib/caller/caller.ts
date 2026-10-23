import { z } from 'zod'

import { HEX_32_BYTES } from '@/lib/value-schemas'

/**
 * The caller of a service method, resolved on the server from the unshielded Midnight address
 * the browser sends as every action's first argument. The address is the wallet's, so a wallet
 * challenge can later prove the caller holds its key and the caller's resources stay named as
 * they are.
 */
export interface Caller {
  /** The caller's unshielded address in Bech32m, as the wallet reports it. */
  readonly unshieldedAddress: string
  /**
   * `callers/{caller}`, the parent of every resource the caller owns. The caller id is the
   * 32-byte user address the unshielded address encodes, in hex, so it names the wallet's
   * unshielded key on every network.
   */
  readonly name: string
}

export const CALLER_COLLECTION = 'callers'

/** `callers/{caller}`, where the caller is the 32-byte user address of the caller's unshielded key in hex. */
export const callerNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}$`),
    'expected callers/{64 hex characters}',
  )

export function callerName(callerId: string): string {
  return `${CALLER_COLLECTION}/${callerId}`
}

/** True when the resource is the caller itself or lives under it. */
export function resourceOwnedByCaller(resourceName: string, caller: Caller): boolean {
  return resourceName === caller.name || resourceName.startsWith(`${caller.name}/`)
}

/** `callers/{caller}`, the first two segments of any resource name under a caller. */
export function callerOf(resourceName: string): string {
  return resourceName.split('/').slice(0, 2).join('/')
}
