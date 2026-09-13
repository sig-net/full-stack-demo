"use client";

import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { formatUnits } from "viem";

import { EvmWalletButton } from "@/components/evm-wallet-button";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEvmDepositEligibility } from "@/hooks/use-evm-deposit-eligibility";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import type { TokenConfig } from "@/lib/constants/token-metadata";
import { useEvmBalances } from "@/providers/evm-balances-context";
import { useEvmDeposit } from "@/providers/evm-deposit-context";
import { useEvmWallet } from "@/providers/evm-wallet-context";
import { useVault } from "@/providers/vault-context";
import { useWalletReadiness } from "@/providers/wallet-readiness-context";

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
  const readiness = useWalletReadiness();
  const progress = useMidnightProgress();
  const [amount, setAmount] = useState("");
  const eligibility = useEvmDepositEligibility(
    token.erc20Address,
    amount,
    vault.binding?.depositAddress,
  );
  const transfer = deposit.transfer;
  const explorer = transfer !== null ? transfer.explorerUrl : evm.wallet?.explorerUrl;
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
      {evm.wallet && <p className="ds-body break-all">{evm.wallet.account}</p>}
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
        {pending ? "Transfer pending…" : "Send tokens to deposit address"}
      </Button>
      {amount.trim() && eligibility.error && (
        <Feedback tone="error" role="alert">
          {eligibility.error}
        </Feedback>
      )}
      {!vault.binding && (
        <p>Connect Midnight and load your vault identity to obtain a deposit address.</p>
      )}
      {transfer && (
        <div className="ds-stack-control ds-body">
          <p>Transfer: {transfer.status}</p>
          <p className="break-all">Destination: {transfer.destination}</p>
          {transfer.hash &&
            (explorer ? (
              <a
                className="block break-all"
                href={`${explorer}/tx/${transfer.hash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {transfer.hash}
              </a>
            ) : (
              <p className="break-all">{transfer.hash}</p>
            ))}
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
