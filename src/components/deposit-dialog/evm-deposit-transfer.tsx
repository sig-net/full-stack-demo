"use client";

import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { formatUnits } from "viem";

import { EvmWalletButton } from "@/components/evm-wallet-button";
import { Button } from "@/components/ui/button";
import { type ControlGate, DisabledReason } from "@/components/ui/disabled-reason";
import { Feedback } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import { VaultGasAccount } from "@/components/vault-gas-account";
import { VaultGasGate } from "@/components/vault-gas-gate";
import { useEvmDepositEligibility } from "@/hooks/use-evm-deposit-eligibility";
import { useAppliedExplorerLinks } from "@/hooks/use-explorer-links";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { useVaultGasReserves } from "@/hooks/use-vault-gas-reserves";
import type { TokenConfig } from "@/lib/constants/token-metadata";
import type { GasReserve } from "@/lib/evm/gas-reserve";
import { evmExplorerLink, type EvmExplorerSource } from "@/lib/explorer";
import { useEvmBalances } from "@/providers/evm-balances-context";
import { useEvmDeposit } from "@/providers/evm-deposit-context";
import { useEvmWallet } from "@/providers/evm-wallet-context";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

const SEND_GATE_ID = "deposit-transfer-send-gate";
const CONTINUE_GATE_ID = "deposit-transfer-continue-gate";

/**
 * Owns the EVM transfer amount and continues a matching vault deposit session.
 *
 * @param root0 - Transfer properties.
 * @param root0.token - Token being transferred.
 * @returns The EVM deposit transfer controls.
 */
