import type { OutputKind } from '@sig-net/midnight'
import { z } from 'zod'

import { CALLER_COLLECTION } from '@/lib/caller/caller'
import { VAULT_ACTIONS } from '@/lib/midnight/ethereum-erc20-vault/vault-action'
import {
  evmAddressSchema,
  evmBytesSchema,
  HEX_32_BYTES,
  hex32BytesSchema,
  hexBytesSchema,
  uint64Schema,
  UUID,
} from '@/lib/value-schemas'

/** The collection segment of a vault request's resource name. */
export const VAULT_REQUEST_COLLECTION = 'ethereum-erc20-vault-requests'

/** `callers/{caller}/ethereum-erc20-vault-requests/{request}`, where the request is a UUID. */
export const vaultRequestNameSchema = z
  .string()
  .regex(
    new RegExp(`^${CALLER_COLLECTION}/${HEX_32_BYTES}/${VAULT_REQUEST_COLLECTION}/${UUID}$`),
    `expected callers/{caller}/${VAULT_REQUEST_COLLECTION}/{uuid}`,
  )

/** Each state names what the request waits for, so it is a to-do for exactly one actor. */
export const VAULT_REQUEST_STATES = [
  'AwaitingFlush',
  'AwaitingSend',
  'AwaitingSignature',
  'AwaitingBroadcast',
  'AwaitingAttestation',
  'AwaitingAttestationQueue',
  'AwaitingAttestationFlush',
  'Attested',
] as const

export const vaultRequestStateSchema = z.enum(VAULT_REQUEST_STATES)

export type VaultRequestState = z.infer<typeof vaultRequestStateSchema>

/** The state a request never leaves. */
export const VAULT_REQUEST_TERMINAL_STATES = [
  'Attested',
] as const satisfies readonly VaultRequestState[]

/** The MPC's verdicts, named as the singleton's `OutputKind` enum names them. */
export const ATTESTATION_OUTPUT_KINDS = [
  'executed',
  'failed',
  'unviable',
] as const satisfies readonly (keyof typeof OutputKind)[]

export const attestationOutputKindSchema = z.enum(ATTESTATION_OUTPUT_KINDS)

export type AttestationOutputKind = z.infer<typeof attestationOutputKindSchema>

export const ATTESTATION_SIGNATURE_BYTES = 97

/** The MPC's signature as `bigR.x || bigR.y || s || recoveryId`, 97 bytes in hex. */
const attestationSignatureSchema = hexBytesSchema.pipe(
  z.string().length(ATTESTATION_SIGNATURE_BYTES * 2, 'expected a 97-byte signature in hex'),
)

/**
 * The permissionless processing of one request on the ERC20 vault, from queued at the action's
 * start circuit to attested and flushed, ready for the caller's complete circuit. Every chain
 * step is read back from the vault ledger, so the row only caches where the ledger holds the
 * request and what the singleton's posts gave it. No step can fail for good: a child
 * transaction that fails is replaced until the ledger shows the step done.
 */
export const vaultRequestSchema = z.object({
  name: vaultRequestNameSchema,
  /** The name of the resource the request serves: the deposit. */
  parent: z.string().min(1),
  action: z.enum(VAULT_ACTIONS),
  state: vaultRequestStateSchema,
  /** The slot the start circuit queued the request under. */
  inIndex: uint64Schema,
  /** The EVM account the MPC signs the request's transaction from, the expected signer of its signature posts. */
  depositAccount: evmAddressSchema,
  /** The request index the flush moved the entry to, set from `AwaitingSend`. */
  outIndex: hex32BytesSchema.nullable(),
  /** The id the send recorded the request under, set from `AwaitingSignature`. */
  requestId: hex32BytesSchema.nullable(),
  /** The MPC-signed transaction as ethers serialises it, set from `AwaitingBroadcast`. */
  signedTx: evmBytesSchema.nullable(),
  /** The five attestation fields are set together from `AwaitingAttestationQueue`. */
  attestationBlockHeight: uint64Schema.nullable(),
  attestationOutputKind: attestationOutputKindSchema.nullable(),
  attestationDigest: hex32BytesSchema.nullable(),
  attestationSignature: attestationSignatureSchema.nullable(),
  /** The bytes the signature verified over, empty for a failed or unviable execution. */
  attestationOutput: hexBytesSchema.nullable(),
  createTime: z.date(),
  updateTime: z.date(),
})

export type VaultRequest = z.infer<typeof vaultRequestSchema>

export function vaultRequestName(parent: string, id: string): string {
  return `${parent}/${VAULT_REQUEST_COLLECTION}/${id}`
}

/** The row's five attestation fields, as `recordAttestation` takes them. */
export interface AttestationFields {
  readonly attestationBlockHeight: bigint
  readonly attestationOutputKind: AttestationOutputKind
  readonly attestationDigest: string
  readonly attestationSignature: string
  readonly attestationOutput: string
}
