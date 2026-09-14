"use client";

import { KeyRound, LoaderCircle, RefreshCw } from "lucide-react";
import type * as React from "react";
import { type ReactNode, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusDot } from "@/components/ui/feedback";
import { Feedback } from "@/components/ui/feedback";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import type { ExplorerAvailability } from "@/lib/explorer";
import type { WalletMetadata } from "@/lib/wallet-metadata";

import { SeedWalletDialog } from "./seed-wallet-dialog";
import { WalletMark } from "./wallet-mark";

/**
 * Public wallet menu contract shared by EVM and Midnight wallet owners.
 */
export interface WalletMenuProps {
  chainName: string;
  wallet: WalletMetadata | null;
  accountDetails?: ReactNode;
  accountExplorer?: ExplorerAvailability;
  connecting: boolean;
  error?: string | null;
  connectionUnavailable?: string | null;
  progress?: string;
  choices: readonly {
    id: string;
    name: string;
    iconUrl?: string;
    connect: () => void;
  }[];
  onOpenChange: (open: boolean) => void;
  refresh: () => void;
  installSeed: (seed: string) => void;
  disconnect: () => void;
  children?: ReactNode;
}

/**
 * Renders shared wallet connection actions and chain-specific menu content.
 *
 * @param root0 - Wallet menu properties.
 * @param root0.chainName - Chain label.
 * @param root0.wallet - Connected wallet metadata.
 * @param root0.accountDetails - Optional replacement for the connected account identifier.
 * @param root0.accountExplorer - Explorer destination for the default connected account identifier.
 * @param root0.connecting - Connection state.
 * @param root0.error - Connection error text.
 * @param root0.connectionUnavailable - Configuration reason disabling connection actions.
 * @param root0.progress - Optional progress text.
 * @param root0.choices - Browser wallet choices.
 * @param root0.onOpenChange - Menu state callback.
 * @param root0.refresh - Refresh action.
 * @param root0.installSeed - Seed installation action.
 * @param root0.disconnect - Disconnect action.
 * @param root0.children - Chain-specific menu content.
 * @returns The wallet menu.
 */
export function WalletMenu({
  chainName,
  wallet,
  accountDetails,
  accountExplorer,
  connecting,
  error,
  connectionUnavailable,
  progress,
  choices,
  onOpenChange,
  refresh,
  installSeed,
  disconnect,
  children,
}: WalletMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const status = connecting ? "connecting" : wallet ? "connected" : "not connected";
  const label = `${chainName} wallet: ${status}`;
  const changeOpen = (value: boolean): void => {
    setOpen(value);
    onOpenChange(value);
  };
  return (
    <>
      <DropdownMenu open={open} onOpenChange={changeOpen}>
        <DropdownMenuTrigger asChild>
          <Button ref={trigger} variant="ghost" size="sm" aria-label={label} title={label}>
            {connecting ? (
              <LoaderCircle className="ds-spinner size-4" aria-hidden="true" />
            ) : (
              <WalletMark iconUrl={wallet?.iconUrl} />
            )}
            <span>{chainName}</span>
            <StatusDot tone={wallet ? "success" : "neutral"} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (seedOpen) event.preventDefault();
          }}
        >
          <div className="ds-divider-bottom ds-body ds-label ds-inline-inset-control ds-block-inset-control">
            {chainName} wallet <span className="ds-muted">({status})</span>
          </div>
          {connecting && (
            <p role="status" className="ds-inset-control ds-body">
              Connecting… {progress}
            </p>
          )}
          {connectionUnavailable && (
            <Feedback tone="warning" role="status">
              {connectionUnavailable}
            </Feedback>
          )}
          {error && (
            <Feedback tone="error" role="alert">
              {error}
            </Feedback>
          )}
          {wallet && (
            <div className="ds-menu-section">
              <p className="ds-row ds-control-gap">
                <WalletMark iconUrl={wallet.iconUrl} />
                <span className="break-all">{wallet.name}</span>
              </p>
              <p>{wallet.kind === "seed" ? "Seed wallet" : "Browser wallet"} · Connected</p>
              {accountDetails === undefined ? (
                <PublicIdentifier
                  inMenu
                  value={wallet.accountDetail}
                  label={`${chainName} wallet address`}
                  explorer={accountExplorer}
                />
              ) : (
                accountDetails
              )}
            </div>
          )}
          {children}
          {!choices.length && (
            <p className="ds-inset-control ds-body ds-muted">
              No {chainName} wallet extension found. Enable an extension for this page, then refresh
              wallets.
            </p>
          )}
          {choices.map((choice) => (
            <DropdownMenuItem
              key={choice.id}
              disabled={connecting || !!connectionUnavailable}
              onSelect={(event) => {
                event.preventDefault();
                choice.connect();
              }}
            >
              <WalletMark iconUrl={choice.iconUrl} />
              <span className="break-all">Connect {choice.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            disabled={connecting || !!connectionUnavailable}
            onSelect={() => {
              setSeedOpen(true);
            }}
          >
            <KeyRound aria-hidden="true" />
            Use a seed wallet
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              refresh();
            }}
          >
            <RefreshCw aria-hidden="true" />
            Refresh wallets
          </DropdownMenuItem>
          {(wallet ?? connecting) && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={(event) => {
                event.preventDefault();
                disconnect();
              }}
            >
              Disconnect {chainName} wallet
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <SeedWalletDialog
        chainName={chainName}
        open={seedOpen}
        onOpenChange={setSeedOpen}
        returnFocus={trigger}
        onInstall={(seed) => {
          changeOpen(true);
          installSeed(seed);
        }}
      />
    </>
  );
}