export function EvmDepositTransfer({ token }: { token: TokenConfig }): React.JSX.Element {
  const evm = useEvmWallet();
  const deposit = useEvmDeposit();
  const balances = useEvmBalances();
  const vault = useVault();
  const binding = vault.binding;
  const readiness = useMidnightReadiness();
  const operations = useVaultOperations();
  const progress = useMidnightProgress();
  const gas = useVaultGasReserves();
  const [amount, setAmount] = useState("");
  const eligibility = useEvmDepositEligibility(token.erc20Address, amount, binding?.depositAddress);
  const explorers = useAppliedExplorerLinks();
  const transfer = deposit.transfer;
  // A submitted transfer keeps the explorer and chain applied when it was sent, so its receipt
  // stays on the chain that produced it after the configuration changes.
  const transferExplorer: EvmExplorerSource = {
    explorerUrl: transfer?.explorerUrl ?? "",
    chainId: transfer === null ? null : BigInt(transfer.chainId),
  };
  const tokenBalance = balances.data?.tokens.find(
    (value) => value.erc20Address === token.erc20Address,
  );
  const inFlight = transfer?.status === "approving" || transfer?.status === "confirming";
  const sweeping = transfer?.sweep === "pending";
  const currentTransfer =
    transfer !== null &&
    transfer.binding === vault.binding &&
    transfer.token === token.erc20Address;
  const failure = transfer?.failure ?? null;
  const sweepReserve = gas.depositSweep.reserve;
  const sweepGateReserve: GasReserve | null =
    sweepReserve !== null && sweepReserve.kind !== "sufficient" ? sweepReserve : null;
  const sweepFundingGate: ControlGate | null = sweepGateReserve && {
    reason: sweepGateReserve.reason,
    nextAction: sweepGateReserve.nextAction,
    tone: sweepGateReserve.tone,
  };
  // A confirmed request means the sweep may already be signed and broadcast, so the reserve it
  // spent must not block the continuation that finishes the same deposit.
  const requestConfirmed =
    operations.currentDeposit?.token.toLowerCase() === token.erc20Address.toLowerCase() &&
    operations.currentDeposit.requestId !== null;
  const sendGate: ControlGate | null = inFlight
    ? {
        reason:
          transfer.status === "approving"
            ? "This transfer is waiting for approval in your wallet."
            : "This transfer is submitted and waiting for its receipt.",
        nextAction:
          transfer.status === "approving"
            ? "Approve or reject the request in your wallet."
            : "Wait for the receipt, or open the transaction in the explorer.",
        tone: "neutral",
      }
    : sweeping
      ? {
          reason: "The confirmed transfer is being continued on Midnight.",
          nextAction: "Wait for the Midnight deposit to finish before sending more tokens.",
          tone: "neutral",
        }
      : deposit.unresolved && failure
        ? {
            reason: failure.message,
            nextAction: failure.nextAction,
            tone: "warning",
          }
        : sweepFundingGate;
  const continueGate: ControlGate | null = sweeping
    ? {
        reason: "This deposit is already being continued on Midnight.",
        nextAction: "Wait for the running continuation rather than starting a second one.",
        tone: "neutral",
      }
    : !requestConfirmed && sweepFundingGate
      ? sweepFundingGate
      : !readiness.ready
        ? {
            reason: "Midnight transaction prerequisites are not ready.",
            nextAction: "Restore Midnight readiness, then continue this deposit.",
            tone: "warning",
          }
        : progress.active
          ? {
              reason: "Another vault operation owns the Midnight connection.",
              nextAction: "Wait for the running operation to finish, then continue this deposit.",
              tone: "neutral",
            }
          : null;
  const sendDisabled =
    !eligibility.ready ||
    !readiness.ready ||
    !evm.wallet ||
    !vault.binding ||
    inFlight ||
    sweeping ||
    deposit.unresolved ||
    sweepFundingGate !== null ||
    !amount.trim();
  return (
    <div className="ds-stack-control ds-divider-top ds-top-inset-content">
      <p className="ds-label">Transfer from your Sepolia wallet</p>
      <EvmWalletButton />
      {evm.wallet && (
        <PublicIdentifier
          value={evm.wallet.account}
          label="EVM wallet address"
          explorer={explorers.evmAddress(evm.wallet.account)}
        />
      )}
      {tokenBalance && (
        <p>
          Connected wallet balance: {formatUnits(tokenBalance.units, tokenBalance.decimals)}{" "}
          {token.symbol}
        </p>
      )}
      {balances.isError && (
        <Feedback tone="error" role="alert">
          Wallet balances unavailable. Open the EVM wallet menu to retry.
        </Feedback>
      )}
      <Label htmlFor={`deposit-transfer-amount-${token.symbol}`}>
        Amount to transfer ({token.symbol})
      </Label>
      <Input
        id={`deposit-transfer-amount-${token.symbol}`}
        inputMode="decimal"
        value={amount}
        onChange={(event) => {
          setAmount(event.target.value);
        }}
        disabled={inFlight || sweeping || deposit.unresolved}
      />
      <Button
        disabled={sendDisabled}
        aria-describedby={sendGate ? SEND_GATE_ID : undefined}
        onClick={() => {
          try {
            void deposit
              .sendDeposit(vault.requireBinding(), token.erc20Address, amount)
              .catch(() => toast.error("The deposit session changed."));
          } catch {
            toast.error("Load the vault before transferring.");
          }
        }}
      >
        {sweeping
          ? "Transfer confirmed"
          : inFlight
            ? "Transfer pending…"
            : "Send tokens to deposit address"}
      </Button>
      {sweepGateReserve && sendGate === sweepFundingGate ? (
        <VaultGasGate
          reserve={sweepGateReserve}
          observation={gas.depositSweep}
          id={SEND_GATE_ID}
          label="Deposit transfer availability"
        />
      ) : sendGate ? (
        <DisabledReason
          id={SEND_GATE_ID}
          label="Deposit transfer availability"
          reason={sendGate.reason}
          nextAction={sendGate.nextAction}
          tone={sendGate.tone}
          action={
            <div className="ds-actions">
              {transfer?.status === "approving" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    deposit.abandonApproval();
                  }}
                >
                  Stop waiting for wallet approval
                </Button>
              )}
              {transfer?.hash && (
                <Button
                  variant="outline"
                  disabled={deposit.rechecking}
                  onClick={() => void deposit.recheckTransfer()}
                >
                  {deposit.rechecking ? "Rechecking transfer…" : "Recheck transfer receipt"}
                </Button>
              )}
            </div>
          }
        />
      ) : null}
      {amount.trim() && eligibility.error && (
        <Feedback tone="error" role="alert">
          {eligibility.error}
        </Feedback>
      )}
      {!binding && (
        <p>Connect Midnight and load your vault identity to obtain a deposit address.</p>
      )}
      {binding && (
        <div className="ds-stack-control ds-body">
          <p className="ds-label">Funding addresses</p>
          <p>
            Your connected wallet pays only for the token transfer above. These two addresses hold
            the ETH that the vault's own MPC-signed transactions spend.
          </p>
          <VaultGasAccount
            heading="Deposit address"
            accountName="deposit address"
            purpose="ETH for the deposit sweep."
            guidance="Send ETH on this network to the deposit address so it can pay for the token sweep into the vault. Sending ETH here does not deposit tokens and does not credit any shielded balance."
            observation={gas.depositSweep}
            network={gas.network}
          />
          <VaultGasAccount
            heading="EVM vault address"
            accountName="EVM vault address"
            purpose="ETH for swaps and withdrawals."
            guidance="Send ETH on this network to the EVM vault address so the vault can pay for swaps and withdrawals. This address is the vault's EVM account, not the Midnight vault contract."
            observation={gas.vaultOperations}
            network={gas.network}
          />
        </div>
      )}
      {transfer && (
        <div className="ds-stack-control ds-body">
          <p>Transfer: {transfer.status}</p>
          <p>Destination</p>
          <PublicIdentifier
            value={transfer.destination}
            label="Deposit destination"
            explorer={evmExplorerLink(transferExplorer, "address", transfer.destination)}
          />
          {transfer.hash && (
            <>
              <p>Transaction</p>
              <PublicIdentifier
                value={transfer.hash}
                label="Transaction hash"
                explorer={evmExplorerLink(transferExplorer, "transaction", transfer.hash)}
              />
            </>
          )}
          {failure && !sendGate && (
            <Feedback tone="error" role="alert">
              <p className="ds-label">{failure.message}</p>
              <p>{failure.nextAction}</p>
              {failure.detail && (
                <details>
                  <summary>Transfer failure detail</summary>
                  <p>{failure.detail}</p>
                </details>
              )}
              <div className="ds-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    deposit.dismissTransfer();
                  }}
                >
                  Dismiss this transfer
                </Button>
              </div>
            </Feedback>
          )}
          {failure?.detail && sendGate && (
            <details>
              <summary>Transfer failure detail</summary>
              <p>{failure.detail}</p>
            </details>
          )}
          {transfer.sweepError && (
            <Feedback tone="error" role="alert">
              Midnight deposit: {transfer.sweepError}
            </Feedback>
          )}
          {transfer.status === "confirmed" &&
            (currentTransfer ? (
              <>
                <Button
                  disabled={transfer.sweep === "complete" || continueGate !== null}
                  aria-describedby={continueGate ? CONTINUE_GATE_ID : undefined}
                  onClick={() => void deposit.continueDeposit()}
                >
                  {transfer.sweep === "complete"
                    ? "Midnight deposit complete"
                    : transfer.sweep === "pending"
                      ? "Midnight deposit pending…"
                      : "Continue with Midnight deposit"}
                </Button>
                {sweepGateReserve && continueGate === sweepFundingGate ? (
                  <VaultGasGate
                    reserve={sweepGateReserve}
                    observation={gas.depositSweep}
                    id={CONTINUE_GATE_ID}
                    label="Midnight continuation availability"
                  />
                ) : continueGate ? (
                  <DisabledReason
                    id={CONTINUE_GATE_ID}
                    label="Midnight continuation availability"
                    reason={continueGate.reason}
                    nextAction={continueGate.nextAction}
                    tone={continueGate.tone}
                  />
                ) : null}
              </>
            ) : (
              <p>
                This transfer belongs to another vault session. Its tokens remain at the destination
                shown.
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
