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
    spendsCoins:
      offers.some(spendsShieldedCoins) ||
      intents.some(
        (intent) =>
          intent.guaranteedUnshieldedOffer !== undefined ||
          intent.fallibleUnshieldedOffer !== undefined ||
          intent.dustActions !== undefined,
      ),
  }
}

export interface BoundTransactionContents {
  readonly actions: BoundContractAction[]
  /** True when the bytes spend shielded coins, carry an unshielded offer or act on DUST, none of which a contract call alone needs. */
  readonly spendsCoins: boolean
}

/** A contract action with the address as the ledger renders it and a call's entry point as text. */
export type BoundContractAction =
  | { readonly kind: 'call'; readonly address: string; readonly entryPoint: string }
  | { readonly kind: 'deploy'; readonly address: string }
  | { readonly kind: 'maintenance-update'; readonly address: string }

/** Outputs alone are what a contract mints, and an input or a transient spends a coin. */
function spendsShieldedCoins(offer: ZswapOffer<Proof> | undefined): boolean {
  return offer !== undefined && (offer.inputs.length > 0 || offer.transients.length > 0)
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
