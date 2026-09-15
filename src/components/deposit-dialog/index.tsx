"use client";

import type * as React from "react";
import { useRef, useState } from "react";

import { LoadingState } from "@/components/states/LoadingState";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import type { NetworkData, TokenConfig } from "@/lib/constants/token-metadata";
import { useEvmDeposit } from "@/providers/evm-deposit-context";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { DepositAddress } from "./deposit-address";
import { EvmDepositAddress } from "./evm-deposit-address";
import { EvmDepositTransfer } from "./evm-deposit-transfer";
import { PendingDepositRecovery } from "./pending-deposit-recovery";
import { SettlementWaitDetail } from "./settlement-wait-detail";
import { TokenSelection } from "./token-selection";

interface DepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Coordinates token selection, address display and the EVM to Midnight deposit continuation.
 *
 * @param root0 - Dialog state properties.
 * @param root0.open - Whether the dialog is open.
 * @param root0.onOpenChange - Dialog state callback.
 * @returns The deposit dialog.
 */
export function DepositDialog({ open, onOpenChange }: DepositDialogProps): React.JSX.Element {
  const [selectedToken, setSelectedToken] = useState<TokenConfig | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkData | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const operations = useVaultOperations();
  const connection = useMidnightConnection();
  const evm = useEvmDeposit();
  const vault = useVault();
  const progress = useMidnightProgress();

  const isVaultEvmDeposit = vault.binding !== null && selectedNetwork?.chain === "ethereum";
  const step = selectedToken && selectedNetwork ? "show-address" : "select-token";

  const handleTokenSelect = (token: TokenConfig, network: NetworkData): void => {
    setSelectedToken(token);
    setSelectedNetwork(network);
  };

  // An unresolved transfer stays the route for this token, so the address continuation cannot
  // start a second deposit while its submitted transaction can still settle.
  const recordedTransfer =
    evm.transfer &&
    vault.binding &&
    selectedToken &&
    evm.transfer.binding === vault.binding &&
    evm.transfer.destination === vault.binding.depositAddress &&
    evm.transfer.token === selectedToken.erc20Address &&
    (evm.transfer.status !== "error" || evm.unresolved) &&
    evm.transfer.sweep !== "complete"
      ? evm.transfer
      : null;

  // The shielded address shown on this surface is itself the deposit destination, so the
  // continuation here dismisses the dialog and the wallet credits the transfer.
  const handleMidnightContinue = (): void => {
    if (!progress.active) handleClose();
  };

  // The units arrive already validated against the balance the deposit surface observed, and
  // runDeposit rereads the ledger before it signs anything.
  const handleStartDeposit = (units: bigint): void => {
    if (!selectedToken || progress.active || recordedTransfer) return;
    void operations.deposit(selectedToken.erc20Address, units).catch(() => {
      /* surfaced by MidnightProgressToaster via flow.fail */
    });
    handleClose();
  };

  const handleClose = (): void => {
    setSelectedToken(null);
    setSelectedNetwork(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        size={step === "show-address" ? "wide" : "default"}
        onOpenAutoFocus={() => {
          const activeElement = document.activeElement;
          opener.current = activeElement instanceof HTMLElement ? activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const activeOpener = opener.current;
          opener.current = null;
          if (activeOpener?.isConnected) activeOpener.focus();
        }}
      >
        {step === "select-token" && (
          <div className="ds-stack-content">
            <DialogHeader>
              <DialogTitle>Select an asset</DialogTitle>
            </DialogHeader>
            <TokenSelection onTokenSelect={handleTokenSelect} />
          </div>
        )}

        {step === "show-address" && selectedToken && selectedNetwork && (
          <div className="ds-stack-content">
            <DialogHeader>
              <DialogTitle>Deposit Address</DialogTitle>
            </DialogHeader>
            <div className="ds-deposit-layout">
              {selectedNetwork.chain === "ethereum" && (
                <>
                  <EvmDepositTransfer token={selectedToken} />
                  <PendingDepositRecovery token={selectedToken} />
                </>
              )}
              {isVaultEvmDeposit && progress.active ? (
                <div className="ds-stack-content">
                  <LoadingState message={progress.message} />
                  <SettlementWaitDetail />
                </div>
              ) : isVaultEvmDeposit ? (
                <EvmDepositAddress
                  token={selectedToken}
                  network={selectedNetwork}
                  depositAddress={vault.binding?.depositAddress ?? ""}
                  isSubmitting={progress.active}
                  showContinue={!recordedTransfer}
                  onStartDeposit={handleStartDeposit}
                />
              ) : (
                <DepositAddress
                  token={selectedToken}
                  network={selectedNetwork}
                  depositAddress={
                    selectedNetwork.chain === "midnight"
                      ? (connection.wallet?.shieldedAddress ?? "")
                      : (vault.binding?.depositAddress ?? "")
                  }
                  isSubmitting={progress.active}
                  showContinue={!recordedTransfer}
                  canContinue={operations.ready}
                  onContinue={handleMidnightContinue}
                />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
