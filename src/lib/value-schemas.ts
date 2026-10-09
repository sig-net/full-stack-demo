import { z } from 'zod'

/** Regular expression source for 32 bytes in lower-case hex. */
export const HEX_32_BYTES = '[0-9a-f]{64}'

/** Regular expression source for a lower-case UUID. */
export const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** A 20-byte EVM address, stored as `0x` plus 40 lower-case hex characters. */
export const evmAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'expected an EVM address')
  .transform((value) => value.toLowerCase())

/** Bytes in hex, any length, stored without a `0x` prefix in lower case. */
export const hexBytesSchema = z
  .string()
  .regex(/^(?:0x)?(?:[0-9a-fA-F]{2})*$/, 'expected bytes in hex')
  .transform((value) => value.replace(/^0x/i, '').toLowerCase())

export const UINT64_MAX = 2n ** 64n - 1n
export const UINT128_MAX = 2n ** 128n - 1n

/** A contract `Uint<64>`. JSON carries it as a decimal string, so both spellings parse. */
export const uint64Schema = unsignedIntegerSchema(UINT64_MAX)

/** A contract `Uint<128>`. JSON carries it as a decimal string, so both spellings parse. */
export const uint128Schema = unsignedIntegerSchema(UINT128_MAX)

/**
 * A positive amount in base units. The vault completes a deposit through a `Uint<64>` mint, so
 * the circuit refuses anything above that even though the request field is a `Uint<128>`.
 */
export const amountSchema = unsignedIntegerSchema(UINT64_MAX).pipe(z.bigint().positive())

function unsignedIntegerSchema(max: bigint) {
  return z
    .union([
      z.bigint(),
      z
        .string()
        .regex(/^[0-9]+$/, 'expected a decimal integer')
        .transform(BigInt),
    ])
    .pipe(z.bigint().nonnegative().max(max))
}
