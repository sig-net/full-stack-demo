export interface DepositPrerequisites {
  readonly walletConnected: boolean
  readonly identitySecretSet: boolean
}

/** What a deposit still needs, in the order the Deposit button's helper text names them: empty when nothing is missing. */
export function missingDepositPrerequisites({
  walletConnected,
  identitySecretSet,
}: DepositPrerequisites): DepositPrerequisite[] {
  const missing: DepositPrerequisite[] = []
  if (!walletConnected) missing.push('wallet')
  if (!identitySecretSet) missing.push('identitySecret')
  return missing
}

export const DEPOSIT_PREREQUISITES = ['wallet', 'identitySecret'] as const

export type DepositPrerequisite = (typeof DEPOSIT_PREREQUISITES)[number]
