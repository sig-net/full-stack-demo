import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { signData, type SignatureKind } from '@midnightntwrk/ledger-v9'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'

import {
  messageSignatureSchema,
  SIGNATURE_KIND_BY_SCHEME,
  SIGNATURE_SCHEMES,
  type SignatureScheme,
  SignDataInvalidRequest,
  signDataPayloadOf,
  signedMessageOf,
  verifyMessageSignature,
} from '@/lib/midnight/signed-message'

/**
 * MIP-0031's own vectors, verbatim in `mip-0031-vectors.json`. Every valid vector pins the
 * producer's payload, length, message and digest and must verify, every payload vector must be
 * refused with the connector's `InvalidRequest`, and every verification vector a verifier that
 * never receives the connector's `data` can reach must be rejected. The vectors failing at the
 * MIP's steps 3 to 6 parse `data`, which the application does not transport, and are not run.
 */
const validVectorSchema = z.object({
  name: z.string(),
  valid: z.literal(true),
  input: z.object({ encoding: z.string(), data: z.string() }),
  key: z.string(),
  scheme: z.enum(SIGNATURE_SCHEMES),
  payloadHex: z.string(),
  payloadLength: z.number(),
  messageHex: z.string(),
  messageDigestHex: z.string(),
  signature: z.object({ scheme: z.string(), signature: z.string(), verifyingKey: z.string() }),
})

const invalidVectorSchema = z.object({
  name: z.string(),
  valid: z.literal(false),
  kind: z.enum(['payload', 'verification']),
  input: z
    .object({
      encoding: z.unknown().optional(),
      data: z.unknown().optional(),
      keyType: z.unknown().optional(),
    })
    .optional(),
  payloadHex: z.string().optional(),
  signature: z.unknown().optional(),
  expectedFailureStep: z.number().optional(),
})

type ValidVector = z.infer<typeof validVectorSchema>
type InvalidVector = z.infer<typeof invalidVectorSchema>

const vectors = z
  .object({
    schemaVersion: z.literal(1),
    keys: z.record(
      z.string(),
      z.object({ schnorrSigningKeyHex: z.string(), ecdsaSigningKeyHex: z.string() }),
    ),
    vectors: z.array(z.discriminatedUnion('valid', [validVectorSchema, invalidVectorSchema])),
  })
  .parse(JSON.parse(readFileSync(new URL('./mip-0031-vectors.json', import.meta.url), 'utf8')))

const valid = vectors.vectors.filter((vector): vector is ValidVector => vector.valid)
const invalid = vectors.vectors.filter((vector): vector is InvalidVector => !vector.valid)
const payload = invalid.filter((vector) => vector.kind === 'payload')
const verification = invalid.filter((vector) => vector.kind === 'verification')

/** The step 2 vectors whose only defect is in `data`: without it the signature is genuine. */
const DATA_ONLY_DEFECTS = new Set([
  'reject-uppercase-wire-hex',
  'reject-odd-length-data',
  'reject-data-absent',
])

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16))

/** A verification vector's `Signature` without `data`, the shape the application transports. */
function withoutData(signature: unknown): unknown {
  if (typeof signature !== 'object' || signature === null || Array.isArray(signature)) {
    return signature
  }
  return Object.fromEntries(Object.entries(signature).filter(([key]) => key !== 'data'))
}

describe('MIP-0031 vectors', () => {
  test('the vector classes are all non-empty', () => {
    expect(valid.length).toBeGreaterThan(0)
    expect(payload.length).toBeGreaterThan(0)
    expect(verification.length).toBeGreaterThan(0)
  })

  test.each(valid)('$name reproduces the payload, message and digest and verifies', (vector) => {
    const bytes = signDataPayloadOf(vector.input.data, {
      encoding: vector.input.encoding,
      keyType: 'unshielded',
    })
    expect(toHex(bytes)).toBe(vector.payloadHex)
    expect(bytes.length).toBe(vector.payloadLength)
    const message = signedMessageOf(bytes)
    expect(toHex(message)).toBe(vector.messageHex)
    expect(createHash('sha256').update(message).digest('hex')).toBe(vector.messageDigestHex)
    const signature = messageSignatureSchema.parse(vector.signature)
    expect(verifyMessageSignature(signature, bytes)).toBe(true)
    expect(verifyMessageSignature(signature, fromHex(`${vector.payloadHex}00`))).toBe(false)
  })

  test.each(valid)('$name is signed by the ledger as the vector is', (vector) => {
    const tag = SIGNATURE_KIND_BY_SCHEME[vector.scheme]
    const key = vectors.keys[vector.key]
    if (key === undefined) throw new Error(`the vectors name no key ${vector.key}`)
    const signingKey = { tag, value: key[`${tag}SigningKeyHex`] }
    const own = signData(signingKey, fromHex(vector.messageHex))
    const signature = messageSignatureSchema.parse({ ...vector.signature, signature: own.value })
    expect(verifyMessageSignature(signature, fromHex(vector.payloadHex))).toBe(true)
    // ECDSA nonces are RFC 6979, so the ledger's signature is the vector's byte for byte.
    if (tag === 'ecdsa') expect(own.value).toBe(vector.signature.signature)
  })

  test.each(payload)('$name is refused with InvalidRequest', (vector) => {
    const input = vector.input ?? {}
    let refusal: unknown
    try {
      signDataPayloadOf(input.data, {
        encoding: input.encoding,
        keyType: input.keyType ?? 'unshielded',
      })
    } catch (error: unknown) {
      refusal = error
    }
    expect(refusal).toBeInstanceOf(SignDataInvalidRequest)
    expect(refusal).toMatchObject({ type: 'DAppConnectorAPIError', code: 'InvalidRequest' })
  })

  test.each(
    verification.filter(
      (vector) =>
        (vector.expectedFailureStep === 1 || vector.expectedFailureStep === 2) &&
        !DATA_ONLY_DEFECTS.has(vector.name),
    ),
  )('$name is refused by the wire form', (vector) => {
    expect(messageSignatureSchema.safeParse(withoutData(vector.signature)).success).toBe(false)
  })

  test.each(verification.filter((vector) => DATA_ONLY_DEFECTS.has(vector.name)))(
    '$name is genuine without its data, so only a verifier that reads data rejects it',
    (vector) => {
      const signature = messageSignatureSchema.parse(withoutData(vector.signature))
      expect(verifyMessageSignature(signature, fromHex(vector.payloadHex ?? ''))).toBe(true)
    },
  )

  test.each(
    verification.filter(
      (vector) => vector.expectedFailureStep === 7 || vector.expectedFailureStep === 9,
    ),
  )('$name does not verify', (vector) => {
    const signature = messageSignatureSchema.parse(withoutData(vector.signature))
    expect(verifyMessageSignature(signature, fromHex(vector.payloadHex ?? ''))).toBe(false)
  })
})

describe('signature schemes', () => {
  test('every ledger signature kind verifies one MIP-0031 scheme', () => {
    expectTypeOf<SignatureKind>().toEqualTypeOf<
      (typeof SIGNATURE_KIND_BY_SCHEME)[SignatureScheme]
    >()
  })

  test('a key or signature the ledger cannot read is false, not a throw', () => {
    expect(
      verifyMessageSignature(
        {
          scheme: 'ecdsa_secp256k1_sha256',
          verifyingKey: `02${'00'.repeat(32)}`,
          signature: '00'.repeat(64),
        },
        new Uint8Array(),
      ),
    ).toBe(false)
  })
})
