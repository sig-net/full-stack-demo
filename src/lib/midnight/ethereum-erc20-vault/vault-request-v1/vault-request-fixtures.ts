import { bytesToHex, OutputKind, type Secp256k1Point } from '@sig-net/midnight'
import { attestRespondBidirectional, secp256k1PublicKeyOf } from '@sig-net/midnight/testing'

import { SIGNED_TX } from '@/lib/ethereum/transaction-v1/transaction-fixtures'
import type { RespondOutcome } from '@/lib/midnight/ethereum-erc20-vault/respond-outcome-source'
import type {
  AttestationFields,
  VaultRequest,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'
import { attestationFields } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-attestation'

/** A request in `AwaitingFlush`, as queued, for tests that start from a stored row. */
export function vaultRequestFixture(overrides: Partial<VaultRequest> = {}): VaultRequest {
  return {
    name: VAULT_REQUEST_NAME,
    parent: DEPOSIT_NAME,
    action: 'deposit',
    state: 'AwaitingFlush',
    inIndex: IN_INDEX,
    depositAccount: DEPOSIT_ACCOUNT,
    outIndex: null,
    requestId: null,
    signedTx: null,
    attestationBlockHeight: null,
    attestationOutputKind: null,
    attestationDigest: null,
    attestationSignature: null,
    attestationOutput: null,
    createTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

export const CALLER_NAME = `callers/${'ab'.repeat(32)}`
export const DEPOSIT_NAME = `${CALLER_NAME}/ethereum-erc20-vault-deposits/1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b`
export const VAULT_REQUEST_NAME = `${CALLER_NAME}/ethereum-erc20-vault-requests/7c1d9e2f-3a4b-4c5d-8e6f-0a1b2c3d4e5f`

export const IN_INDEX = 42n
export const DEPOSIT_ACCOUNT = `0x${'cd'.repeat(20)}`
export const OUT_INDEX: Uint8Array = new Uint8Array(32).fill(1)
export const OUT_INDEX_HEX: string = bytesToHex(OUT_INDEX)
export const REQUEST_ID: Uint8Array = new Uint8Array(32).fill(2)
export const REQUEST_ID_HEX: string = bytesToHex(REQUEST_ID)
export const LAST_SEEN = 100n
export const ATTESTATION_BLOCK_HEIGHT = 120n

/** The response key the fixture vault pinned, and the attestation its MPC posted for an executed transfer that returned true. */
export const MPC_RESPONSE_SECRET: Uint8Array = new Uint8Array(32).fill(7)
export const MPC_RESPONSE_KEY: Secp256k1Point = secp256k1PublicKeyOf(MPC_RESPONSE_SECRET)
export const ATTESTATION_OUTPUT: Uint8Array = new Uint8Array([1])
export const ATTESTATION: RespondOutcome = {
  event: attestRespondBidirectional(
    {
      requestId: REQUEST_ID,
      blockHeight: ATTESTATION_BLOCK_HEIGHT,
      outputKind: OutputKind.executed,
      serializedOutput: ATTESTATION_OUTPUT,
    },
    MPC_RESPONSE_SECRET,
  ),
  serializedOutput: ATTESTATION_OUTPUT,
}
export const ATTESTATION_FIELDS: AttestationFields = attestationFields(ATTESTATION)

/** The row each state leaves behind, consistent with the state machine's field table. */
export const VAULT_REQUEST_IN_STATE: Record<VaultRequest['state'], VaultRequest> = {
  AwaitingFlush: vaultRequestFixture(),
  AwaitingSend: vaultRequestFixture({ state: 'AwaitingSend', outIndex: OUT_INDEX_HEX }),
  AwaitingSignature: vaultRequestFixture({
    state: 'AwaitingSignature',
    outIndex: OUT_INDEX_HEX,
    requestId: REQUEST_ID_HEX,
  }),
  AwaitingBroadcast: vaultRequestFixture({
    state: 'AwaitingBroadcast',
    outIndex: OUT_INDEX_HEX,
    requestId: REQUEST_ID_HEX,
    signedTx: SIGNED_TX,
  }),
  AwaitingAttestation: vaultRequestFixture({
    state: 'AwaitingAttestation',
    outIndex: OUT_INDEX_HEX,
    requestId: REQUEST_ID_HEX,
    signedTx: SIGNED_TX,
  }),
  AwaitingAttestationQueue: vaultRequestFixture({
    state: 'AwaitingAttestationQueue',
    outIndex: OUT_INDEX_HEX,
    requestId: REQUEST_ID_HEX,
    signedTx: SIGNED_TX,
    ...ATTESTATION_FIELDS,
  }),
  AwaitingAttestationFlush: vaultRequestFixture({
    state: 'AwaitingAttestationFlush',
    outIndex: OUT_INDEX_HEX,
    requestId: REQUEST_ID_HEX,
    signedTx: SIGNED_TX,
    ...ATTESTATION_FIELDS,
  }),
  Attested: vaultRequestFixture({
    state: 'Attested',
    outIndex: OUT_INDEX_HEX,
    requestId: REQUEST_ID_HEX,
    signedTx: SIGNED_TX,
    ...ATTESTATION_FIELDS,
  }),
}
