"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Address } from "viem";

import { ERC20_TOKENS } from "@/lib/constants/token-metadata";
import { fundingErrorSchema, hasLocalEvmFunds, MINIMUM_EVM_ETH } from "@/lib/wallet-funding";

import { useEvmBalances } from "./evm-balances-context";
import { useEvmWallet } from "./evm-wallet-context";
import { useLocalFaucet } from "./local-faucet-context";

interface FundingRecipient {
  address: Address;
  session: string | undefined;
}

interface AddressFundingState {
  funding: UseMutationResult<string | null, Error, FundingRecipient>;
  fund: () => Promise<void>;
  refreshError: string | null;
}

interface EvmLocalFundingState extends AddressFundingState {
  ready: boolean;
  fundingUnavailable: string | null;
  /** Addresses with a local ETH request in flight, shared by every surface offering funding. */
  fundingAddresses: readonly Address[];
  fundLocalEthAddress: (address: Address) => Promise<void>;
}

/**
 * Coalesces funding requests for the captured recipient and rejects stale completions.
 *
 * @param address - Current signing account.
 * @param session - Identity of the current signing session.
 * @param refresh - Reloads balances after successful funding.
 * @param fundRecipient - Starts the caller-selected local faucet requests.
 * @returns Funding mutation state and its recipient-scoped action.
 */
export function useAddressFunding(
  address: Address | undefined,
  session: string | undefined,
  refresh: () => Promise<void>,
  fundRecipient: (
    recipient: FundingRecipient,
    assertRecipient: () => void,
  ) => Promise<void> = async (recipient) => {
    const response = await fetch("/api/evm/eth-faucet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: recipient.address }),
    });
    if (!response.ok) {
      const body: unknown = await response.json();
      const parsed = fundingErrorSchema.safeParse(body);
      throw new Error(
        parsed.success ? (parsed.data.error ?? "EVM funding failed.") : "EVM funding failed.",
      );
    }
  },
): AddressFundingState {
  const current = useRef({ address, session });
  const pending = useRef<{
    address: Address;
    session: string | undefined;
    promise: Promise<void>;
  } | null>(null);
  const mutation = useMutation({
    mutationKey: ["evm-local-funding", session, address],
    mutationFn: async (recipient: FundingRecipient): Promise<string | null> => {
      const assertRecipient = (): void => {
        if (
          current.current.address !== recipient.address ||
          current.current.session !== recipient.session
        )
          throw new Error("EVM funding recipient changed.");
      };
      assertRecipient();
      await fundRecipient(recipient, assertRecipient);
      assertRecipient();
      try {
        await refresh();
        assertRecipient();
      } catch {
        assertRecipient();
        return "Funding succeeded. Balance refresh failed. Retry balances before transferring.";
      }
      return null;
    },
  });
  const { reset } = mutation;
  useEffect(() => {
    reset();
  }, [address, session, reset]);
  useLayoutEffect(() => {
    current.current = { address, session };
    return () => {
      current.current = { address: undefined, session: undefined };
    };
  }, [address, session]);
  const fund = (): Promise<void> => {
    if (!address) return Promise.reject(new Error("Connect an EVM wallet first."));
    if (pending.current?.address === address && pending.current.session === session)
      return pending.current.promise;
    const promise = mutation
      .mutateAsync({ address, session })
      .then(() => undefined)
      .finally(() => {
        if (pending.current?.promise === promise) pending.current = null;
      });
    pending.current = { address, session, promise };
    return promise;
  };
  return { funding: mutation, fund, refreshError: mutation.data ?? null };
}

