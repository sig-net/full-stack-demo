"use client";

import type * as React from "react";
import { useState } from "react";

import { MIDNIGHT_ADDRESS_UNSUPPORTED } from "@/lib/explorer";
import {
  type BrowserWalletChoice,
  discoverBrowserWallets,
} from "@/lib/midnight/wallet/BrowserWallet";
import type { Wallet } from "@/lib/midnight/wallet/Wallet";
import { useConfiguration } from "@/providers/configuration-context";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { useVault } from "@/providers/vault-context";

import { PublicIdentifier } from "./ui/public-identifier";
import { WalletMenu } from "./wallet-menu";

/**
 * Composes Midnight wallet discovery, connection actions and capability feedback.
 *
 * @returns The Midnight wallet menu.
 */
export function MidnightWalletButton(): React.JSX.Element {
  const { applied } = useConfiguration();
  const connection = useMidnightConnection();
  const vault = useVault();
  const [choices, setChoices] = useState<BrowserWalletChoice[]>([]);
  const connect = (action: () => Promise<Wallet>): void => {
    void action().catch(() => undefined);
  };
  const refresh = (): void => {
    setChoices(discoverBrowserWallets());
  };
  const snapshot = connection.addresses;
  const showAddresses = connection.connecting || snapshot !== null || connection.wallet !== null;
  const addressRows = [
    {
      key: "shielded",
      label: "Shielded",
      copyLabel: "Midnight shielded address",
      value: snapshot?.shieldedAddress ?? connection.wallet?.shieldedAddress,
      unavailable: undefined,
    },
    {
      key: "unshielded",
      label: "Unshielded",
      copyLabel: "Midnight unshielded address",
      value: snapshot?.unshieldedAddress ?? connection.wallet?.unshieldedAddress,
      unavailable: undefined,
    },
    {
      key: "dust",
      label: "DUST",
      copyLabel: "Midnight DUST address",
      value: snapshot?.dustAddress ?? connection.wallet?.dustAddress,
      unavailable: snapshot?.dustUnavailable,
    },
  ] as const;
  return (
    <WalletMenu
      chainName="Midnight"
      wallet={connection.wallet}
      accountDetails={null}
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
      {showAddresses && (
        <div className="ds-menu-section">
          <div className="ds-stack-control">
            {addressRows.map((address) => (
              <div key={address.key}>
                <p className="ds-label">{address.label}</p>
                {address.value ? (
                  <PublicIdentifier
                    inMenu
                    value={address.value}
                    label={address.copyLabel}
                    explorer={MIDNIGHT_ADDRESS_UNSUPPORTED}
                  />
                ) : (
                  <p className="ds-muted">
                    {address.unavailable ??
                      (connection.wallet
                        ? "Not available from this wallet."
                        : "Not available yet.")}
                  </p>
                )}
              </div>
            ))}
          </div>
          {connection.wallet?.transactionUnavailable && (
            <p>{connection.wallet.transactionUnavailable}</p>
          )}
        </div>
      )}
    </WalletMenu>
  );
}
