"use client";

import type * as React from "react";

import { Feedback } from "@/components/ui/feedback";
import { useEvmBalances } from "@/providers/evm-balances-context";
import { useEvmLocalFunding } from "@/providers/evm-local-funding-context";
import { useEvmWallet } from "@/providers/evm-wallet-context";
import { useMidnightLocalFunding } from "@/providers/midnight-local-funding-context";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";

import { Button } from "./ui/button";

/**
 * Coordinates local funding eligibility and wallet readiness feedback.
 *
 * @returns The funding surface or nothing when no wallet is connected.
 */
export function LocalWalletFunding(): React.JSX.Element | null {
  const midnight = useMidnightReadiness();
  const localMidnight = useMidnightLocalFunding();
  const evm = useEvmWallet();
  const localEvm = useEvmLocalFunding();
  const evmBalances = useEvmBalances();
  const pending = localMidnight.funding.isPending || localEvm.funding.isPending;
  if (!midnight.wallet && !evm.wallet) return null;
  const needsMidnight = !!midnight.wallet && !midnight.resourcesReady;
  const needsEvm = !!evm.wallet && !localEvm.ready;
  const canFundMidnight =
    needsMidnight && midnight.balances.isSuccess && !localMidnight.fundingUnavailable;
  const canFundEvm = needsEvm && evmBalances.isSuccess && !localEvm.fundingUnavailable;
  return (
    <div className="ds-stack-control ds-round ds-frame ds-surface ds-inset-content ds-body mx-auto max-w-3xl">
      <p role="status">
        {midnight.wallet &&
          `Midnight: ${midnight.transactionUnavailable ?? (midnight.balances.isPending ? "checking resources" : midnight.ready ? "DUST ready" : midnight.balances.isError ? "balance unavailable" : "DUST below transaction threshold")}. `}
        {evm.wallet &&
          `EVM: ${evmBalances.isPending ? "checking balances" : localEvm.ready ? "local funding reserve ready" : evmBalances.isError ? "balances unavailable" : "funds below local funding reserve"}.`}
      </p>
      {localMidnight.fundingUnavailable && <p>{localMidnight.fundingUnavailable}</p>}
      {localEvm.fundingUnavailable && <p>{localEvm.fundingUnavailable}</p>}
      {(needsMidnight || needsEvm) && (
        <>
          <p>
            Fund the connected wallets and wait for spendable DUST before starting a transaction.
            Local EVM funding targets 1 ETH and 100 USDC.
          </p>
          {localMidnight.eligibility.data === true && (
            <Button
              disabled={pending || (!canFundMidnight && !canFundEvm)}
              onClick={() => {
                void Promise.allSettled([
                  ...(canFundMidnight ? [localMidnight.fund()] : []),
                  ...(canFundEvm ? [localEvm.fund()] : []),
                ]);
              }}
            >
              {pending ? "Funding and waiting for spendable resources…" : "Fund local wallets"}
            </Button>
          )}
          {localMidnight.eligibility.data === false && (
            <p>
              Local funding is unavailable. Check the local setup configuration or fund your
              configured network wallet.
            </p>
          )}
        </>
      )}
      {localMidnight.funding.error && (
        <Feedback tone="error" role="alert">
          Midnight: {localMidnight.funding.error.message}
        </Feedback>
      )}
      {localEvm.funding.error && (
        <Feedback tone="error" role="alert">
          EVM: {localEvm.funding.error.message}
        </Feedback>
      )}
      {localEvm.refreshError && (
        <Feedback tone="error" role="alert">
          EVM: {localEvm.refreshError}
        </Feedback>
      )}
      {localMidnight.eligibility.isError && (
        <Feedback tone="error" role="alert">
          Funding eligibility could not be checked.
        </Feedback>
      )}
      <Button
        variant="outline"
        onClick={() => {
          void localMidnight.eligibility.refetch();
          if (midnight.wallet) void midnight.balances.refetch();
          if (evm.wallet) void evmBalances.refetch();
        }}
      >
        Refresh wallet readiness
      </Button>
    </div>
  );
}
