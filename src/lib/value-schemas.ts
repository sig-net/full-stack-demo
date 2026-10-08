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

/** A positive amount in base units. JSON carries it as a decimal string, so both spellings parse. */
export const amountSchema = z
  .union([
    z.bigint(),
    z
      .string()
      .regex(/^[0-9]+$/, 'expected a decimal integer')
      .transform(BigInt),
  ])
  .pipe(z.bigint().positive())
