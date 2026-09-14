"use client";

import { parseRequestIdHex } from "@sig-net/midnight";
import { ClipboardPaste } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import type { TokenConfig } from "@/lib/constants/token-metadata";
import { REQUEST_ID_UNSUPPORTED } from "@/lib/explorer";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

function DepositRecoveryForm({ token }: { token: TokenConfig }): React.JSX.Element {
  const [recoveryRequestId, setRecoveryRequestId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const clipboardAttempt = useRef(0);
  useEffect(
    () => () => {
      clipboardAttempt.current += 1;
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
    setRecoveryRequestId(value);
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
    setError(null);
    try {
      const id = parseRequestIdHex(recoveryRequestId.trim());
      await operations.recoverDeposit(token.erc20Address, id);
    } catch (failure) {
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
