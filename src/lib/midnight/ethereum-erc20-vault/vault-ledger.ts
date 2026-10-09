import { bytesToHex } from '@sig-net/midnight'
import {
  Action,
  type AttestationRecord,
  type VaultLedgerState,
} from '@sig-net/midnight-examples-erc20-vault-contract'

/** The vault contract's public state, read from the indexer. One read is one network round trip. */
export interface VaultLedger {
  state(): Promise<VaultLedgerState>
}

/** The vault actions this backend drives, named as the contract's `Action` enum names them. */
export const VAULT_ACTIONS = ['deposit'] as const

export type VaultAction = (typeof VAULT_ACTIONS)[number]

/**
 * Where the ledger holds a request, from queued at start to settled at complete. Every chain
 * step a resolver takes is read back from here, never inferred from its own transaction.
 */
export type RequestStage =
  | { readonly stage: 'queued' }
  | { readonly stage: 'flushed'; readonly outIndex: Uint8Array; readonly lastSeen: bigint }
  | {
      readonly stage: 'sent'
      readonly outIndex: Uint8Array
      readonly lastSeen: bigint
      readonly requestId: Uint8Array
    }
  | { readonly stage: 'attestationQueued'; readonly requestId: Uint8Array }
  | {
      readonly stage: 'attestationFlushed'
      readonly requestId: Uint8Array
      readonly record: AttestationRecord
    }
  | { readonly stage: 'settled' }

/** The maps `requestStage` reads, so a unit test builds those six and nothing else. */
export type RequestLedgerView = Pick<
  VaultLedgerState,
  | 'inputRequestBuffer'
  | 'outputRequestBuffer'
  | 'inputAttestationBuffer'
  | 'outputAttestationBuffer'
  | 'evictionMap'
  | 'depositArgsMap'
>

/**
 * The stage of the `action` request queued under `inIndex`. The request id is known to the
 * ledger only through `evictionMap`, which the send writes, so the caller passes the id it has
 * recorded and the scan finds it before that.
 */
export function requestStage(
  state: RequestLedgerView,
  action: VaultAction,
  inIndex: bigint,
  known: { readonly requestId: Uint8Array | null },
): RequestStage {
  if (state.inputRequestBuffer.member(inIndex)) return { stage: 'queued' }
  if (!ARGS_MAP_BY_ACTION[action](state).member(inIndex)) return { stage: 'settled' }
  const outIndex = flushedRequestIndex(state, action, inIndex)
  const { lastSeen } = state.outputRequestBuffer.lookup(outIndex)
  const requestId = known.requestId ?? requestIdSentFrom(state, outIndex)
  if (requestId === undefined) return { stage: 'flushed', outIndex, lastSeen }
  if (state.outputAttestationBuffer.member(requestId)) {
    return {
      stage: 'attestationFlushed',
      requestId,
      record: state.outputAttestationBuffer.lookup(requestId),
    }
  }
  if (state.inputAttestationBuffer.member(requestId))
    return { stage: 'attestationQueued', requestId }
  if (!state.evictionMap.member(requestId)) return { stage: 'flushed', outIndex, lastSeen }
  return { stage: 'sent', outIndex, lastSeen, requestId }
}

/** The args map the action's start circuit writes and its complete circuit removes. */
const ARGS_MAP_BY_ACTION: Record<
  VaultAction,
  (state: RequestLedgerView) => { member(key: bigint): boolean }
> = {
  deposit: (state) => state.depositArgsMap,
}

/**
 * The SDK's `flushedRequestIndex` over the narrowed view. Delete this copy once the SDK's
 * signature accepts the narrowed view.
 */
function flushedRequestIndex(
  state: RequestLedgerView,
  action: VaultAction,
  inIndex: bigint,
): Uint8Array {
  for (const [index, { entry }] of state.outputRequestBuffer) {
    if (entry.action === Action[action] && entry.inIndex === inIndex) return index
  }
  throw new Error(`No open ${action} request carries input index ${inIndex.toString()}`)
}

function requestIdSentFrom(state: RequestLedgerView, outIndex: Uint8Array): Uint8Array | undefined {
  const wanted = bytesToHex(outIndex)
  for (const [requestId, index] of state.evictionMap) {
    if (bytesToHex(index) === wanted) return requestId
  }
  return undefined
}
