import type { FlowKind } from "./flow";

/** Shared ERC-20 transfer ceiling in gas units, used by signing envelopes and funding reservations. */
export const ERC20_TRANSFER_GAS_LIMIT = 100_000n;
/** Shared ERC-20 transfer ceiling in maximum wei per gas, used by signing envelopes and funding reservations. */
export const ERC20_TRANSFER_MAX_FEE_PER_GAS = 30_000_000_000n;
/** Shared ERC-20 transfer ceiling in priority wei per gas, used by signing envelopes. */
export const ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS = 1_000_000_000n;
/** Shared swap ceiling in gas units, used by signing envelopes and funding reservations. */
export const SWAP_GAS_LIMIT = 700_000n;
/** Shared swap ceiling in maximum wei per gas, used by signing envelopes and funding reservations. */
export const SWAP_MAX_FEE_PER_GAS = 30_000_000_000n;
/** Shared swap ceiling in priority wei per gas, used by signing envelopes. */
export const SWAP_MAX_PRIORITY_FEE_PER_GAS = 1_000_000_000n;
/** Shared wrapper supply or redemption ceiling in gas units, used by signing envelopes and funding reservations. */
export const STATA_GAS_LIMIT = 500_000n;
/** Shared wrapper supply or redemption ceiling in maximum wei per gas, used by signing envelopes and funding reservations. */
export const STATA_MAX_FEE_PER_GAS = 30_000_000_000n;
/** Shared wrapper supply or redemption ceiling in priority wei per gas, used by signing envelopes. */
export const STATA_MAX_PRIORITY_FEE_PER_GAS = 1_000_000_000n;

const ERC20_TRANSFER_ENVELOPE_WEI = ERC20_TRANSFER_GAS_LIMIT * ERC20_TRANSFER_MAX_FEE_PER_GAS;
const SWAP_ENVELOPE_WEI = SWAP_GAS_LIMIT * SWAP_MAX_FEE_PER_GAS;
const STATA_ENVELOPE_WEI = STATA_GAS_LIMIT * STATA_MAX_FEE_PER_GAS;

/**
 * Native balance each operation's paying account must hold before its envelope can broadcast, in wei.
 *
 * An EIP-1559 sender must hold `gasLimit * maxFeePerGas + value` for its transaction to be
 * accepted, and every envelope above carries a fixed cap and a zero value, so these are exact
 * protocol requirements rather than fee-market estimates. The deposit sweep is paid by the
 * identity's deposit address and every other operation by the EVM vault address. The swap and
 * supply figures include one further ERC-20 transfer envelope for the one-time router or wrapper
 * approval that is broadcast from the same account immediately before the operation itself.
 */
export const MPC_OPERATION_ETH_RESERVE = Object.freeze({
  deposit: ERC20_TRANSFER_ENVELOPE_WEI,
  withdraw: ERC20_TRANSFER_ENVELOPE_WEI,
  swap: SWAP_ENVELOPE_WEI + ERC20_TRANSFER_ENVELOPE_WEI,
  supply: STATA_ENVELOPE_WEI + ERC20_TRANSFER_ENVELOPE_WEI,
  redeem: STATA_ENVELOPE_WEI,
}) satisfies Record<FlowKind, bigint>;

/** Vault-address operations, excluding the deposit sweep the deposit address pays for. */
export const VAULT_EVM_OPERATIONS = ["withdraw", "swap", "supply", "redeem"] as const;

/** Largest single vault-address requirement, reported by the vault ETH health indicator, in wei. */
export const VAULT_EVM_ETH_RESERVE = VAULT_EVM_OPERATIONS.reduce(
  (largest, operation) =>
    MPC_OPERATION_ETH_RESERVE[operation] > largest ? MPC_OPERATION_ETH_RESERVE[operation] : largest,
  0n,
);
