import { describe, expect, test } from 'vitest'

import {
  type DepositPrerequisite,
  type DepositPrerequisites,
  missingDepositPrerequisites,
} from '@/lib/deposit-prerequisites'

const cases: { name: string; state: DepositPrerequisites; expected: DepositPrerequisite[] }[] = [
  {
    name: 'neither set names both, wallet first',
    state: { walletConnected: false, vaultSecretSet: false },
    expected: ['wallet', 'vaultSecret'],
  },
  {
    name: 'only the secret set asks for the wallet',
    state: { walletConnected: false, vaultSecretSet: true },
    expected: ['wallet'],
  },
  {
    name: 'only the wallet connected asks for the secret',
    state: { walletConnected: true, vaultSecretSet: false },
    expected: ['vaultSecret'],
  },
  {
    name: 'both set leaves nothing missing',
    state: { walletConnected: true, vaultSecretSet: true },
    expected: [],
  },
]

describe('missingDepositPrerequisites', () => {
  test.each(cases)('$name', ({ state, expected }) => {
    expect(missingDepositPrerequisites(state)).toEqual(expected)
  })
})
