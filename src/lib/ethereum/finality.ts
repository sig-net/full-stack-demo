import type { BlockTag } from 'ethers'

/**
 * The block every Ethereum balance, allowance and transaction outcome is read at, so nothing the
 * application acts on can be reorganised away. Prices read at the head.
 */
export const FINALIZED_BLOCK_TAG = 'finalized' satisfies BlockTag

/** What the page says beside a value read at {@link FINALIZED_BLOCK_TAG}. */
export const FINALITY_NOTE =
  'Finalised Ethereum state only: a recent transaction counts once its block is finalised, about 15 minutes on Sepolia.'
