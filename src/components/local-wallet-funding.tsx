"use client";

import type * as React from "react";

import { Feedback } from "@/components/ui/feedback";
import { LOCAL_NIGHT_GRANT, MINIMUM_EVM_ETH } from "@/lib/wallet-funding";
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
  const pending =
    localMidnight.funding.isPending ||
    midnight.registration.isPending ||
    localEvm.funding.isPending;
  if (!midnight.wallet && !evm.wallet) return null;
  const needsMidnight = !!midnight.wallet && !midnight.resourcesReady;
  const evmResourcesReady = localEvm.fundingUnavailable
    ? evmBalances.isSuccess && evmBalances.data.nativeUnits >= MINIMUM_EVM_ETH
    : localEvm.ready;
  const needsEvm = !!evm.wallet && !evmResourcesReady;
  const canFundMidnight =
    needsMidnight &&
    midnight.balances.isSuccess &&
    midnight.balances.data.night < LOCAL_NIGHT_GRANT &&
    !localMidnight.fundingUnavailable;
  const canFundEvm = needsEvm && evmBalances.isSuccess && !localEvm.fundingUnavailable;
  const canRegisterNight =
    !!midnight.wallet?.registerNightForDust &&
    (midnight.balances.data?.unregisteredNight ?? 0n) > 0n;
  return (
    <div className="ds-stack-control ds-round ds-frame ds-surface ds-inset-content ds-body mx-auto max-w-3xl">
      <p role="status">
        {midnight.wallet &&
          `Midnight: ${midnight.transactionUnavailable ?? (midnight.balances.isPending ? "checking resources" : midnight.ready ? "DUST ready" : midnight.balances.isError ? "balance unavailable" : "DUST below transaction threshold")}. `}
        {evm.wallet &&
          `EVM: ${evmBalances.isPending ? "checking balances" : evmResourcesReady ? "gas reserve ready" : evmBalances.isError ? "balances unavailable" : "funds below the required reserve"}.`}
      </p>
      {(needsMidnight || needsEvm) && (
        <>
          <p>
            {localMidnight.fundingUnavailable || localEvm.fundingUnavailable
              ? "Fund the configured wallets and vault addresses directly before starting a transaction."
              : "Fund local wallets. Local EVM funding targets 1 ETH and 100 USDC."}
          </p>
          {!localMidnight.fundingUnavailable && (
            <Button
              disabled={pending || (!canFundMidnight && !canFundEvm)}
              onClick={() => {
                void Promise.allSettled([
                  ...(canFundMidnight ? [localMidnight.fund()] : []),
                  ...(canFundEvm ? [localEvm.fund()] : []),
                ]);
              }}
            >
              {pending ? "Funding local wallets…" : "Fund local wallets"}
            </Button>
          )}
        </>
      )}
      {canRegisterNight && (
        <Button
          disabled={pending}
          onClick={() => {
            void midnight.registerNight().catch(() => undefined);
          }}
        >
          {midnight.registration.isPending
            ? "Registering NIGHT for DUST…"
            : "Register NIGHT for DUST"}
        </Button>
      )}
      {midnight.registrationUnavailable &&
        (midnight.balances.data?.unregisteredNight ?? midnight.balances.data?.night ?? 0n) > 0n && (
          <p>{midnight.registrationUnavailable}</p>
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
      {midnight.registration.error && (
        <Feedback tone="error" role="alert">
          NIGHT registration: {midnight.registration.error.message}
        </Feedback>
      )}
      <Button
        variant="outline"
        onClick={() => {
          if (midnight.wallet) void midnight.balances.refetch();
          if (evm.wallet) void evmBalances.refetch();
        }}
      >
        Refresh wallet readiness
      </Button>
    </div>
  );
}
