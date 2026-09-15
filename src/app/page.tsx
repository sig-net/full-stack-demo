"use client";

import type * as React from "react";
import { useRef } from "react";

import { ActivityListTable } from "@/components/activity-list-table";
import { BalanceSection } from "@/components/balance-section";
import { EmptyStateWallet } from "@/components/empty-state-wallet";
import { LendWidget } from "@/components/lend-widget";
import { LocalWalletFunding } from "@/components/local-wallet-funding";
import { NavigationHeader } from "@/components/navigation-header";
import { SettlementWaitDetail } from "@/components/settlement-wait-detail";
import { SwapWidget } from "@/components/swap-widget";
import { useVault } from "@/providers/vault-context";

/**
 * Composes the connected dashboard and the wallet setup state for the home route.
 *
 * @returns The home dashboard or wallet setup state.
 */
export default function Home(): React.JSX.Element {
  const vault = useVault();
  const identityTriggerRef = useRef<HTMLButtonElement>(null);
  const isConnected = vault.binding !== null;

  return (
    <div className="ds-page min-h-screen w-full overflow-x-hidden">
      <NavigationHeader identityTriggerRef={identityTriggerRef} />
      <LocalWalletFunding />

      {!isConnected ? (
        <div className="ds-inset-content ds-before-section mx-auto max-w-full xl:container">
          <EmptyStateWallet appliedFocusRef={identityTriggerRef} />
        </div>
      ) : (
        <div className="ds-inset-content ds-before-section ds-bottom-inset-section lg:ds-before-section mx-auto max-w-full xl:container">
          <div className="ds-stack-section lg:ds-section-gap lg:flex-row">
            <div className="ds-section-gap order-1 flex w-full flex-col lg:order-2 lg:w-auto lg:shrink-0">
              <SwapWidget />
              <LendWidget />
            </div>

            <div className="ds-section-gap lg:ds-section-gap order-2 flex w-full flex-col lg:order-1 lg:flex-1">
              <SettlementWaitDetail />
              <BalanceSection />
              <ActivityListTable />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Keeps the wallet dashboard request scoped to a fresh server render. */
export const dynamic = "force-dynamic";
