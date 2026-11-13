import { describe, expect, test } from 'vitest'

import {
  VAULT_REQUEST_STATES,
  VAULT_REQUEST_TERMINAL_STATES,
  type VaultRequest,
  type VaultRequestState,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import {
  OUT_INDEX_HEX,
  VAULT_REQUEST_IN_STATE,
  vaultRequestFixture,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'
import {
  assertConsistent,
  INITIAL_STATE,
  nextState,
  type VaultRequestStateAction,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-machine'

const ACTIONS: readonly VaultRequestStateAction[] = [
  'recordFlushed',
  'recordSent',
  'recordSignature',
  'recordBroadcast',
  'recordAttestation',
  'recordAttestationQueued',
  'recordAttested',
]

/** Every allowed transition. Any pair not listed here must be refused. */
const ALLOWED: ReadonlyArray<[VaultRequestState, VaultRequestStateAction, VaultRequestState]> = [
  ['AwaitingFlush', 'recordFlushed', 'AwaitingSend'],
  ['AwaitingSend', 'recordSent', 'AwaitingSignature'],
  ['AwaitingSignature', 'recordSignature', 'AwaitingBroadcast'],
  ['AwaitingBroadcast', 'recordBroadcast', 'AwaitingAttestation'],
  ['AwaitingAttestation', 'recordAttestation', 'AwaitingAttestationQueue'],
  ['AwaitingAttestationQueue', 'recordAttestationQueued', 'AwaitingAttestationFlush'],
  ['AwaitingAttestationFlush', 'recordAttested', 'Attested'],
]

describe('nextState', () => {
  const pairs = VAULT_REQUEST_STATES.flatMap((state) =>
    ACTIONS.map((action): [VaultRequestState, VaultRequestStateAction] => [state, action]),
  )
  expect(pairs.length).toBeGreaterThan(0)

  test.each(pairs)('%s + %s', (state, action) => {
    const allowed = ALLOWED.find(([from, by]) => from === state && by === action)
    expect(nextState(state, action)).toBe(allowed?.[2])
  })

  test('each action is legal from exactly one state', () => {
    for (const action of ACTIONS) {
      expect(ALLOWED.filter(([, by]) => by === action)).toHaveLength(1)
    }
  })

  test('terminal states allow nothing', () => {
    for (const state of VAULT_REQUEST_TERMINAL_STATES) {
      for (const action of ACTIONS) expect(nextState(state, action)).toBeUndefined()
    }
  })

  test('a request is queued waiting for a flush', () => {
    expect(INITIAL_STATE).toBe('AwaitingFlush')
  })
})

describe('assertConsistent', () => {
  test.each(VAULT_REQUEST_STATES)('%s holds what its state requires', (state) => {
    expect(() => assertConsistent(VAULT_REQUEST_IN_STATE[state])).not.toThrow()
  })

  const violations: ReadonlyArray<[string, Partial<VaultRequest>, string]> = [
    ['AwaitingFlush with a request index', { outIndex: OUT_INDEX_HEX }, 'must have outIndex unset'],
    [
      'AwaitingSend without the request index',
      { ...VAULT_REQUEST_IN_STATE.AwaitingSend, outIndex: null },
      'must have outIndex set',
    ],
    [
      'AwaitingSignature without the request id',
      { ...VAULT_REQUEST_IN_STATE.AwaitingSignature, requestId: null },
      'must have requestId set',
    ],
    [
      'AwaitingBroadcast without the signed transaction',
      { ...VAULT_REQUEST_IN_STATE.AwaitingBroadcast, signedTx: null },
      'must have signedTx set',
    ],
    [
      'AwaitingAttestation holding an attestation',
      {
        ...VAULT_REQUEST_IN_STATE.AwaitingAttestation,
        attestationDigest: VAULT_REQUEST_IN_STATE.Attested.attestationDigest,
      },
      'must have attestationDigest unset',
    ],
    [
      'AwaitingAttestationQueue without the attestation signature',
      { ...VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue, attestationSignature: null },
      'must have attestationSignature set',
    ],
    [
      'Attested without the attestation output',
      { ...VAULT_REQUEST_IN_STATE.Attested, attestationOutput: null },
      'must have attestationOutput set',
    ],
  ]

  test.each(violations)('%s is refused', (_name, overrides, message) => {
    expect(() => assertConsistent(vaultRequestFixture(overrides))).toThrow(message)
  })

  test('the empty output is a held attestation output', () => {
    expect(() =>
      assertConsistent({ ...VAULT_REQUEST_IN_STATE.Attested, attestationOutput: '' }),
    ).not.toThrow()
  })
})
