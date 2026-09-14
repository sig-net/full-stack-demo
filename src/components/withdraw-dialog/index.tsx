"use client";

import type * as React from "react";
import { toast } from "sonner";

import { MidnightDustGate } from "@/components/midnight-dust-gate";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VaultGasGate } from "@/components/vault-gas-gate";
import { useMidnightDustGate } from "@/hooks/use-midnight-dust-gate";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { useVaultGasReserves } from "@/hooks/use-vault-gas-reserves";
import { parseTokenAmount } from "@/lib/utils/token-amount";
import { useVaultBalances } from "@/providers/vault-balances-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { AmountInput } from "./amount-input";

/**
 * Describes the token and receiver network used by the withdrawal form.
 */
export interface WithdrawToken {
  symbol: string;
  name: string;
  chain: "ethereum" | "midnight";
  chainName: string;
  address: string;
  balance: string;
  decimals: number;
}

const WITHDRAW_DUST_GATE_ID = "withdraw-dust-gate";
const WITHDRAW_GAS_GATE_ID = "withdraw-vault-gas-gate";

interface WithdrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTokens: WithdrawToken[];
  preSelectedToken?: WithdrawToken | null;
}

function WithdrawDialogContent({
  availableTokens,
  preSelectedToken,
  onClose,
}: {
  availableTokens: WithdrawToken[];
  preSelectedToken?: WithdrawToken | null;
  onClose: () => void;
}): React.JSX.Element {
  const operations = useVaultOperations();
  const balances = useVaultBalances();
  const vault = useVault();
  const midnight = useMidnightProgress();
  const dustGate = useMidnightDustGate();
  const gas = useVaultGasReserves();
  const withdrawReserve = gas.reserveFor("withdraw");
  const gasGate =
    withdrawReserve !== null && withdrawReserve.kind !== "sufficient" ? withdrawReserve : null;

  const handleAmountSubmit = (data: {
    token: WithdrawToken;
    amount: string;
    receiverAddress: string;
  }): void => {
    if (midnight.active) {
      toast.error("Transaction in progress", {
        description: "Please wait for the current transaction to complete",
      });
      return;
    }
    if (data.token.chain === "midnight") {
      try {
        vault.requireBinding();
        const token = balances.balances?.perToken[data.token.address.toLowerCase()];
        if (token?.decimals == null || token.vaultUnits == null)
          throw new Error("Balance or token decimals are unavailable. Refresh and retry.");
        const units = parseTokenAmount(data.amount, token.decimals);
        if (units > token.vaultUnits) throw new Error("Insufficient shielded balance.");
        void operations
          .withdraw(data.token.address, units, data.receiverAddress)
          .catch(() => undefined);
        onClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Withdrawal is unavailable.");
      }
    }
  };

  return (
    <>
      <DialogTitle>Send</DialogTitle>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AmountInput
          availableTokens={availableTokens}
          transactionReady={operations.ready && gasGate === null}
          onSubmit={handleAmountSubmit}
          preSelectedToken={preSelectedToken}
          disabledReason={
            <>
              {dustGate && (
                <MidnightDustGate
                  gate={dustGate}
                  id={WITHDRAW_DUST_GATE_ID}
                  label="Midnight fee readiness for sending"
                />
              )}
              {gasGate && (
                <VaultGasGate
                  reserve={gasGate}
                  observation={gas.vaultOperations}
                  id={WITHDRAW_GAS_GATE_ID}
                  label="Vault ETH reserve for sending"
                />
              )}
            </>
          }
          disabledReasonId={
            [dustGate ? WITHDRAW_DUST_GATE_ID : null, gasGate ? WITHDRAW_GAS_GATE_ID : null]
              .filter((id) => id !== null)
              .join(" ") || undefined
          }
        />
      </div>
    </>
  );
}

/**
 * Coordinates the withdrawal dialog state with the amount form and operation owner.
 *
 * @param root0 - Dialog properties.
 * @param root0.open - Whether the dialog content is mounted.
 * @param root0.onOpenChange - Callback for opening or closing the dialog.
 * @param root0.availableTokens - Tokens that the form can submit.
 * @param root0.preSelectedToken - Optional token selected by the parent entry point.
 * @returns The withdrawal dialog.
 */
export function WithdrawDialog({
  open,
  onOpenChange,
  availableTokens,
  preSelectedToken,
}: WithdrawDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <WithdrawDialogContent
            availableTokens={availableTokens}
            preSelectedToken={preSelectedToken}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
