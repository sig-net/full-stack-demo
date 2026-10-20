'use server'

import type {
  CompleteRedeemArgs,
  GetRedeemArgs,
  ListRedeemsArgs,
  PrepareCompleteRedeemArgs,
  PrepareStartRedeemArgs,
  StartRedeemArgs,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service'
import type {
  RedeemCompleteInputsResult,
  RedeemListResult,
  RedeemResult,
  RedeemStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/redeem-v1/redeem-service-adaptor'
import { getBackend } from '@/server/backend'

export async function prepareStartRedeem(
  callerSecret: string,
  args: PrepareStartRedeemArgs,
): Promise<RedeemStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.prepareStartRedeem(
    callerSecret,
    args,
  )
}

export async function startRedeem(
  callerSecret: string,
  args: StartRedeemArgs,
): Promise<RedeemResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.startRedeem(
    callerSecret,
    args,
  )
}

export async function prepareCompleteRedeem(
  callerSecret: string,
  args: PrepareCompleteRedeemArgs,
): Promise<RedeemCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.prepareCompleteRedeem(
    callerSecret,
    args,
  )
}

export async function completeRedeem(
  callerSecret: string,
  args: CompleteRedeemArgs,
): Promise<RedeemResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.completeRedeem(
    callerSecret,
    args,
  )
}

export async function getRedeem(callerSecret: string, args: GetRedeemArgs): Promise<RedeemResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.getRedeem(
    callerSecret,
    args,
  )
}

export async function listRedeems(
  callerSecret: string,
  args: ListRedeemsArgs,
): Promise<RedeemListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.listRedeems(
    callerSecret,
    args,
  )
}
