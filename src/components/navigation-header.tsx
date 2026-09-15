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
        "ds-divider-bottom ds-surface-muted ds-block-inset-control relative min-h-16 w-full sm:min-h-20",
        className,
      )}
    >
      <a
        href="https://github.com/sig-net/full-stack-demo"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View source on GitHub"
        className="absolute top-0 left-0 z-10"
      >
        {/* Octocat corner artwork from github-corners by Tim Holman, MIT licence. */}
        <svg
          width="80"
          height="80"
          viewBox="0 0 250 250"
          aria-hidden="true"
          className="ds-github-corner -scale-x-100"
        >
          <path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z" />
          <path
            d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2"
            fill="currentColor"
            className="ds-github-corner-arm"
          />
          <path
            d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z"
            fill="currentColor"
          />
        </svg>
      </a>
      <div className="ds-inset-content ds-control-gap container mx-auto flex h-full flex-wrap items-center justify-between">
        <div className="ds-control-gap flex flex-shrink-0 items-center">
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
