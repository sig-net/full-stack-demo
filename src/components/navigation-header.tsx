"use client";

import Image from "next/image";
import type * as React from "react";

import { ConfigurationMenu } from "@/components/configuration-menu";
import { EvmWalletButton } from "@/components/evm-wallet-button";
import { MidnightWalletButton } from "@/components/midnight-wallet-button";
import { VaultHealthButton } from "@/components/vault-health-button";
import { VaultIdentityButton } from "@/components/vault-identity-controls";
import { cn } from "@/lib/utils";

interface NavigationHeaderProps {
  className?: string;
  identityTriggerRef?: React.Ref<HTMLButtonElement>;
}

/**
 * Keeps vault identity, wallets and configuration available throughout the application.
 *
 * @param properties - Optional header classes and persistent identity trigger reference.
 * @returns The navigation header.
 */
export function NavigationHeader(properties: NavigationHeaderProps): React.JSX.Element {
  const { className, identityTriggerRef } = properties;
  return (
    <header
      className={cn(
        "ds-divider-bottom ds-surface-muted ds-block-inset-control min-h-16 w-full sm:min-h-20",
        className,
      )}
    >
      <div className="ds-inset-content ds-control-gap container mx-auto flex h-full flex-wrap items-center justify-between">
        <div className="flex-shrink-0">
          <Image
            src="/logo.svg"
            alt="Logo"
            width={120}
            height={24}
            className="max-w-24 object-contain sm:h-7 sm:w-36 sm:max-w-36"
            priority
          />
        </div>

        <div className="ds-tight flex flex-wrap items-center justify-end">
          <VaultIdentityButton triggerRef={identityTriggerRef} />
          <MidnightWalletButton />
          <EvmWalletButton />
          <VaultHealthButton />
          <ConfigurationMenu />
        </div>
      </div>
    </header>
  );
}
