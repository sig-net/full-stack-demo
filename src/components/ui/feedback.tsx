import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const feedbackVariants = cva(
  "ds-body ds-stack-control break-words rounded-lg border p-(--space-content)",
  {
    variants: {
      tone: {
        error: "border-destructive/30 bg-destructive-foreground text-destructive",
        warning: "border-warning/30 bg-warning-foreground text-warning",
        success: "border-success/30 bg-success-foreground text-success",
        neutral: "border-border bg-muted text-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

/**
 * Pairs a semantic feedback tone with caller supplied text and ARIA semantics.
 *
 * @param properties - Feedback content, tone and semantic attributes.
 * @param properties.tone - Semantic tone used by the shared feedback roles.
 * @returns The feedback panel.
 */
export function Feedback(
  properties: ComponentProps<"div"> & VariantProps<typeof feedbackVariants>,
): React.JSX.Element {
  const { tone, className, ...props } = properties;
  return (
    <div data-slot="feedback" className={cn(feedbackVariants({ tone }), className)} {...props} />
  );
}

/**
 * Provides an aria-hidden marker that requires adjacent textual status.
 *
 * @param properties - Bounded status tone.
 * @param properties.tone - Semantic tone represented by the marker.
 * @returns The decorative status marker.
 */
export function StatusDot(properties: {
  tone?: "neutral" | "success" | "error" | "warning" | "pending";
}): React.JSX.Element {
  const { tone = "neutral" } = properties;
  return (
    <span
      aria-hidden="true"
      data-slot="status-dot"
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        {
          neutral: "bg-muted-foreground",
          success: "bg-success",
          error: "bg-destructive",
          warning: "bg-warning",
          pending: "bg-link animate-pulse",
        }[tone],
      )}
    />
  );
}
