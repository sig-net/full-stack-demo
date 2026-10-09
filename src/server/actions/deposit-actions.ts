'use server'

import type { DepositResult } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-adaptor'
import type {
  GetDepositArgs,
  StartDepositArgs,
} from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import { getBackend } from '@/server/backend'

export async function startDeposit(
  callerSecret: string,
  args: StartDepositArgs,
): Promise<DepositResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.startDeposit(
    callerSecret,
    args,
  )
}

export async function getDeposit(
  callerSecret: string,
  args: GetDepositArgs,
): Promise<DepositResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.depositV1.adaptor.getDeposit(
    callerSecret,
    args,
  )
}
