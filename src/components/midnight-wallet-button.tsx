"use client";

import type * as React from "react";
import { useState } from "react";

import {
  type BrowserWalletChoice,
  discoverBrowserWallets,
} from "@/lib/midnight/wallet/BrowserWallet";
import type { Wallet } from "@/lib/midnight/wallet/Wallet";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { useRuntimeConfiguration } from "@/providers/runtime-config-context";
import { useVault } from "@/providers/vault-context";

import { WalletMenu } from "./wallet-menu";

/**
 * Composes Midnight wallet discovery, connection actions and capability feedback.
 *
 * @returns The Midnight wallet menu.
 */
export function MidnightWalletButton(): React.JSX.Element {
  const { applied } = useRuntimeConfiguration();
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
      connectionUnavailable={
        applied.readiness.midnight.status === "unavailable"
          ? applied.readiness.midnight.reasons.join(" ")
          : null
      }
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
        {connection.wallet?.transactionUnavailable && (
          <p>{connection.wallet.transactionUnavailable}</p>
        )}
      </div>
    </WalletMenu>
  );
}
