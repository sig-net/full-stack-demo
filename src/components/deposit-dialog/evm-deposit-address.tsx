"use client";

import type * as React from "react";
import { useState } from "react";

import { MidnightDustGate } from "@/components/midnight-dust-gate";
import { type ControlGate, DisabledReason } from "@/components/ui/disabled-reason";
import { VaultGasGate } from "@/components/vault-gas-gate";
import { useDepositAddressSweep } from "@/hooks/use-deposit-address-sweep";
import { useMidnightDustGate } from "@/hooks/use-midnight-dust-gate";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { useVaultGasReserves } from "@/hooks/use-vault-gas-reserves";
import type { NetworkData, TokenConfig } from "@/lib/constants/token-metadata";
import type { GasReserve } from "@/lib/evm/gas-reserve";
import { parseTokenAmount } from "@/lib/utils/token-amount";
import { useVaultOperations } from "@/providers/vault-operations-context";

import { DepositAddress } from "./deposit-address";
import { DepositAddressBalance } from "./deposit-address-balance";

const CONTINUE_GATE_ID = "deposit-address-continue-gate";
const CONTINUE_GATE_LABEL = "Deposit from address availability";

interface EvmDepositAddressProps {
  token: TokenConfig;
  network: NetworkData;
  depositAddress: string;
  isSubmitting: boolean;
  showContinue: boolean;
  onStartDeposit: (units: bigint) => void;
}

/**
 * Starts a sweep of tokens already held at the deposit address, without a transfer receipt.
 *
 * The amount is validated against the same observation the surface displays, and the authoritative
 * recheck happens inside the deposit itself, which reads the ledger again before signing anything.
 *
 * @param properties - Token, network, derived address and continuation state.
 * @param properties.token - Token being deposited.
 * @param properties.network - Applied network shown beside the address.
 * @param properties.depositAddress - Identity-derived address holding the unswept tokens.
 * @param properties.isSubmitting - Whether a vault operation already owns this surface.
 * @param properties.showContinue - Whether this entry point is the current deposit route.
 * @param properties.onStartDeposit - Starts the sweep for the exact validated base units.
 * @returns The deposit address surface with its balance, amount and blocking reason.
 */
export function EvmDepositAddress(properties: EvmDepositAddressProps): React.JSX.Element {
  const { token, network, depositAddress, isSubmitting, showContinue, onStartDeposit } = properties;
  const sweep = useDepositAddressSweep(token);
  const operations = useVaultOperations();
  const progress = useMidnightProgress();
  const gas = useVaultGasReserves();
  const dustGate = useMidnightDustGate();
  const [amount, setAmount] = useState("");
  const { balance } = sweep;

  let units: bigint | null = null;
  let amountError: string | null = null;
  if (amount.trim() && balance.decimals !== null) {
    try {
      const parsed = parseTokenAmount(amount, balance.decimals);
      if (balance.units !== null && parsed > balance.units)
        throw new Error(`The deposit address does not hold that much ${token.symbol}.`);
      units = parsed;
    } catch (failure) {
      amountError = failure instanceof Error ? failure.message : "Amount is unavailable.";
    }
  }

  const balanceGate: ControlGate | null =
    balance.reason !== null && balance.nextAction !== null
      ? { reason: balance.reason, nextAction: balance.nextAction, tone: balance.tone }
      : null;
  const operationGate: ControlGate | null = progress.active
    ? {
        reason: "Another vault operation owns the Midnight connection.",
        nextAction: "Wait for the running operation to finish, then deposit from this address.",
        tone: "neutral",
      }
    : null;
  const sweepReserve = gas.depositSweep.reserve;
  const sweepGateReserve: GasReserve | null =
    sweepReserve !== null && sweepReserve.kind !== "sufficient" ? sweepReserve : null;
  const amountGate: ControlGate | null = amountError
    ? {
        reason: amountError,
        nextAction: `Enter an amount at or below the unswept ${token.symbol} balance shown above.`,
        tone: "error",
      }
    : null;
  const plainGate: ControlGate | null = balanceGate ?? operationGate;
  const gate: ControlGate | null = plainGate ?? sweepGateReserve ?? dustGate ?? amountGate;
  const gateNode = plainGate ? (
    <DisabledReason id={CONTINUE_GATE_ID} label={CONTINUE_GATE_LABEL} {...plainGate} />
  ) : sweepGateReserve ? (
    <VaultGasGate
      reserve={sweepGateReserve}
      observation={gas.depositSweep}
      id={CONTINUE_GATE_ID}
      label={CONTINUE_GATE_LABEL}
    />
  ) : dustGate ? (
    <MidnightDustGate gate={dustGate} id={CONTINUE_GATE_ID} label={CONTINUE_GATE_LABEL} />
  ) : amountGate ? (
    <DisabledReason id={CONTINUE_GATE_ID} label={CONTINUE_GATE_LABEL} {...amountGate} />
  ) : null;

  return (
    <DepositAddress
      token={token}
      network={network}
      depositAddress={depositAddress}
      isSubmitting={isSubmitting}
      showContinue={showContinue}
      canContinue={gate === null && units !== null && operations.ready}
      onContinue={() => {
        if (units !== null) onStartDeposit(units);
      }}
      preparation={
        <DepositAddressBalance
          token={token}
          sweep={sweep}
          amount={amount}
          onAmountChange={setAmount}
          disabled={isSubmitting}
        />
      }
      continueGate={gateNode}
      continueGateId={CONTINUE_GATE_ID}
    />
  );
}
