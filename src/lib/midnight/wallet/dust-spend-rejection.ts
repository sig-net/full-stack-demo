/**
 * Appends what the node's error 170 means to a message that carries it: the node could not
 * verify the DUST spend proof against its own DUST state. A wallet synced moments before the
 * build that still gets it has a DUST state the chain disagrees with, which on the local stack
 * only a reset and redeploy of the Midnight stack has been seen to clear.
 */
export function explainDustSpendRejection(message: string): string {
  if (!message.includes(DUST_SPEND_REJECTION)) return message
  return `${message}. The node could not verify the DUST spend proof against its own DUST state. When a freshly synced wallet still gets this, the local Midnight stack needs a reset and redeploy.`
}

/** The node reports `InvalidDustSpendProof` as this custom error code. */
const DUST_SPEND_REJECTION = 'Custom error: 170'
