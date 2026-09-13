"use client";

import type * as React from "react";
import { useState } from "react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Feedback } from "@/components/ui/feedback";
import {
  type BrowserWalletChoice,
  discoverBrowserWallets,
} from "@/lib/midnight/wallet/BrowserWallet";
import type { Wallet } from "@/lib/midnight/wallet/Wallet";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { useVault } from "@/providers/vault-context";

import { VaultIdentityButton } from "./vault-identity-button";
import { WalletMenu } from "./wallet-menu";

/**
 * Composes Midnight wallet discovery, connection actions and vault identity controls.
 *
 * @returns The Midnight wallet menu.
 */
export function MidnightWalletButton(): React.JSX.Element {
  const connection = useMidnightConnection();
  const vault = useVault();
  const [choices, setChoices] = useState<BrowserWalletChoice[]>([]);
  const connect = (action: () => Promise<Wallet>): void => {
    void action().catch(() => undefined);
  };
  const refresh = (): void => {
    setChoices(discoverBrowserWallets());
  };
  return (
    <WalletMenu
      chainName="Midnight"
      wallet={connection.wallet}
      connecting={connection.connecting}
      progress={connection.syncStatus}
      error={connection.error}
      onOpenChange={(open) => {
        if (open) refresh();
      }}
      refresh={refresh}
      choices={choices.map((choice) => ({
        id: choice.key,
        name: choice.name,
        iconUrl: choice.icon,
        connect: () => {
          connect(() => connection.installBrowserWallet(choice));
        },
      }))}
      installSeed={(seed) => {
        connect(() => connection.installSeedWallet(seed));
      }}
      disconnect={vault.disconnect}
    >
      <div className="ds-menu-section">
        <VaultIdentityButton menuItem />
        {connection.wallet && vault.status === "missing-identity" && (
          <p role="status">Set a vault identity to load the vault.</p>
        )}
        {vault.status === "loading" && <p role="status">Loading vault…</p>}
        {vault.error && (
          <>
            <Feedback tone="error" role="alert">
              {vault.error}
            </Feedback>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                vault.retry();
              }}
            >
              Retry vault
            </DropdownMenuItem>
          </>
        )}
        {connection.wallet?.transactionUnavailable && (
          <p>{connection.wallet.transactionUnavailable}</p>
        )}
      </div>
    </WalletMenu>
  );
}
