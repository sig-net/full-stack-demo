"use client";

import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { formatUnits, getAddress } from "viem";

import { EvmWalletButton } from "@/components/evm-wallet-button";
import { Button } from "@/components/ui/button";
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
  const pending =
    transfer?.status === "approving" ||
    transfer?.status === "confirming" ||
    transfer?.sweep === "pending";
  const currentTransfer =
    transfer !== null &&
    transfer.binding === vault.binding &&
    transfer.token === token.erc20Address;
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
        disabled={pending}
      />
      <Button
        disabled={
          !eligibility.ready ||
          !readiness.ready ||
          !evm.wallet ||
          !vault.binding ||
          pending ||
          !amount.trim()
        }
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
        {transfer?.sweep === "pending"
          ? "Transfer confirmed"
          : pending
            ? "Transfer pending…"
            : "Send tokens to deposit address"}
      </Button>
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
                disabled={fundingAddress !== null || pending}
                onClick={() => {
                  void fundAddress(binding.depositAddress);
                }}
              >
                Fund deposit address ETH
              </Button>
              <Button
                variant="outline"
                disabled={fundingAddress !== null || pending}
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
          {transfer.error && (
            <Feedback tone="error" role="alert">
              {transfer.error}
            </Feedback>
          )}
          {transfer.status === "confirmed" &&
            (currentTransfer ? (
              <Button
                disabled={!readiness.ready || progress.active || transfer.sweep !== "ready"}
                onClick={() => void deposit.continueDeposit()}
              >
                {transfer.sweep === "complete"
                  ? "Midnight deposit complete"
                  : transfer.sweep === "pending"
                    ? "Midnight deposit pending…"
                    : "Continue with Midnight deposit"}
              </Button>
            ) : (
              <p>
                This transfer belongs to another vault session. Its tokens remain at the destination
                shown.
              </p>
            ))}
          {transfer.hash && transfer.status === "error" && (
            <p>Check the submitted transaction before sending again.</p>
          )}
        </div>
      )}
    </div>
  );
}
