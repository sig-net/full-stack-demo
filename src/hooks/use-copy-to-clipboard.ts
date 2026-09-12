'use client';

import { useEffect, useRef, useState } from 'react';

export function useCopyToClipboard(resetDelay = 2000) {
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reset = () => {
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

  async function copyToClipboard(text: string) {
    reset();
    const attempt = request.current;
    const copied = () => {
      if (attempt !== request.current) return;
      setIsCopied(true);
      timer.current = setTimeout(() => {
        if (attempt === request.current) setIsCopied(false);
      }, resetDelay);
    };
    try {
      if (navigator?.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied();
        return;
      }

      const textArea = document.createElement('textarea');
      textArea.value = text;

      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.style.opacity = '0';
      textArea.style.pointerEvents = 'none';
      textArea.setAttribute('readonly', '');
      textArea.setAttribute('tabindex', '-1');

      document.body.appendChild(textArea);

      try {
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, text.length);
        if (navigator.userAgent.match(/ipad|iphone/i)) {
          const range = document.createRange();
          range.selectNodeContents(textArea);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
        if (!document.execCommand('copy'))
          throw new Error('Copy command failed');
      } finally {
        textArea.value = '';
        textArea.remove();
      }

      copied();
    } catch (err) {
      if (attempt !== request.current) return;
      setError(err instanceof Error ? err : new Error('Failed to copy'));
      setIsCopied(false);
    }
  }

  return { isCopied, copyToClipboard, error, reset };
}
