"use client";

import { Check, Copy, Loader2, TriangleAlert } from "lucide-react";
import type * as React from "react";
import { useState } from "react";

import { SettlementWaitEvidence } from "@/components/settlement-wait-detail";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import { useSettlementWait } from "@/hooks/use-settlement-wait";
import type { TokenConfig } from "@/lib/constants/token-metadata";
import { REQUEST_ID_UNSUPPORTED } from "@/lib/explorer";
import {
  DEPOSIT_STEP_COUNT,
  type DepositStepStatus,
  type DepositStepView,
  describeDepositSteps,
} from "@/lib/midnight/deposit-steps";
import { formatElapsed } from "@/lib/utils/date-formatting";
import { useVaultOperations } from "@/providers/vault-operations-context";

// The success line is read during a wait that lasts minutes, and a browser round trip can exceed a
// two second window entirely, so this panel keeps its confirmation on screen far longer.
const SAVE_COPY_FEEDBACK_MS = 10_000;

const MARKER_CLASS: Record<DepositStepStatus, string> = {
  pending: "ds-surface-muted ds-muted",
  active: "ds-surface-muted ds-text",
  complete: "ds-surface-success ds-success",
  attention: "ds-surface-warning ds-warning",
};

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
  const { isCopied, copyToClipboard, error } = useCopyToClipboard(SAVE_COPY_FEEDBACK_MS);
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

/**
 * @param properties - The step and the marker's accessible-name-free contents.
 * @param properties.step - Step whose state the marker represents.
 * @returns A decorative marker repeating the position and status already given as text.
 */
function StepMarker({ step }: { step: DepositStepView }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`ds-row ds-circle ds-frame ds-caption ds-label h-6 w-6 shrink-0 justify-center ${MARKER_CLASS[step.status]}`}
    >
      {step.status === "complete" ? (
        <Check className="h-3 w-3" />
      ) : step.status === "active" ? (
        <Loader2 className="ds-spinner h-3 w-3" />
      ) : step.status === "attention" ? (
        <TriangleAlert className="h-3 w-3" />
      ) : (
        step.position
      )}
    </span>
  );
}

/**
 * Presents one deposit as the contract's five numbered steps, fed by the published checkpoints.
 *
 * A step is ticked only from the evidence that proves it, so a resumed deposit shows exactly the
 * stages its checkpoints have established and a failed or unverified stage never carries a tick.
 * The failing step keeps its position and offers recovery beside it.
 *
 * @param properties - The selected token.
 * @param properties.token - Token whose deposit this view describes.
 * @returns The persistent five-step view for this token.
 */
export function DepositStepper({ token }: { token: TokenConfig }): React.JSX.Element {
  const progress = useMidnightProgress();
  const wait = useSettlementWait();
  const operations = useVaultOperations();
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const current =
    operations.currentDeposit?.token.toLowerCase() === token.erc20Address.toLowerCase()
      ? operations.currentDeposit
      : null;
  // The shared progress owner is exclusive, so its checkpoints describe this token's deposit only
  // while a deposit is running and no other token's request owns the run.
  const describesThisToken =
    progress.kind === "deposit" && (operations.currentDeposit === null || current !== null);
  const requestId = current?.requestId ?? null;
  const view = describeDepositSteps({
    events: describesThisToken ? progress.events : [],
    phaseMessage: describesThisToken ? progress.message : null,
    error: describesThisToken ? progress.error : null,
    active: describesThisToken && progress.active,
    waitHeadline: describesThisToken ? wait.headline : null,
    confirmedRequest: requestId !== null,
    settledDeposit: current?.status === "completed",
  });
  // A settled deposit has nothing left to resume, so recovery is offered only for a confirmed
  // request the operation owner has not reported settled.
  const recoverableRequestId = current?.status === "completed" ? null : requestId;

  return (
    <div className="ds-stack-control ds-divider-top ds-top-inset-content w-full">
      <p className="ds-label">Deposit steps</p>
      <p
        className="ds-muted ds-caption"
        role="status"
        aria-live="polite"
        aria-label="Deposit progress"
      >
        {view.announcement}
      </p>
      <ol className="ds-stack-content w-full">
        {view.steps.map((step) => (
          <li
            key={step.id}
            aria-current={step.id === view.current ? "step" : undefined}
            className="ds-row ds-control-gap w-full items-start"
          >
            <StepMarker step={step} />
            <div className="ds-stack-control min-w-0 flex-1">
              <p className="ds-label">
                {step.position.toString()} of {DEPOSIT_STEP_COUNT.toString()}. {step.label}
              </p>
              <p className="ds-muted ds-caption">{step.statusLabel}</p>
              {step.detail !== null && step.status !== "attention" && (
                <p className="ds-body">{step.detail}</p>
              )}
              {step.status === "active" && progress.stageElapsedMs !== null && (
                <p className="ds-muted ds-caption">
                  In this step for {formatElapsed(progress.stageElapsedMs)}.
                </p>
              )}
              {step.status === "active" && <SettlementWaitEvidence wait={wait} />}
              {step.status === "attention" && (
                <Feedback tone="error" role="alert" aria-label={`Step ${step.position.toString()}`}>
                  <p className="ds-label">{step.detail}</p>
                  <p>
                    The steps above keep the evidence they already have. Recovering this deposit
                    reuses its request and its signed sweep rather than creating a second one.
                  </p>
                  {recoverableRequestId !== null && (
                    <div className="ds-actions">
                      <Button
                        variant="outline"
                        disabled={operations.busy || !operations.ready}
                        onClick={() => {
                          setRecoveryError(null);
                          void operations
                            .recoverDeposit(token.erc20Address, recoverableRequestId)
                            .catch((failure: unknown) => {
                              setRecoveryError(
                                failure instanceof Error
                                  ? failure.message
                                  : "Deposit recovery failed.",
                              );
                            });
                        }}
                      >
                        Recover this deposit
                      </Button>
                    </div>
                  )}
                </Feedback>
              )}
              {step.id === "request" && step.status === "complete" && requestId !== null && (
                <>
                  <PublicIdentifier
                    value={requestId}
                    label="Deposit request ID"
                    explorer={REQUEST_ID_UNSUPPORTED}
                  />
                  <SaveRequestIdWarning
                    requestId={requestId}
                    completed={current?.status === "completed"}
                  />
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
      {recoveryError !== null && (
        <Feedback tone="error" role="alert">
          {recoveryError}
        </Feedback>
      )}
    </div>
  );
}
