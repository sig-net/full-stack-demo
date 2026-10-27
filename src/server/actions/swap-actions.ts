'use server'

import type { LoginCredential } from '@/lib/caller/login-credential'
import type {
  CompleteSwapArgs,
  GetSwapArgs,
  ListSwapsArgs,
  PrepareCompleteSwapArgs,
  PrepareStartSwapArgs,
  QuoteSwapArgs,
  StartSwapArgs,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service'
import type {
  SwapCompleteInputsResult,
  SwapListResult,
  SwapQuoteResult,
  SwapResult,
  SwapStartInputsResult,
} from '@/lib/midnight/ethereum-erc20-vault/swap-v1/swap-service-adaptor'
import { getBackend } from '@/server/backend'

export async function quoteSwap(
  credential: LoginCredential,
  args: QuoteSwapArgs,
): Promise<SwapQuoteResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.quoteSwap(credential, args)
}

export async function prepareStartSwap(
  credential: LoginCredential,
  args: PrepareStartSwapArgs,
): Promise<SwapStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.prepareStartSwap(
    credential,
    args,
  )
}

export async function startSwap(
  credential: LoginCredential,
  args: StartSwapArgs,
): Promise<SwapResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.startSwap(credential, args)
}

export async function prepareCompleteSwap(
  credential: LoginCredential,
  args: PrepareCompleteSwapArgs,
): Promise<SwapCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.prepareCompleteSwap(
    credential,
    args,
  )
}

export async function completeSwap(
  credential: LoginCredential,
  args: CompleteSwapArgs,
): Promise<SwapResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.completeSwap(
    credential,
    args,
  )
}

export async function getSwap(credential: LoginCredential, args: GetSwapArgs): Promise<SwapResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.getSwap(credential, args)
}

export async function listSwaps(
  credential: LoginCredential,
  args: ListSwapsArgs,
): Promise<SwapListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.listSwaps(credential, args)
}
