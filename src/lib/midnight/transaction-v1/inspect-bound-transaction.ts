import {
  type Binding,
  type ContractAction,
  ContractCall,
  ContractDeploy,
  type Proof,
  type SignatureEnabled,
  Transaction,
  type ZswapOffer,
} from '@midnightntwrk/ledger-v9'
import { hexToBytes } from '@sig-net/midnight'

/** What bound bytes hold, or `undefined` when they are not a bound, proven transaction. */
export function inspectBoundTransaction(boundTx: string): BoundTransactionContents | undefined {
  let transaction: Transaction<SignatureEnabled, Proof, Binding>
  try {
    transaction = Transaction.deserialize<SignatureEnabled, Proof, Binding>(
      'signature',
      'proof',
      'binding',
      hexToBytes(boundTx),
    )
  } catch {
    return undefined
  }
  const intents = [...(transaction.intents?.values() ?? [])]
  const offers = [transaction.guaranteedOffer, ...(transaction.fallibleOffer?.values() ?? [])]
  return {
    actions: intents.flatMap((intent) => intent.actions.map(summaryOf)),
    shieldedInputs: countOver(offers, (offer) => offer.inputs.length),
    shieldedTransients: countOver(offers, (offer) => offer.transients.length),
    shieldedOutputs: countOver(offers, (offer) => offer.outputs.length),
    unshieldedOffers: intents.reduce(
      (count, intent) =>
        count +
        (intent.guaranteedUnshieldedOffer === undefined ? 0 : 1) +
        (intent.fallibleUnshieldedOffer === undefined ? 0 : 1),
      0,
    ),
    dustActions: intents.some((intent) => intent.dustActions !== undefined),
  }
}

/** The contract actions and the coin movement of bound bytes, summed over the guaranteed and the fallible offers. */
export interface BoundTransactionContents {
  readonly actions: BoundContractAction[]
  /** Shielded coins the bytes spend. */
  readonly shieldedInputs: number
  /** Shielded coins the bytes create and spend at once, which a circuit that takes a coin requires. */
  readonly shieldedTransients: number
  /** Shielded coins the bytes create: a contract's mint, or the change of a spend. */
  readonly shieldedOutputs: number
  /** Unshielded offers across the intents, which no vault circuit needs. */
  readonly unshieldedOffers: number
  /** Whether any intent spends or registers DUST, which the relayer's fee adds later. */
  readonly dustActions: boolean
}

/** A contract action with the address as the ledger renders it and a call's entry point as text. */
export type BoundContractAction =
  | { readonly kind: 'call'; readonly address: string; readonly entryPoint: string }
  | { readonly kind: 'deploy'; readonly address: string }
  | { readonly kind: 'maintenance-update'; readonly address: string }

function countOver(
  offers: ReadonlyArray<ZswapOffer<Proof> | undefined>,
  countOf: (offer: ZswapOffer<Proof>) => number,
): number {
  return offers.reduce((count, offer) => count + (offer === undefined ? 0 : countOf(offer)), 0)
}

function summaryOf(action: ContractAction<Proof>): BoundContractAction {
  if (action instanceof ContractCall) {
    const { entryPoint } = action
    return {
      kind: 'call',
      address: action.address,
      entryPoint:
        typeof entryPoint === 'string' ? entryPoint : new TextDecoder().decode(entryPoint),
    }
  }
  if (action instanceof ContractDeploy) {
    return { kind: 'deploy', address: action.address }
  }
  return { kind: 'maintenance-update', address: action.address }
}
