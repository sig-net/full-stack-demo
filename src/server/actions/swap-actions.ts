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
  callerSecret: string,
  args: QuoteSwapArgs,
): Promise<SwapQuoteResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.quoteSwap(
    callerSecret,
    args,
  )
}

export async function prepareStartSwap(
  callerSecret: string,
  args: PrepareStartSwapArgs,
): Promise<SwapStartInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.prepareStartSwap(
    callerSecret,
    args,
  )
}

export async function startSwap(callerSecret: string, args: StartSwapArgs): Promise<SwapResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.startSwap(
    callerSecret,
    args,
  )
}

export async function prepareCompleteSwap(
  callerSecret: string,
  args: PrepareCompleteSwapArgs,
): Promise<SwapCompleteInputsResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.prepareCompleteSwap(
    callerSecret,
    args,
  )
}

export async function completeSwap(
  callerSecret: string,
  args: CompleteSwapArgs,
): Promise<SwapResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.completeSwap(
    callerSecret,
    args,
  )
}

export async function getSwap(callerSecret: string, args: GetSwapArgs): Promise<SwapResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.getSwap(callerSecret, args)
}

export async function listSwaps(
  callerSecret: string,
  args: ListSwapsArgs,
): Promise<SwapListResult> {
  return (await getBackend()).midnight.ethereumErc20Vault.swapV1.adaptor.listSwaps(
    callerSecret,
    args,
  )
}
