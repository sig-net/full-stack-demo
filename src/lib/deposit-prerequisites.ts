export interface DepositPrerequisites {
  readonly walletConnected: boolean
  readonly vaultSecretSet: boolean
}

/** What a deposit still needs, in the order the Deposit button's helper text names them: empty when nothing is missing. */
export function missingDepositPrerequisites({
  walletConnected,
  vaultSecretSet,
}: DepositPrerequisites): DepositPrerequisite[] {
  const missing: DepositPrerequisite[] = []
  if (!walletConnected) missing.push('wallet')
  if (!vaultSecretSet) missing.push('vaultSecret')
  return missing
}

export const DEPOSIT_PREREQUISITES = ['wallet', 'vaultSecret'] as const

export type DepositPrerequisite = (typeof DEPOSIT_PREREQUISITES)[number]
