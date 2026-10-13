import { hexToBytes } from '@sig-net/midnight'
import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'

const SECRET_HEX = '11'.repeat(32)
/** A throwaway MPC root key: the derivation needs a point on the curve, not the stack's key. */
const SIGNET = {
  contractAddress: '22'.repeat(32),
  mpcRootPublicKey: SigningKey.computePublicKey(`0x${'33'.repeat(32)}`, false),
}
const VAULT = { contractAddress: '44'.repeat(32) }

describe('depositAccountOf', () => {
  test('the browser hex decoding and the server buffer decoding derive the same account', () => {
    const fromBrowser = depositAccountOf({ secretKey: hexToBytes(SECRET_HEX) }, SIGNET, VAULT)
    const fromServer = depositAccountOf(
      { secretKey: Uint8Array.from(Buffer.from(SECRET_HEX, 'hex')) },
      SIGNET,
      VAULT,
    )
    expect(fromBrowser).toBe(fromServer)
    expect(fromBrowser).toMatch(/^0x[0-9a-f]{40}$/)
  })

  test('a different secret derives a different account', () => {
    expect(depositAccountOf({ secretKey: hexToBytes('55'.repeat(32)) }, SIGNET, VAULT)).not.toBe(
      depositAccountOf({ secretKey: hexToBytes(SECRET_HEX) }, SIGNET, VAULT),
    )
  })
})
