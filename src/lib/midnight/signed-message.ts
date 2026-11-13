import type { APIError, SignDataOptions } from '@midnight-ntwrk/dapp-connector-api'
import { type SignatureKind, verifySignature } from '@midnightntwrk/ledger-v9'
import { z } from 'zod'

/**
 * The bytes a Midnight wallet signs for the DApp connector's `signData`, as MIP-0031 (Midnight
 * Message Signing) specifies them: the prefix literal, the payload's byte length in decimal, a
 * colon and the payload. The ledger's `signData` and `verifySignature` take the whole message
 * and hash it with SHA-256 themselves, which is the digest both of the MIP's schemes bind.
 */
export function signedMessageOf(payload: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(`${SIGNED_MESSAGE_PREFIX}${payload.length}:`)
  const message = new Uint8Array(prefix.length + payload.length)
  message.set(prefix)
  message.set(payload, prefix.length)
  return message
}

export const SIGNED_MESSAGE_PREFIX = 'midnight_signed_message:'

/** The signature schemes MIP-0031 names, spelled as the connector's `Signature.scheme` spells them. */
export const SIGNATURE_SCHEMES = ['schnorr_bip340', 'ecdsa_secp256k1_sha256'] as const

export type SignatureScheme = (typeof SIGNATURE_SCHEMES)[number]

/** The ledger verifies under its own `SignatureKind` names. */
export const SIGNATURE_KIND_BY_SCHEME = {
  schnorr_bip340: 'schnorr',
  ecdsa_secp256k1_sha256: 'ecdsa',
} as const satisfies Record<SignatureScheme, SignatureKind>

/**
 * A wallet's signature over a signed message in MIP-0031's wire form, without the message
 * itself: a verifier rebuilds the message from the payload it expects, never from the
 * signature. Every value is bare lower-case hex, the signature is 64 bytes under both schemes,
 * and the verifying key is a 32-byte x-only key for Schnorr or a 33-byte compressed point for
 * ECDSA.
 */
export const messageSignatureSchema = z.discriminatedUnion('scheme', [
  z.object({
    scheme: z.literal('schnorr_bip340'),
    verifyingKey: z.string().regex(/^[0-9a-f]{64}$/, 'expected a 32-byte x-only key in hex'),
    signature: signatureHexSchema(),
  }),
  z.object({
    scheme: z.literal('ecdsa_secp256k1_sha256'),
    verifyingKey: z
      .string()
      .regex(/^0[23][0-9a-f]{64}$/, 'expected a 33-byte compressed point in hex'),
    signature: signatureHexSchema(),
  }),
])

export type MessageSignature = z.infer<typeof messageSignatureSchema>

function signatureHexSchema() {
  return z.string().regex(/^[0-9a-f]{128}$/, 'expected a 64-byte signature in hex')
}

/**
 * True when `signature` binds the signed message of `payload` under its verifying key. A key or
 * signature the ledger cannot read is false, and the ledger refuses an ECDSA signature whose
 * `s` is above half the group order, as MIP-0031 requires of a verifier.
 */
export function verifyMessageSignature(signature: MessageSignature, payload: Uint8Array): boolean {
  const tag = SIGNATURE_KIND_BY_SCHEME[signature.scheme]
  try {
    return verifySignature({ tag, value: signature.verifyingKey }, signedMessageOf(payload), {
      tag,
      value: signature.signature,
    })
  } catch {
    return false
  }
}

/**
 * The payload of a connector `signData` call, decoded as MIP-0031 requires of a wallet: the
 * declared encoding alone decides the bytes, and an input it does not accept is refused with
 * the connector's `InvalidRequest` before anything is signed. The arguments are `unknown`
 * because the connector's input is the wallet's trust boundary.
 *
 * @throws {SignDataInvalidRequest} When the options or the data are not what the encoding accepts.
 */
export function signDataPayloadOf(data: unknown, options: unknown): Uint8Array {
  const parsed = signDataInputSchema.safeParse({ data, options })
  if (!parsed.success) throw new SignDataInvalidRequest(z.prettifyError(parsed.error))
  return PAYLOAD_DECODER_BY_ENCODING[parsed.data.options.encoding](parsed.data.data)
}

const PAYLOAD_DECODER_BY_ENCODING: Record<
  SignDataOptions['encoding'],
  (text: string) => Uint8Array
> = {
  hex: (text) => {
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(text)) {
      throw new SignDataInvalidRequest('hex data must be an even number of hex digits')
    }
    return Uint8Array.from(text.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16))
  },
  base64: canonicalBase64Of,
  text: (text) => {
    if (/\p{Surrogate}/u.test(text)) {
      throw new SignDataInvalidRequest('text data must not contain an unpaired surrogate')
    }
    return new TextEncoder().encode(text)
  },
}

/** The connector's refusal of a `signData` input, shaped as its `APIError` so the page handles it as an extension's. */
export class SignDataInvalidRequest extends Error implements APIError {
  readonly name = 'SignDataInvalidRequest'
  readonly type = 'DAppConnectorAPIError'
  readonly code = 'InvalidRequest'
  readonly reason: string

  constructor(reason: string) {
    super(reason)
    this.reason = reason
  }
}

const signDataInputSchema = z.object({
  data: z.string(),
  options: z.object({
    encoding: z.enum(['hex', 'base64', 'text']),
    keyType: z.literal('unshielded'),
  }),
})

/** RFC 4648 base64 in its canonical form: padded, with zero unused trailing bits, so the decoded bytes re-encode to the input. */
function canonicalBase64Of(text: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) {
    throw new SignDataInvalidRequest('base64 data must be padded canonical base64')
  }
  const decoded = atob(text)
  if (btoa(decoded) !== text) {
    throw new SignDataInvalidRequest('base64 data must have zero trailing bits')
  }
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}
