"use client";

import { ClipboardPaste } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import { useMidnightTransactions } from "@/hooks/use-midnight-transactions";
import type { TokenConfig } from "@/lib/constants/token-metadata";
import { type DepositLookup, describeDepositLookup } from "@/lib/midnight/deposit-lookup";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

/**
 * Renders one resolved lookup, with the transaction details a completed request can prove.
 *
 * @param properties - The outcome being reported.
 * @param properties.lookup - Outcome reported by the data layer.
 * @returns The outcome panel.
 */
function DepositLookupOutcome({ lookup }: { lookup: DepositLookup }): React.JSX.Element {
  const { summary, nextAction, tone } = describeDepositLookup(lookup);
  const activity = useMidnightTransactions();
  // Completing a deposit removes its signature request from the ledger, so a chain read cannot
  // supply the settled sweep. The operation record this browser kept is the source of both
  // settlement legs, and a request settled elsewhere simply shows none.
  const record =
    lookup.kind === "completed"
      ? (activity.find((entry) => entry.id === lookup.requestId) ?? null)
      : null;
  return (
    <Feedback
      tone={tone}
      role={tone === "error" ? "alert" : "status"}
      aria-label="Deposit request lookup"
    >
      <p className="ds-label">{summary}</p>
      <p>{nextAction}</p>
      {record?.evmTransactionHash != null && (
        <>
          <p className="ds-body">EVM settlement transaction</p>
          <PublicIdentifier
            value={record.evmTransactionHash}
            label="Completed deposit sweep transaction hash"
            explorer={record.explorer.evmTransaction}
          />
        </>
      )}
      {record?.midnightTransactionHash != null && (
        <>
          <p className="ds-body">Midnight settlement transaction</p>
          <PublicIdentifier
            value={record.midnightTransactionHash}
            label="Completed deposit Midnight transaction hash"
            explorer={record.explorer.midnightTransaction}
          />
        </>
      )}
    </Feedback>
  );
}

function DepositRecoveryForm({ token }: { token: TokenConfig }): React.JSX.Element {
  const [recoveryRequestId, setRecoveryRequestId] = useState("");
  const [lookup, setLookup] = useState<DepositLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clipboardAttempt = useRef(0);
  const recoveryAttempt = useRef(0);
  useEffect(
    () => () => {
      clipboardAttempt.current += 1;
      recoveryAttempt.current += 1;
    },
    [],
  );
  const operations = useVaultOperations();
  const readiness = useMidnightReadiness();
  const vault = useVault();
  const current =
    operations.currentDeposit?.token.toLowerCase() === token.erc20Address.toLowerCase()
      ? operations.currentDeposit
      : null;
  const changeDraft = (value: string): void => {
    clipboardAttempt.current += 1;
    recoveryAttempt.current += 1;
    setRecoveryRequestId(value);
    setLookup(null);
    setError(null);
  };
  const paste = async (): Promise<void> => {
    const attempt = ++clipboardAttempt.current;
    setError(null);
    try {
      if (
        !window.isSecureContext ||
        typeof navigator.clipboard === "undefined" ||
        typeof navigator.clipboard.readText !== "function"
      )
        throw new Error(
          "Clipboard reading is unavailable. Paste the request ID using your keyboard.",
        );
      const value = await navigator.clipboard.readText();
      if (attempt !== clipboardAttempt.current) return;
      changeDraft(value);
      if (!value.trim())
        setError("The clipboard is empty. Copy a deposit request ID from Activity.");
    } catch {
      if (attempt === clipboardAttempt.current)
        setError(
          "Unable to read the clipboard. Allow clipboard access or paste using your keyboard.",
        );
    }
  };
  const recover = async (): Promise<void> => {
    const attempt = ++recoveryAttempt.current;
    setError(null);
    setLookup({ kind: "looking-up" });
    const outcome = await operations.lookupDepositRequest(
      token.erc20Address,
      recoveryRequestId.trim(),
    );
    if (attempt !== recoveryAttempt.current) return;
    setLookup(outcome);
    if (outcome.kind !== "recoverable") return;
    try {
      await operations.recoverDeposit(token.erc20Address, outcome.requestId);
    } catch (failure) {
      if (attempt !== recoveryAttempt.current) return;
      setError(failure instanceof Error ? failure.message : "Deposit recovery failed.");
    }
  };
  return (
    <div className="ds-stack-control ds-divider-top ds-top-inset-content">
      <Label htmlFor={`recover-deposit-${token.symbol}`}>Recover a deposit by request ID</Label>
      <Input
        id={`recover-deposit-${token.symbol}`}
        value={recoveryRequestId}
        onChange={(event) => {
          changeDraft(event.target.value);
        }}
        disabled={operations.busy}
      />
      <div className="ds-actions">
        <Button variant="outline" disabled={operations.busy} onClick={() => void paste()}>
          <ClipboardPaste /> Paste request ID
        </Button>
        {current?.requestId && (
          <Button
            variant="outline"
            disabled={operations.busy || current.status === "completed"}
            onClick={() => {
              if (current.requestId) changeDraft(current.requestId);
            }}
          >
            Use current request
          </Button>
        )}
      </div>
      <Button
        disabled={
          !readiness.ready ||
          !vault.binding ||
          operations.busy ||
          !operations.ready ||
          !recoveryRequestId.trim()
        }
        onClick={() => void recover()}
      >
        Recover pending deposit
      </Button>
      {operations.busy && (
        <p className="ds-body">
          Recovery is unavailable while a vault operation is in progress. You can still copy its
          confirmed request ID from the steps above.
        </p>
      )}
      {lookup && <DepositLookupOutcome lookup={lookup} />}
      {error && (
        <Feedback tone="error" role="alert">
          {error}
        </Feedback>
      )}
      <p className="ds-body">
        Pasting a request ID resolves it first and resumes it at the earliest stage its evidence
        leaves incomplete. The pending request supplies the amount, and recovery validates the
        selected token and vault identity.
      </p>
    </div>
  );
}

/**
 * Scopes the manual recovery draft and in-flight clipboard reads to the selected vault session.
 *
 * @param props - Selected token.
 * @param props.token - Token whose pending deposit is recovered.
 * @returns The read-only request resolution and recovery controls.
 */
export function PendingDepositRecovery({ token }: { token: TokenConfig }): React.JSX.Element {
  const vault = useVault();
  return (
    <DepositRecoveryForm
      key={`${vault.binding?.sessionId ?? "unbound"}:${token.erc20Address}`}
      token={token}
    />
  );
}
