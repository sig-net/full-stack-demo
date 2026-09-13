"use client";

import { Check, Copy } from "lucide-react";
import type * as React from "react";

import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

import { Button } from "./button";

interface TruncatedTextProps {
  text: string;
  maxLength?: number;
  showTooltip?: boolean;
  className?: string;
  copyable?: boolean;
  prefixLength?: number;
  suffixLength?: number;
  ellipsis?: string;
}

/**
 * Keeps long identifiers readable and optionally exposes the full value through a title.
 * Copyable output uses the shared Button so the copied state remains visible.
 *
 * @param properties - Text, truncation lengths and copy or tooltip options.
 * @returns The truncated text with optional copy action.
 */
export function TruncatedText(properties: TruncatedTextProps): React.JSX.Element {
  const {
    text,
    maxLength = 20,
    showTooltip = true,
    className,
    copyable = false,
    prefixLength,
    suffixLength,
    ellipsis = "...",
  } = properties;
  const { isCopied, copyToClipboard, error } = useCopyToClipboard();

  const getTruncatedText = (): string => {
    if (!text) return "";
    if (text.length <= maxLength) return text;

    if (prefixLength !== undefined && suffixLength !== undefined) {
      return `${text.slice(0, prefixLength)}${ellipsis}${text.slice(-suffixLength)}`;
    }

    return `${text.slice(0, maxLength - ellipsis.length)}${ellipsis}`;
  };

  const truncatedText = getTruncatedText();
  const isTextTruncated = truncatedText !== text;

  const content = (
    <>
      <span className="ds-value ds-body">{truncatedText}</span>
      {copyable && (isCopied ? <Check /> : <Copy />)}
    </>
  );
  const title = showTooltip && isTextTruncated ? text : undefined;
  return copyable ? (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => void copyToClipboard(text)}
        title={title}
        aria-label={`Copy ${truncatedText}`}
      >
        {content}
      </Button>
      {error && (
        <span className="ds-body" role="alert">
          {error.message}
        </span>
      )}
    </>
  ) : (
    <span className={cn("inline-flex items-center", className)} title={title}>
      {content}
    </span>
  );
}
