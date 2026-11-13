import { describe, expect, test } from 'vitest'

import {
  type DepositPrerequisite,
  type DepositPrerequisites,
  missingDepositPrerequisites,
} from '@/lib/deposit-prerequisites'

const cases: { name: string; state: DepositPrerequisites; expected: DepositPrerequisite[] }[] = [
  {
    name: 'nothing set names all three, wallet first, then the login',
    state: { walletConnected: false, loggedIn: false, vaultSecretSet: false },
    expected: ['wallet', 'login', 'vaultSecret'],
  },
  {
    name: 'only the secret set asks for the wallet and its login',
    state: { walletConnected: false, loggedIn: false, vaultSecretSet: true },
    expected: ['wallet', 'login'],
  },
  {
    name: 'a connected wallet that has not signed asks for the login and the secret',
    state: { walletConnected: true, loggedIn: false, vaultSecretSet: false },
    expected: ['login', 'vaultSecret'],
  },
  {
    name: 'a signed-in wallet without the secret asks for the secret',
    state: { walletConnected: true, loggedIn: true, vaultSecretSet: false },
    expected: ['vaultSecret'],
  },
  {
    name: 'everything set leaves nothing missing',
    state: { walletConnected: true, loggedIn: true, vaultSecretSet: true },
    expected: [],
  },
]

describe('missingDepositPrerequisites', () => {
  test.each(cases)('$name', ({ state, expected }) => {
    expect(missingDepositPrerequisites(state)).toEqual(expected)
  })
})
