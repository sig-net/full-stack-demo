"use client";

import { Check, Copy, Expand, ExternalLink } from "lucide-react";
import type * as React from "react";

import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { formatAddress } from "@/lib/address-utils";
import type { ExplorerAvailability } from "@/lib/explorer";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { DropdownMenuItem } from "./dropdown-menu";
import { Feedback } from "./feedback";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface PublicIdentifierProps {
  value: string;
  label: string;
  className?: string;
  inMenu?: boolean;
  explorer?: ExplorerAvailability;
}

/**
 * Value changes remount clipboard feedback so an earlier copy cannot label its replacement copied.
 *
 * @param properties - Public value, its semantic label and any explorer destination the caller
 *   resolved for this exact value. Never supply signing credentials.
 * @returns Truncated public value with independent copy, full-value and explorer controls.
 */
export function PublicIdentifier(properties: PublicIdentifierProps): React.JSX.Element {
  return <IdentifierValue key={properties.value} {...properties} />;
}

function IdentifierValue({
  value,
  label,
  className,
  inMenu = false,
  explorer,
}: PublicIdentifierProps): React.JSX.Element {
  const { isCopied, copyToClipboard, error } = useCopyToClipboard();
  if (!value) return <span className="ds-muted">Not available</span>;
  return (
    <div className={cn("ds-stack-control max-w-full min-w-0", className)}>
      <div className="ds-row ds-tight max-w-full min-w-0">
        <span className="ds-value ds-body truncate">{formatAddress(value)}</span>
        <IdentifierAction inMenu={inMenu}>
          <Button
            type="button"
            variant={inMenu ? "menu" : "ghost"}
            className={inMenu ? "w-9 shrink-0 justify-center" : undefined}
            size="icon-sm"
            aria-label={`Copy ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              void copyToClipboard(value);
            }}
          >
            {isCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </Button>
        </IdentifierAction>
        <Popover>
          <IdentifierAction inMenu={inMenu}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={inMenu ? "menu" : "ghost"}
                className={inMenu ? "w-9 shrink-0 justify-center" : undefined}
                size="icon-sm"
                aria-label={`Show full ${label}`}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <Expand aria-hidden="true" />
              </Button>
            </PopoverTrigger>
          </IdentifierAction>
          <PopoverContent
            aria-label={`Full ${label}`}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <p className="ds-label">{label}</p>
            <p className="ds-value ds-body break-all select-text">{value}</p>
            {explorer?.status === "unavailable" && (
              <p className="ds-caption ds-muted">{explorer.reason}</p>
            )}
          </PopoverContent>
        </Popover>
        {explorer?.status === "available" && (
          <IdentifierAction inMenu={inMenu}>
            <Button
              asChild
              variant={inMenu ? "menu" : "ghost"}
              className={inMenu ? "w-9 shrink-0 justify-center" : undefined}
              size="icon-sm"
            >
              <a
                href={explorer.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${explorer.label}: ${label}`}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          </IdentifierAction>
        )}
      </div>
      {isCopied && (
        <span role="status" className="ds-caption">
          Copied {label}
        </span>
      )}
      {error && (
        <Feedback tone="error" role="alert">
          {error.message}
        </Feedback>
      )}
    </div>
  );
}

function IdentifierAction({
  inMenu,
  children,
}: {
  inMenu: boolean;
  children: React.ReactElement;
}): React.JSX.Element {
  return inMenu ? (
    <DropdownMenuItem
      asChild
      onSelect={(event) => {
        event.preventDefault();
      }}
    >
      {children}
    </DropdownMenuItem>
  ) : (
    children
  );
}
