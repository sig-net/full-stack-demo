'use server'

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
  callerAddress: string,
  args: QuoteSwapArgs,
): Promise<SwapQuoteResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.quoteSwap(
    callerAddress,
    args,
  )
}

export async function prepareStartSwap(
  callerAddress: string,
  args: PrepareStartSwapArgs,
): Promise<SwapStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.prepareStartSwap(
    callerAddress,
    args,
  )
}

export async function startSwap(callerAddress: string, args: StartSwapArgs): Promise<SwapResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.startSwap(
    callerAddress,
    args,
  )
}

export async function prepareCompleteSwap(
  callerAddress: string,
  args: PrepareCompleteSwapArgs,
): Promise<SwapCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.prepareCompleteSwap(
    callerAddress,
    args,
  )
}

export async function completeSwap(
  callerAddress: string,
  args: CompleteSwapArgs,
): Promise<SwapResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.completeSwap(
    callerAddress,
    args,
  )
}

export async function getSwap(callerAddress: string, args: GetSwapArgs): Promise<SwapResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.getSwap(
    callerAddress,
    args,
  )
}

export async function listSwaps(
  callerAddress: string,
  args: ListSwapsArgs,
): Promise<SwapListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.listSwaps(
    callerAddress,
    args,
  )
}
