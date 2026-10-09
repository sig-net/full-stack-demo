import 'server-only'

import { isError, type Provider, Transaction, type TransactionReceipt } from 'ethers'

import type {
  EthereumLedgerTransactionStatus,
  EthereumTransactionLedger,
  LedgerStatusArgs,
} from '@/lib/ethereum/transaction-v1/transaction-ledger'

/**
 * Reads must be fresh: a provider cache that answers the receipt read with an earlier null makes
 * a mined transaction look like a consumed nonce.
 */
export class EthereumTransactionLedgerEthersImpl implements EthereumTransactionLedger {
  private readonly provider: Provider

  constructor(provider: Provider) {
    this.provider = provider
  }

  async broadcast(signedTx: string): Promise<string> {
    const { hash } = Transaction.from(signedTx)
    if (hash === null) {
      throw new Error('The transaction bytes carry no signature')
    }
    if ((await this.provider.getTransactionReceipt(hash)) !== null) return hash
    try {
      await this.provider.broadcastTransaction(signedTx)
    } catch (error: unknown) {
      if (!isAlreadySubmitted(error)) throw error
    }
    return hash
  }

  /**
   * The count is read first, so the receipt is read only once the chain holds a transaction at
   * that nonce: present means this one, absent means another took the slot.
   */
  async status({
    txHash,
    from,
    nonce,
  }: LedgerStatusArgs): Promise<EthereumLedgerTransactionStatus> {
    if ((await this.provider.getTransactionCount(from, 'latest')) <= nonce) {
      return { outcome: 'pending' }
    }
    const receipt = await this.provider.getTransactionReceipt(txHash)
    return receipt === null ? { outcome: 'nonceConsumed' } : statusOf(receipt)
  }
}

function statusOf(receipt: TransactionReceipt): EthereumLedgerTransactionStatus {
  const blockNumber = BigInt(receipt.blockNumber)
  switch (receipt.status) {
    case 1:
      return { outcome: 'mined', blockNumber }
    case 0:
      return { outcome: 'reverted', blockNumber }
    default:
      throw new Error(`The receipt of ${receipt.hash} carries no status`)
  }
}

/**
 * The node's ways of saying it already holds these exact bytes: ethers maps "nonce too low" to
 * `NONCE_EXPIRED`, and the "already known" family arrives as the raw node message.
 */
function isAlreadySubmitted(error: unknown): boolean {
  if (isError(error, 'NONCE_EXPIRED')) return true
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return ALREADY_SUBMITTED_MESSAGES.some((known) => message.includes(known))
}

const ALREADY_SUBMITTED_MESSAGES = [
  'already known',
  'already imported',
  'alreadyknown',
  'nonce too low',
] as const
