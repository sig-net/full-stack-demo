import type * as React from "react";

import { Feedback } from "@/components/ui/feedback";

/** One condition a surface derives once to both block a control and explain the block. */
export interface ControlGate {
  reason: string;
  nextAction: string;
  tone: "neutral" | "warning" | "error";
}

interface DisabledReasonProps extends ControlGate {
  id: string;
  label: string;
  action?: React.ReactNode;
}

/**
 * States why an associated operation control is disabled and offers the step that clears it.
 *
 * The `id` is the association contract: every control this panel explains must carry it in
 * `aria-describedby`, so the reason reaches assistive technology that cannot rely on proximity.
 *
 * @param properties - Association identity, reason content, tone and optional recovery control.
 * @param properties.id - Element id referenced by each explained control.
 * @param properties.label - Accessible name distinguishing this panel from other live regions.
 * @param properties.reason - Observed condition blocking the operation.
 * @param properties.nextAction - Step that clears the condition.
 * @param properties.tone - Semantic tone chosen from the shared feedback set.
 * @param properties.action - Optional control performing the next action.
 * @returns The disabled-reason panel.
 */
export function DisabledReason(properties: DisabledReasonProps): React.JSX.Element {
  const { id, label, reason, nextAction, tone, action } = properties;
  return (
    <Feedback id={id} tone={tone} role={tone === "error" ? "alert" : "status"} aria-label={label}>
      <p className="ds-label">{reason}</p>
      <p>{nextAction}</p>
      {action}
    </Feedback>
  );
}
