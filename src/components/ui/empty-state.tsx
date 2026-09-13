import type { LucideIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  iconClassName?: string;
  compact?: boolean;
}

/**
 * Composes an empty or compact state with an optional recovery action.
 *
 * @param properties - Empty-state content, icon and layout options.
 * @returns The empty-state surface.
 */
export function EmptyState(properties: EmptyStateProps): React.JSX.Element {
  const {
    icon: Icon,
    title,
    description,
    action,
    className,
    iconClassName,
    compact = false,
  } = properties;
  return (
    <div
      className={cn(
        "ds-row justify-center",
        compact ? "ds-block-inset-section" : "min-h-[60vh]",
        className,
      )}
    >
      <div
        className={cn(
          "ds-stack items-center justify-center text-center",
          compact
            ? "ds-inset-section max-w-md"
            : "ds-inset-section sm:ds-inset-section md:ds-inset-section max-w-2xl",
        )}
      >
        {Icon && (
          <div
            className={cn(
              "ds-row ds-circle ds-after-content justify-center",
              compact ? "h-16 w-16" : "h-20 w-20",
              "ds-surface",
              iconClassName,
            )}
          >
            <Icon className={cn("ds-muted", compact ? "h-8 w-8" : "h-10 w-10")} />
          </div>
        )}

        <h2
          className={cn(
            "ds-text ds-label ds-after-content",
            compact ? "ds-heading" : "ds-title sm:ds-display",
          )}
        >
          {title}
        </h2>

        {description && (
          <p
            className={cn(
              "ds-text ds-after-section text-center",
              compact ? "ds-prose max-w-sm" : "ds-prose sm:ds-subheading max-w-md",
            )}
          >
            {description}
          </p>
        )}

        {action && <div className={compact ? "" : "ds-before-content"}>{action}</div>}
      </div>
    </div>
  );
}
