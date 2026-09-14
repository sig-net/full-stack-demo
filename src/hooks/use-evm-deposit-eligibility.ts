"use client";

import { useQuery } from "@tanstack/react-query";
import { encodeFunctionData, erc20Abi, getAddress } from "viem";

import { parseTokenAmount } from "@/lib/utils/token-amount";
import { useEvmBalances } from "@/providers/evm-balances-context";
import { useEvmWallet } from "@/providers/evm-wallet-context";

/**
 * Estimates fees only for valid captured transfer inputs.
 *
 * @param token - Token contract whose observed precision controls amount parsing.
 * @param amount - Exact decimal input string.
 * @param destination - Captured deposit address, absent before vault binding.
 * @returns Transfer readiness or an actionable amount or fee error.
 */
export function useEvmDepositEligibility(
  token: string,
  amount: string,
  destination: string | undefined,
): { ready: boolean; error: string | undefined } {
  const { wallet } = useEvmWallet();
  const balances = useEvmBalances();
  const observed = balances.data?.tokens.find(
    (value) => value.erc20Address.toLowerCase() === token.toLowerCase(),
  );
  let units: bigint | undefined;
  let error: string | undefined;
  try {
    if (!balances.isSuccess || !observed)
      throw new Error("Token balance and decimals are unavailable.");
    if (!Number.isInteger(observed.decimals) || observed.decimals < 0)
      throw new Error("Token decimals are unavailable.");
    units = parseTokenAmount(amount, observed.decimals);
    if (units > observed.units) throw new Error("Insufficient token balance.");
  } catch (failure) {
    error = failure instanceof Error ? failure.message : "Amount is unavailable.";
  }
  const fee = useQuery({
    queryKey: [
      "evm-deposit-fee",
      wallet?.sessionId,
      wallet?.chain.id,
      wallet?.account,
      token,
      destination,
      units?.toString(),
    ],
    enabled: !!wallet && !!destination && units !== undefined && !error,
    gcTime: 0,
    retry: false,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!wallet || !destination || units === undefined)
        throw new Error("Deposit inputs are unavailable.");
      const [gas, price] = await Promise.all([
        wallet.publicClient.estimateGas({
          account: wallet.account,
          to: getAddress(token),
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [getAddress(destination), units],
          }),
        }),
        wallet.publicClient.getGasPrice(),
      ]);
      wallet.assertActive();
      return gas * price;
    },
  });
  return {
    ready:
      !!wallet &&
      !error &&
      balances.isSuccess &&
      fee.isSuccess &&
      balances.data.nativeUnits >= fee.data,
    error:
      error ??
      (fee.isError
        ? "Network fee estimate is unavailable."
        : fee.isSuccess && balances.data && balances.data.nativeUnits < fee.data
          ? "Insufficient native balance for network fees."
          : undefined),
  };
}
