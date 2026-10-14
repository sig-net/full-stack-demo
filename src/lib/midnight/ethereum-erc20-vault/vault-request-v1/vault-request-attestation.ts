import {
  bytesToHex,
  calculateAttestedOutputHash,
  hexToBytes,
  type MpcSignature,
  OutputKind,
  type RespondBidirectionalEvent,
} from '@sig-net/midnight'

import type { RespondOutcome } from '@/lib/midnight/ethereum-erc20-vault/respond-outcome-source'
import {
  ATTESTATION_SIGNATURE_BYTES,
  type AttestationFields,
  type AttestationOutputKind,
  attestationOutputKindSchema,
  type VaultRequest,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request'

/** The row's attestation fields of a verified outcome. */
export function attestationFields(outcome: RespondOutcome): AttestationFields {
  const { event } = outcome
  return {
    attestationBlockHeight: event.blockHeight,
    attestationOutputKind: attestationOutputKind(event.outputKind),
    attestationDigest: bytesToHex(event.digest),
    attestationSignature: encodeMpcSignature(event.signature),
    attestationOutput: bytesToHex(outcome.serializedOutput),
  }
}

/** The id and the attestation fields of a row that holds an attestation, non-null. */
export interface AttestedRequestFields extends AttestationFields {
  readonly requestId: string
}

/** Throws unless the request holds its id and its five attestation fields. */
export function attestedRequestFields(request: VaultRequest): AttestedRequestFields {
  if (
    request.requestId === null ||
    request.attestationBlockHeight === null ||
    request.attestationOutputKind === null ||
    request.attestationDigest === null ||
    request.attestationSignature === null ||
    request.attestationOutput === null
  ) {
    throw new Error(`${request.name} holds no attestation`)
  }
  return {
    requestId: request.requestId,
    attestationBlockHeight: request.attestationBlockHeight,
    attestationOutputKind: request.attestationOutputKind,
    attestationDigest: request.attestationDigest,
    attestationSignature: request.attestationSignature,
    attestationOutput: request.attestationOutput,
  }
}

/** The attestation as the singleton posted it, rebuilt from a row that holds one: the output's width and hash come from the stored output. */
export function attestationToEvent(request: VaultRequest): RespondBidirectionalEvent {
  const attested = attestedRequestFields(request)
  const serializedOutput = hexToBytes(attested.attestationOutput)
  return {
    requestId: hexToBytes(attested.requestId),
    blockHeight: attested.attestationBlockHeight,
    outputKind: OutputKind[attested.attestationOutputKind],
    serializedOutputLength: BigInt(serializedOutput.length),
    outputHash: calculateAttestedOutputHash(serializedOutput),
    digest: hexToBytes(attested.attestationDigest),
    signature: decodeMpcSignature(attested.attestationSignature),
  }
}

function attestationOutputKind(kind: OutputKind): AttestationOutputKind {
  const parsed = attestationOutputKindSchema.safeParse(OutputKind[kind])
  if (!parsed.success) {
    throw new Error(`Unknown output kind ${kind.toString()}`)
  }
  return parsed.data
}

function encodeMpcSignature(signature: MpcSignature): string {
  const bytes = new Uint8Array(ATTESTATION_SIGNATURE_BYTES)
  bytes.set(signature.bigR.x, 0)
  bytes.set(signature.bigR.y, 32)
  bytes.set(signature.s, 64)
  bytes[96] = Number(signature.recoveryId)
  return bytesToHex(bytes)
}

function decodeMpcSignature(hex: string): MpcSignature {
  const bytes = hexToBytes(hex)
  const recoveryId = bytes[96]
  if (bytes.length !== ATTESTATION_SIGNATURE_BYTES || recoveryId === undefined) {
    throw new Error(`An attestation signature is 97 bytes, not ${bytes.length.toString()}`)
  }
  return {
    bigR: { x: bytes.slice(0, 32), y: bytes.slice(32, 64) },
    s: bytes.slice(64, 96),
    recoveryId: BigInt(recoveryId),
  }
}
