"use client";

import type * as React from "react";
import { useRef, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDepositAddressSweep } from "@/hooks/use-deposit-address-sweep";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { useVaultGasReserves } from "@/hooks/use-vault-gas-reserves";
import type { NetworkData, TokenConfig } from "@/lib/constants/token-metadata";
import { useEvmDeposit } from "@/providers/evm-deposit-context";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { DepositAddress } from "./deposit-address";
import { DepositStepper } from "./deposit-stepper";
import { depositAddressShowsReserve, EvmDepositAddress } from "./evm-deposit-address";
import { EvmDepositTransfer } from "./evm-deposit-transfer";
import { PendingDepositRecovery } from "./pending-deposit-recovery";
import { TokenSelection } from "./token-selection";

interface VaultEvmDepositProps {
  token: TokenConfig;
  network: NetworkData;
  depositAddress: string;
  recordedTransfer: boolean;
  onStartDeposit: (units: bigint) => void;
}

/**
 * Composes the preparation section, the five-step view and the request-ID re-entry for one token.
 *
 * The deposit sweep reserve is observed once here, so exactly one surface in the dialog states its
 * reason: the address entry point's gate when that control is the one it blocks, the send gate
 * when it blocks the transfer, and the deposit address funding section otherwise.
 *
 * @param properties - Selected token, applied network and the deposit route's state.
 * @param properties.token - Token being deposited.
 * @param properties.network - Applied network shown beside the address.
 * @param properties.depositAddress - Identity-derived address holding the unswept tokens.
 * @param properties.recordedTransfer - Whether an unresolved transfer owns this deposit route.
 * @param properties.onStartDeposit - Starts the sweep for the exact validated base units.
 * @returns The vault deposit surface for the EVM route.
 */
function VaultEvmDeposit(properties: VaultEvmDepositProps): React.JSX.Element {
  const { token, network, depositAddress, recordedTransfer, onStartDeposit } = properties;
  const progress = useMidnightProgress();
  const gas = useVaultGasReserves();
  const sweep = useDepositAddressSweep(token);
  const sweepReserve = gas.depositSweep.reserve;
  const addressShowsReserve = depositAddressShowsReserve({
    balanceReason: sweep.balance.reason,
    operationActive: progress.active,
    reserveBlocking: sweepReserve !== null && sweepReserve.kind !== "sufficient",
  });
  return (
    <>
      <EvmDepositTransfer token={token} sweepReserveExplained={addressShowsReserve} />
      <div className="ds-stack-content">
        <EvmDepositAddress
          token={token}
          network={network}
          depositAddress={depositAddress}
          sweep={sweep}
          isSubmitting={progress.active}
          showContinue={!recordedTransfer}
          onStartDeposit={onStartDeposit}
        />
        <DepositStepper token={token} />
        <PendingDepositRecovery token={token} />
      </div>
    </>
  );
}

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
  // runDeposit rereads the ledger before it signs anything. The dialog stays open so the five-step
  // view and the confirmed request ID are in front of the user for the whole operation.
  const handleStartDeposit = (units: bigint): void => {
    if (!selectedToken || progress.active || recordedTransfer) return;
    void operations.deposit(selectedToken.erc20Address, units).catch(() => {
      /* surfaced by MidnightProgressToaster via flow.fail */
    });
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
              {isVaultEvmDeposit ? (
                <VaultEvmDeposit
                  token={selectedToken}
                  network={selectedNetwork}
                  depositAddress={vault.binding?.depositAddress ?? ""}
                  recordedTransfer={recordedTransfer !== null}
                  onStartDeposit={handleStartDeposit}
                />
              ) : (
                <>
                  {selectedNetwork.chain === "ethereum" && (
                    <>
                      <EvmDepositTransfer token={selectedToken} sweepReserveExplained={false} />
                      <PendingDepositRecovery token={selectedToken} />
                    </>
                  )}
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
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
