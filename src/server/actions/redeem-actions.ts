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
  callerAddress: string,
  args: PrepareStartRedeemArgs,
): Promise<RedeemStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.prepareStartRedeem(
    callerAddress,
    args,
  )
}

export async function startRedeem(
  callerAddress: string,
  args: StartRedeemArgs,
): Promise<RedeemResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.startRedeem(
    callerAddress,
    args,
  )
}

export async function prepareCompleteRedeem(
  callerAddress: string,
  args: PrepareCompleteRedeemArgs,
): Promise<RedeemCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.prepareCompleteRedeem(
    callerAddress,
    args,
  )
}

export async function completeRedeem(
  callerAddress: string,
  args: CompleteRedeemArgs,
): Promise<RedeemResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.completeRedeem(
    callerAddress,
    args,
  )
}

export async function getRedeem(callerAddress: string, args: GetRedeemArgs): Promise<RedeemResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.getRedeem(
    callerAddress,
    args,
  )
}

export async function listRedeems(
  callerAddress: string,
  args: ListRedeemsArgs,
): Promise<RedeemListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.listRedeems(
    callerAddress,
    args,
  )
}
