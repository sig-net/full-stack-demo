import { MidnightBech32m, UnshieldedAddress } from '@midnightntwrk/wallet-sdk-address-format'
import { MidnightNetwork } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import {
  CALLER_ADDRESS,
  CALLER_ID,
  CALLER_NAME,
  FIXTURE_NETWORK_ID,
} from '@/lib/caller/caller-fixtures'
import { resolveCaller } from '@/lib/caller/resolve-caller'

const UNDEPLOYED_ADDRESS = MidnightBech32m.encode(
  MidnightNetwork.Undeployed,
  new UnshieldedAddress(Buffer.from(CALLER_ID, 'hex')),
).toString()

describe('resolveCaller', () => {
  test('names the caller after the user address the unshielded address encodes', () => {
    expect(resolveCaller(CALLER_ADDRESS, FIXTURE_NETWORK_ID)).toEqual({
      unshieldedAddress: CALLER_ADDRESS,
      name: CALLER_NAME,
    })
  })

  test.each<{ name: string; callerAddress: unknown; error: string }>([
    {
      name: 'a value that is not a string',
      callerAddress: 42,
      error: 'unshielded Midnight address',
    },
    { name: 'a hex secret', callerAddress: CALLER_ID, error: 'unshielded Midnight address' },
    {
      name: 'a shielded address',
      callerAddress: 'mn_shield-addr_stagenet1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
      error: 'unshielded Midnight address',
    },
    {
      name: 'an unshielded address of another network',
      callerAddress: UNDEPLOYED_ADDRESS,
      error: `unshielded address of ${FIXTURE_NETWORK_ID}`,
    },
    {
      name: 'an unshielded address with a broken checksum',
      callerAddress: `${CALLER_ADDRESS.slice(0, -1)}${CALLER_ADDRESS.endsWith('q') ? 'p' : 'q'}`,
      error: `unshielded address of ${FIXTURE_NETWORK_ID}`,
    },
  ])('refuses $name', ({ callerAddress, error }) => {
    expect(() => resolveCaller(callerAddress, FIXTURE_NETWORK_ID)).toThrow(error)
  })
})
