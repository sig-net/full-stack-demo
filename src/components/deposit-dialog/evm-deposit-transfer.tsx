"use client";

import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { formatUnits, getAddress } from "viem";

import { EvmWalletButton } from "@/components/evm-wallet-button";
import { Button } from "@/components/ui/button";
import { DisabledReason } from "@/components/ui/disabled-reason";
import { Feedback } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import { useEvmDepositEligibility } from "@/hooks/use-evm-deposit-eligibility";
import { useAppliedExplorerLinks } from "@/hooks/use-explorer-links";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import type { TokenConfig } from "@/lib/constants/token-metadata";
import { evmExplorerLink, type EvmExplorerSource } from "@/lib/explorer";
import { useEvmBalances } from "@/providers/evm-balances-context";
import { useEvmDeposit } from "@/providers/evm-deposit-context";
import { useEvmLocalFunding } from "@/providers/evm-local-funding-context";
import { useEvmWallet } from "@/providers/evm-wallet-context";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { useVault } from "@/providers/vault-context";

const SEND_GATE_ID = "deposit-transfer-send-gate";
const CONTINUE_GATE_ID = "deposit-transfer-continue-gate";

interface ControlGate {
  reason: string;
  nextAction: string;
  tone: "neutral" | "warning" | "error";
}

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
  const localFunding = useEvmLocalFunding();
  const vault = useVault();
  const binding = vault.binding;
  const readiness = useMidnightReadiness();
  const progress = useMidnightProgress();
  const [amount, setAmount] = useState("");
  const [fundingAddress, setFundingAddress] = useState<string | null>(null);
  const fundAddress = async (address: string): Promise<void> => {
    if (fundingAddress) return;
    setFundingAddress(address);
    try {
      await localFunding.fundLocalEthAddress(getAddress(address));
      toast.success("Local ETH funding completed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Local ETH funding failed.");
    } finally {
      setFundingAddress(null);
    }
  };
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
        : null;
  const continueGate: ControlGate | null = sweeping
    ? {
        reason: "This deposit is already being continued on Midnight.",
        nextAction: "Wait for the running continuation rather than starting a second one.",
        tone: "neutral",
      }
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
          Available: {formatUnits(tokenBalance.units, tokenBalance.decimals)} {token.symbol}
        </p>
      )}
      {balances.isError && (
        <Feedback tone="error" role="alert">
          Wallet balances unavailable. Open the EVM wallet menu to retry.
        </Feedback>
      )}
      <Label htmlFor={`deposit-amount-${token.symbol}`}>Amount ({token.symbol})</Label>
      <Input
        id={`deposit-amount-${token.symbol}`}
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
      {sendGate && (
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
      )}
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
          <p>Funding addresses</p>
          <PublicIdentifier
            value={binding.depositAddress}
            label="Deposit address"
            explorer={explorers.evmAddress(binding.depositAddress)}
          />
          <PublicIdentifier
            value={binding.vaultAddress}
            label="Vault address"
            explorer={explorers.evmAddress(binding.vaultAddress)}
          />
          {localFunding.fundingUnavailable ? (
            <p>Fund these addresses directly for the selected network.</p>
          ) : (
            <div className="ds-actions">
              <Button
                variant="outline"
                disabled={fundingAddress !== null || inFlight || sweeping}
                onClick={() => {
                  void fundAddress(binding.depositAddress);
                }}
              >
                Fund deposit address ETH
              </Button>
              <Button
                variant="outline"
                disabled={fundingAddress !== null || inFlight || sweeping}
                onClick={() => {
                  void fundAddress(binding.vaultAddress);
                }}
              >
                Fund vault address ETH
              </Button>
            </div>
          )}
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
                {continueGate && (
                  <DisabledReason
                    id={CONTINUE_GATE_ID}
                    label="Midnight continuation availability"
                    reason={continueGate.reason}
                    nextAction={continueGate.nextAction}
                    tone={continueGate.tone}
                  />
                )}
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
