import { bytesToHex } from '@sig-net/midnight'
import { describe, expect, test } from 'vitest'

import {
  attestationFields,
  attestationToEvent,
  type AttestedRequestFields,
  completionOutput,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'
import {
  ATTESTATION,
  ATTESTATION_FIELDS,
  ATTESTATION_OUTPUT,
  REQUEST_ID_HEX,
  VAULT_REQUEST_IN_STATE,
  vaultRequestFixture,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-fixtures'

describe('the attestation codec', () => {
  test('the fields of a verified outcome are the row columns in hex', () => {
    expect(ATTESTATION_FIELDS).toEqual({
      attestationBlockHeight: ATTESTATION.event.blockHeight,
      attestationOutputKind: 'executed',
      attestationDigest: bytesToHex(ATTESTATION.event.digest),
      attestationSignature: expect.stringMatching(/^[0-9a-f]{194}$/),
      attestationOutput: '01',
    })
  })

  test('a row rebuilds the event the singleton posted, byte for byte', () => {
    expect(attestationToEvent(VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue)).toEqual(
      ATTESTATION.event,
    )
  })

  test('an empty output round trips as zero bytes', () => {
    const fields = attestationFields({
      event: { ...ATTESTATION.event, serializedOutputLength: 0n },
      serializedOutput: new Uint8Array(0),
    })
    expect(fields.attestationOutput).toBe('')
    const rebuilt = attestationToEvent(
      vaultRequestFixture({ ...VAULT_REQUEST_IN_STATE.AwaitingAttestationQueue, ...fields }),
    )
    expect(rebuilt.serializedOutputLength).toBe(0n)
  })

  test('a row without an attestation cannot rebuild one', () => {
    expect(() => attestationToEvent(VAULT_REQUEST_IN_STATE.AwaitingAttestation)).toThrow(
      'holds no attestation',
    )
  })
})

describe('completionOutput', () => {
  test.each<{
    name: string
    request: AttestedRequestFields
    outputWidth: number
    expected: Uint8Array
  }>([
    {
      name: 'an executed sweep hands the circuit the attested output bytes',
      request: attestedRequest('executed'),
      outputWidth: 1,
      expected: ATTESTATION_OUTPUT,
    },
    {
      name: 'a failed sweep hands a one-byte circuit the single zero byte',
      request: attestedRequest('failed'),
      outputWidth: 1,
      expected: new Uint8Array([0]),
    },
    {
      name: 'an unviable sweep hands a one-byte circuit the single zero byte',
      request: attestedRequest('unviable'),
      outputWidth: 1,
      expected: new Uint8Array([0]),
    },
    {
      name: 'a failed sweep hands a 32-byte circuit 32 zero bytes',
      request: attestedRequest('failed'),
      outputWidth: 32,
      expected: new Uint8Array(32),
    },
  ])('$name', ({ request, outputWidth, expected }) => {
    expect(completionOutput(request, outputWidth)).toEqual(expected)
  })
})

/** The fixture attestation is an executed transfer, and the other verdicts differ in kind alone. */
function attestedRequest(
  attestationOutputKind: AttestedRequestFields['attestationOutputKind'],
): AttestedRequestFields {
  return { requestId: REQUEST_ID_HEX, ...ATTESTATION_FIELDS, attestationOutputKind }
}
