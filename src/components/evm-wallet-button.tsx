"use client";

import type * as React from "react";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Feedback } from "@/components/ui/feedback";
import {
  browserWalletConnection,
  captureLocalForkPolicy,
  seedWalletConnection,
} from "@/lib/config/evm-wallet";
import { ERC20_TOKENS } from "@/lib/constants/token-metadata";
import { type BrowserWalletChoice, discoverBrowserWallets } from "@/lib/evm/wallet/BrowserWallet";
import { useEvmBalances } from "@/providers/evm-balances-context";
import { useEvmWallet } from "@/providers/evm-wallet-context";
import { useRuntimeConfiguration } from "@/providers/runtime-config-context";

import { WalletMenu } from "./wallet-menu";

/**
 * Composes the EVM wallet menu with balances and local wallet actions.
 *
 * @returns The EVM wallet menu.
 */
export function EvmWalletButton(): React.JSX.Element {
  const { applied } = useRuntimeConfiguration();
  const evm = useEvmWallet();
  const balances = useEvmBalances();
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [choices, setChoices] = useState<BrowserWalletChoice[]>([]);
  useEffect(() => {
    if (!open) return;
    return discoverBrowserWallets(setChoices);
  }, [open, revision]);
  return (
    <WalletMenu
      chainName="EVM"
      wallet={evm.wallet}
      connecting={evm.connecting}
      error={evm.error}
      connectionUnavailable={
        applied.readiness.evm.status === "unavailable"
          ? applied.readiness.evm.reasons.join(" ")
          : null
      }
      onOpenChange={setOpen}
      refresh={() => {
        setChoices([]);
        setRevision((value) => value + 1);
      }}
      choices={choices.map((choice) => ({
        ...choice,
        connect: () => {
          void evm.connect(
            browserWalletConnection(
              choice,
              applied.evm,
              captureLocalForkPolicy(applied.midnight.networkId),
            ),
          );
        },
      }))}
      installSeed={(seed) => {
        void evm.connect(
          seedWalletConnection(
            seed,
            applied.evm,
            captureLocalForkPolicy(applied.midnight.networkId),
          ),
        );
      }}
      disconnect={evm.disconnect}
    >
      {evm.wallet && (
        <div className="ds-menu-section" aria-label="EVM balances">
          {balances.isPending && <p role="status">Loading balances…</p>}
          {balances.isError && (
            <Feedback tone="error" role="alert">
              Unable to read wallet balances.
            </Feedback>
          )}
          {balances.isSuccess && (
            <>
              <p>
                {formatUnits(balances.data.nativeUnits, evm.wallet.chain.nativeCurrency.decimals)}{" "}
                {evm.wallet.chain.nativeCurrency.symbol}
              </p>
              {balances.data.tokens.map((token) => (
                <p key={token.erc20Address}>
                  {formatUnits(token.units, token.decimals)}{" "}
                  {ERC20_TOKENS.find((value) => value.erc20Address === token.erc20Address)
                    ?.symbol ?? token.erc20Address}
                </p>
              ))}
            </>
          )}
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              void balances.refetch();
            }}
          >
            {balances.isError ? "Retry balances" : "Refresh balances"}
          </DropdownMenuItem>
        </div>
      )}
    </WalletMenu>
  );
}
