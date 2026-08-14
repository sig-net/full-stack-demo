// The vault contract package's non-compiled exports, replicated in the app (the
// @midnight-examples/erc20-vault-contract workspace package is TS-only + Node-oriented,
// so we vendor the compiled contract/index.js and re-declare these tiny pieces here).
import {
  Contract,
  pureCircuits,
  ledger,
  type Witnesses,
} from './managed/erc20-vault/contract/index.js';

/** Private state carried through vault circuit calls: the caller's identity secret. */
export interface VaultPrivateState {
  readonly secretKey: Uint8Array;
}

/** Build the vault's private state from the 32-byte identity secret. */
export const createVaultPrivateState = (
  secretKey: Uint8Array,
): VaultPrivateState => ({ secretKey });

/** callerSecretKey feeds the contract's identity commitment from private state. */
export const witnesses: Witnesses<VaultPrivateState> = {
  callerSecretKey: ({ privateState }: any): [VaultPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
};

// The Aave vault chunks its ledger past 15 fields, so every event map sits at a depth-2 tree
// path. These are the read-paths the reader locates requests by, matching the Vector<4> the
// circuits pass in constructSignBidirectionalEventNotificationV1.

/** signBidirectionalEventMap: deposit / withdraw / transfer / approveRouter / approveStata. */
export const VAULT_REQUESTS_PATH: readonly number[] = [0, 0];

/** swapEventMap: the swap flow reads MPC responses from here. */
export const VAULT_SWAP_REQUESTS_PATH: readonly number[] = [1, 7];

/** supplyEventMap: the supply (Aave lend) flow. */
export const VAULT_SUPPLY_REQUESTS_PATH: readonly number[] = [1, 11];

/** redeemEventMap: the redeem (Aave withdraw) flow. */
export const VAULT_REDEEM_REQUESTS_PATH: readonly number[] = [1, 13];

export { Contract, pureCircuits, ledger };
