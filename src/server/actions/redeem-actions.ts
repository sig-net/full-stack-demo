'use server'

import type { LoginCredential } from '@/lib/caller/login-credential'
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
  credential: LoginCredential,
  args: PrepareStartRedeemArgs,
): Promise<RedeemStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.prepareStartRedeem(
    credential,
    args,
  )
}

export async function startRedeem(
  credential: LoginCredential,
  args: StartRedeemArgs,
): Promise<RedeemResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.startRedeem(
    credential,
    args,
  )
}

export async function prepareCompleteRedeem(
  credential: LoginCredential,
  args: PrepareCompleteRedeemArgs,
): Promise<RedeemCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.prepareCompleteRedeem(
    credential,
    args,
  )
}

export async function completeRedeem(
  credential: LoginCredential,
  args: CompleteRedeemArgs,
): Promise<RedeemResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.completeRedeem(
    credential,
    args,
  )
}

export async function getRedeem(
  credential: LoginCredential,
  args: GetRedeemArgs,
): Promise<RedeemResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.getRedeem(
    credential,
    args,
  )
}

export async function listRedeems(
  credential: LoginCredential,
  args: ListRedeemsArgs,
): Promise<RedeemListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.redeemV1.adaptor.listRedeems(
    credential,
    args,
  )
}
