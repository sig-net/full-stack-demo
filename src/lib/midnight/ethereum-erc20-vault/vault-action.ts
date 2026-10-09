/** The vault actions this backend drives, named as the contract's `Action` enum names them. */
export const VAULT_ACTIONS = ['deposit'] as const

export type VaultAction = (typeof VAULT_ACTIONS)[number]
