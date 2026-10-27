import type { ProofProvider } from '@midnight-ntwrk/midnight-js/types'
import {
  type PreBinding,
  type PreProof,
  type SignatureEnabled,
  Transaction,
} from '@midnightntwrk/ledger-v9'
import { bytesToHex, hexToBytes } from '@sig-net/midnight'

/** The unbound bytes of the unproven bytes, both as hex of the ledger's own serialisation. */
export async function proveTransaction(
  proofProvider: ProofProvider,
  unprovenTx: string,
): Promise<string> {
  const unproven = Transaction.deserialize<SignatureEnabled, PreProof, PreBinding>(
    'signature',
    'pre-proof',
    'pre-binding',
    hexToBytes(unprovenTx),
  )
  const unbound = await proofProvider.proveTx(unproven)
  return bytesToHex(unbound.serialize())
}
