"use client";

import { ClipboardPaste, Copy } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { TokenConfig } from "@/lib/constants/token-metadata";
import { REQUEST_ID_UNSUPPORTED } from "@/lib/explorer";
import { type DepositLookup, describeDepositLookup } from "@/lib/midnight/deposit-lookup";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

/**
 * Asks for the confirmed request ID to be stored outside the page while the deposit can still
 * need it, and states the prerequisites recovery actually enforces.
 *
 * Copy feedback reports the clipboard write only. Storing the ID durably stays with the user, so
 * a pressed control never claims the ID is saved.
 *
 * @param properties - Confirmed request and its settlement status.
 * @param properties.requestId - Ledger-confirmed deposit request ID.
 * @param properties.completed - Whether this deposit has already settled.
 * @returns The safekeeping panel with its own copy action and feedback.
 */
function SaveRequestIdWarning(properties: {
  requestId: string;
  completed: boolean;
}): React.JSX.Element {
  const { requestId, completed } = properties;
  const { isCopied, copyToClipboard, error } = useCopyToClipboard();
  return (
    <Feedback
      tone={completed ? "neutral" : "warning"}
      role="status"
      aria-label="Deposit request ID safekeeping"
    >
      <p className="ds-label">
        {completed
          ? "Deposit completed. Keep this request ID for your records."
          : "Save this deposit request ID."}
      </p>
      <p>
        {completed
          ? "Resuming this deposit does not need it. Activity keeps the request and its transactions for this browser."
          : "Copy it somewhere safe before closing or refreshing this page. You may need it to resume this deposit."}
      </p>
      <p>
        Resuming a deposit by its ID needs the same vault secret, network, vault deployment and
        token, so keep your vault secret safe as well. The deposit dialog also lists pending
        requests for this identity, so the ID is one route back to a deposit rather than the only
        one.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          void copyToClipboard(requestId);
        }}
      >
        <Copy aria-hidden="true" /> Copy request ID
      </Button>
      {isCopied && (
        <p className="ds-caption">
          Copied to the clipboard. Store it somewhere that survives closing this page.
        </p>
      )}
      {error && (
        <Feedback tone="error" role="alert">
          {error.message}
        </Feedback>
      )}
    </Feedback>
  );
}

function DepositLookupOutcome({ lookup }: { lookup: DepositLookup }): React.JSX.Element {
  const { summary, nextAction, tone } = describeDepositLookup(lookup);
  return (
    <Feedback
      tone={tone}
      role={tone === "error" ? "alert" : "status"}
      aria-label="Deposit request lookup"
    >
      <p className="ds-label">{summary}</p>
      <p>{nextAction}</p>
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
      <p className="ds-label">Current deposit request ID</p>
      {current?.requestId ? (
        <>
          <PublicIdentifier
            value={current.requestId}
            label="Deposit request ID"
            explorer={REQUEST_ID_UNSUPPORTED}
          />
          <p className="ds-body">
            Confirmed request{current.status === "completed" ? ", deposit completed" : ""}.
          </p>
          <SaveRequestIdWarning
            requestId={current.requestId}
            completed={current.status === "completed"}
          />
        </>
      ) : (
        <p className="ds-body">
          Request ID not available yet. It appears after the Midnight request is confirmed.
        </p>
      )}
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
          confirmed request ID.
        </p>
      )}
      {lookup && <DepositLookupOutcome lookup={lookup} />}
      {error && (
        <Feedback tone="error" role="alert">
          {error}
        </Feedback>
      )}
      <p className="ds-body">
        Copy a request ID from Activity to finish a deposit after its EVM sweep. The pending request
        supplies the amount. Recovery validates the selected token and vault identity.
      </p>
    </div>
  );
}

/**
 * Scopes the manual recovery draft and in-flight clipboard reads to the selected vault session.
 *
 * @param props - Selected token.
 * @param props.token - Token whose pending deposit is recovered.
 * @returns The current confirmed request and independent recovery controls.
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
