"use client";

import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";

import { LoadingState } from "@/components/states/LoadingState";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import type { NetworkData, TokenConfig } from "@/lib/constants/token-metadata";
import { useEvmDeposit } from "@/providers/evm-deposit-context";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { DepositAddress } from "./deposit-address";
import { EvmDepositTransfer } from "./evm-deposit-transfer";
import { PendingDepositRecovery } from "./pending-deposit-recovery";
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

  const balances = useVaultBalances();
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

  const recordedTransfer =
    evm.transfer &&
    vault.binding &&
    selectedToken &&
    evm.transfer.binding === vault.binding &&
    evm.transfer.destination === vault.binding.depositAddress &&
    evm.transfer.token === selectedToken.erc20Address &&
    evm.transfer.status !== "error" &&
    evm.transfer.sweep !== "complete"
      ? evm.transfer
      : null;

  const handleContinue = async (): Promise<void> => {
    if (!selectedToken || !selectedNetwork) return;
    if (progress.active) return;

    if (selectedNetwork.chain === "midnight") {
      handleClose();
      return;
    }

    if (isVaultEvmDeposit) {
      if (recordedTransfer) {
        if (recordedTransfer.status === "confirmed") await evm.continueDeposit();
        return;
      }
      const erc20 = selectedToken.erc20Address;
      const units = balances.balances?.perToken[erc20.toLowerCase()]?.depositUnits;
      if (units == null) {
        toast.error("Deposit balance is unavailable. Refresh balances and retry.");
        void balances.refresh().catch(() => undefined);
        return;
      }
      if (units === 0n) {
        toast.error(`No ${selectedToken.symbol} at the deposit address`, {
          description: `Send Sepolia ${selectedToken.symbol} to the address above first.`,
        });
        return;
      }
      void operations.deposit(erc20, units).catch(() => {
        /* surfaced by MidnightProgressToaster via flow.fail */
      });
      handleClose();
      return;
    }
  };

  const handleClose = (): void => {
    setSelectedToken(null);
    setSelectedNetwork(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
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
            {selectedNetwork.chain === "ethereum" && (
              <>
                <EvmDepositTransfer token={selectedToken} />
                <PendingDepositRecovery token={selectedToken} />
              </>
            )}
            {isVaultEvmDeposit && progress.active ? (
              <LoadingState message={progress.message} />
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
                onContinue={() => {
                  void handleContinue();
                }}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
