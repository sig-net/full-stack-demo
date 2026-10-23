import { SigningKey } from 'ethers'
import { describe, expect, test } from 'vitest'

import { depositAccountOf } from '@/lib/midnight/ethereum-erc20-vault/deposit-account'
import { userCommitmentOf } from '@/lib/midnight/ethereum-erc20-vault/vault-secret'

const VAULT_SECRET = '11'.repeat(32)
/** A throwaway MPC root key: the derivation needs a point on the curve, not the stack's key. */
const SIGNET = {
  contractAddress: '22'.repeat(32),
  mpcRootPublicKey: SigningKey.computePublicKey(`0x${'33'.repeat(32)}`, false),
}
const VAULT = { contractAddress: '44'.repeat(32) }

describe('depositAccountOf', () => {
  test('derives a lower-case EVM address over the commitment', () => {
    const account = depositAccountOf(userCommitmentOf(VAULT_SECRET), SIGNET, VAULT)
    expect(account).toMatch(/^0x[0-9a-f]{40}$/)
    expect(depositAccountOf(userCommitmentOf(VAULT_SECRET), SIGNET, VAULT)).toBe(account)
  })

  test('a different secret commits differently and derives a different account', () => {
    expect(userCommitmentOf('55'.repeat(32))).not.toBe(userCommitmentOf(VAULT_SECRET))
    expect(depositAccountOf(userCommitmentOf('55'.repeat(32)), SIGNET, VAULT)).not.toBe(
      depositAccountOf(userCommitmentOf(VAULT_SECRET), SIGNET, VAULT),
    )
  })
})
