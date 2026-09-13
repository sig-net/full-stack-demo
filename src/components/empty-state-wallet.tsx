import { ArrowDownCircle, ArrowRightLeft, Wallet } from "lucide-react";
import type * as React from "react";

import { EvmWalletButton } from "@/components/evm-wallet-button";
import { MidnightWalletButton } from "@/components/midnight-wallet-button";
import { EmptyState } from "@/components/ui/empty-state";
import { VaultIdentityButton, VaultIdentityHelp } from "@/components/vault-identity-controls";

/**
 * Composes the initial wallet actions and cross-chain explanation for an empty vault.
 *
 * @param props - Optional focus destination after connected identity activation.
 * @param props.appliedFocusRef - Persistent identity trigger in the application toolbar.
 * @returns The wallet empty state.
 */
export function EmptyStateWallet({
  appliedFocusRef,
}: {
  appliedFocusRef?: React.RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  return (
    <EmptyState
      icon={Wallet}
      title="Ethereum Assets in an ERC-20 Vault"
      description="Deposit ERC-20 tokens and your program can call into Ethereum liquidity, markets, and assets"
      action={
        <>
          <div className="ds-stack-control ds-after-section items-center">
            <h3 className="ds-text ds-heading">To activate the dApp</h3>
            <p className="ds-text ds-prose">1. Connect a Midnight and EVM wallet</p>
            <div className="ds-control-gap flex flex-wrap justify-center">
              <MidnightWalletButton />
              <EvmWalletButton />
            </div>
            <p className="ds-text ds-prose">2. Set a vault identity</p>
            <div className="ds-control-gap flex items-center justify-center">
              <VaultIdentityButton appliedFocusRef={appliedFocusRef} />
              <VaultIdentityHelp />
            </div>
          </div>

          <div className="ds-content-gap sm:ds-section-gap grid grid-cols-2 text-center">
            <div className="ds-stack ds-control-gap items-center">
              <div className="ds-circle ds-surface-success flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16">
                <ArrowDownCircle className="ds-success h-6 w-6 sm:h-8 sm:w-8" />
              </div>
              <div>
                <p className="ds-text ds-prose ds-label">Deposit</p>
                <p className="ds-text ds-body">From Ethereum</p>
              </div>
            </div>

            <div className="ds-stack ds-control-gap items-center">
              <div className="ds-circle ds-surface flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16">
                <ArrowRightLeft className="ds-muted h-6 w-6 sm:h-8 sm:w-8" />
              </div>
              <div>
                <p className="ds-text ds-prose ds-label">Manage</p>
                <p className="ds-text ds-body">Cross-Chain</p>
              </div>
            </div>
          </div>
        </>
      }
    />
  );
}
