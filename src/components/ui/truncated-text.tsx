'use client';

import { Button } from './button';
import { Check, Copy } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

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

export function TruncatedText({
  text,
  maxLength = 20,
  showTooltip = true,
  className,
  copyable = false,
  prefixLength,
  suffixLength,
  ellipsis = '...',
}: TruncatedTextProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  const getTruncatedText = () => {
    if (!text) return '';
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
      <span className='ds-value ds-body'>{truncatedText}</span>
      {copyable && (isCopied ? <Check /> : <Copy />)}
    </>
  );
  const title = showTooltip && isTextTruncated ? text : undefined;
  return copyable ? (
    <Button
      variant='ghost'
      size='sm'
      className={className}
      onClick={() => void copyToClipboard(text)}
      title={title}
      aria-label={`Copy ${truncatedText}`}
    >
      {content}
    </Button>
  ) : (
    <span className={cn('inline-flex items-center', className)} title={title}>
      {content}
    </span>
  );
}
