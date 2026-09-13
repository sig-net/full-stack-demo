"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Rejects unavailable clipboard access and prevents superseded requests from publishing feedback.
 *
 * @param resetDelay - Milliseconds before successful copy feedback clears.
 * @returns Copy feedback and actions scoped to the current mounted consumer.
 */
export function useCopyToClipboard(resetDelay = 2000): {
  isCopied: boolean;
  error: Error | null;
  copyToClipboard: (text: string) => Promise<void>;
  reset: () => void;
} {
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reset = (): void => {
    request.current += 1;
    if (timer.current) clearTimeout(timer.current);
    setIsCopied(false);
    setError(null);
  };
  useEffect(
    () => () => {
      request.current += 1;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copyToClipboard(text: string): Promise<void> {
    reset();
    const attempt = request.current;
    const copied = (): void => {
      if (attempt !== request.current) return;
      setIsCopied(true);
      timer.current = setTimeout(() => {
        if (attempt === request.current) setIsCopied(false);
      }, resetDelay);
    };
    try {
      if (!window.isSecureContext || typeof navigator.clipboard === "undefined")
        throw new Error(
          "Clipboard access is unavailable. Open this app on HTTPS or localhost, then try again.",
        );
      await navigator.clipboard.writeText(text);
      copied();
    } catch (err) {
      if (attempt !== request.current) return;
      setError(err instanceof Error ? err : new Error("Failed to copy"));
      setIsCopied(false);
    }
  }

  return { isCopied, copyToClipboard, error, reset };
}