function useEvmLocalFundingOwner(): EvmLocalFundingState {
  const faucet = useLocalFaucet();
  const ethFunding = useRef(new Map<Address, Promise<void>>());
  const [fundingAddresses, setFundingAddresses] = useState<readonly Address[]>([]);
  const publishEthFunding = (): void => {
    setFundingAddresses([...ethFunding.current.keys()]);
  };
  const { wallet } = useEvmWallet();
  const balances = useEvmBalances();
  const usdcToken = ERC20_TOKENS.find((token) => token.symbol === "USDC");
  if (!usdcToken) throw new Error("USDC configuration is unavailable.");
  const funding = useAddressFunding(
    wallet?.account,
    wallet?.sessionId,
    async () => {
      await balances.refetch({ throwOnError: true });
    },
    async (recipient, assertRecipient) => {
      faucet.requireEligible();
      assertRecipient();
      const current = balances.data;
      if (!current) throw new Error("Wallet balances are unavailable. Refresh balances and retry.");
      if (current.nativeUnits < MINIMUM_EVM_ETH) {
        const response = await fetch("/api/evm/eth-faucet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: recipient.address }),
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          const parsed = fundingErrorSchema.safeParse(body);
          throw new Error(
            parsed.success
              ? (parsed.data.error ?? "Local ETH funding failed.")
              : "Local ETH funding failed.",
          );
        }
      }
      assertRecipient();
      const usdc = current.tokens.find((token) => token.erc20Address === usdcToken.erc20Address);
      if (!usdc || usdc.units < 10n ** BigInt(usdc.decimals)) {
        faucet.requireEligible();
        assertRecipient();
        const response = await fetch("/api/evm/erc20-faucet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            address: recipient.address,
            tokenAddress: usdcToken.erc20Address,
          }),
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          const parsed = fundingErrorSchema.safeParse(body);
          throw new Error(
            parsed.success
              ? (parsed.data.error ?? "Local ERC-20 funding failed.")
              : "Local ERC-20 funding failed.",
          );
        }
      }
    },
  );
  const usdc = balances.data?.tokens.find(
    (token) =>
      token.erc20Address === ERC20_TOKENS.find((token) => token.symbol === "USDC")?.erc20Address,
  );
  const ready =
    !!wallet &&
    balances.isSuccess &&
    hasLocalEvmFunds(balances.data.nativeUnits, usdc?.units, usdc?.decimals);
  const requestEthFunding = async (address: Address): Promise<void> => {
    faucet.requireEligible();
    const response = await fetch("/api/evm/eth-faucet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const parsed = fundingErrorSchema.safeParse(body);
      throw new Error(
        parsed.success
          ? (parsed.data.error ?? "Local ETH funding failed.")
          : "Local ETH funding failed.",
      );
    }
  };
  // Every surface offering local ETH funding shares this ownership, so two controls for one
  // address cannot issue two faucet requests. The entry is claimed before the first await.
  const fundLocalEthAddress = (address: Address): Promise<void> => {
    const running = ethFunding.current.get(address);
    if (running) return running;
    const request = requestEthFunding(address).finally(() => {
      ethFunding.current.delete(address);
      publishEthFunding();
    });
    ethFunding.current.set(address, request);
    publishEthFunding();
    return request;
  };
  return {
    ...funding,
    ready,
    fundingUnavailable: faucet.eligible
      ? null
      : "Local funding requires the exact local faucet configuration.",
    fundingAddresses,
    fundLocalEthAddress,
  };
}
const EvmLocalFundingContext = createContext<ReturnType<typeof useEvmLocalFundingOwner> | null>(
  null,
);
/**
 * Shares local funding eligibility with consumers of the connected EVM account.
 *
 * @param props - Provider content.
 * @param props.children - Components using funding state.
 * @returns The funding context surrounding its consumers.
 */
export function EvmLocalFundingProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useEvmLocalFundingOwner();
  return (
    <EvmLocalFundingContext.Provider value={value}>{children}</EvmLocalFundingContext.Provider>
  );
}
/**
 * Reads funding eligibility and actions for the active EVM session.
 *
 * @returns Funding state, refresh failures and server availability.
 * @throws {Error} If the funding provider is missing.
 */
export function useEvmLocalFunding(): EvmLocalFundingState {
  const value = useContext(EvmLocalFundingContext);
  if (!value) throw new Error("useEvmLocalFunding requires EvmLocalFundingProvider.");
  return value;
}
