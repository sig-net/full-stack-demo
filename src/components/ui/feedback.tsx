import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const feedbackVariants = cva(
  'ds-body ds-stack-control break-words rounded-lg border p-(--space-content)',
  {
    variants: {
      tone: {
        error:
          'border-destructive/30 bg-destructive-foreground text-destructive',
        warning: 'border-warning/30 bg-warning-foreground text-warning',
        success: 'border-success/30 bg-success-foreground text-success',
        neutral: 'border-border bg-muted text-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Feedback({
  tone,
  className,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof feedbackVariants>) {
  return (
    <div
      data-slot='feedback'
      className={cn(feedbackVariants({ tone }), className)}
      {...props}
    />
  );
}

export function StatusDot({
  tone = 'neutral',
}: {
  tone?: 'neutral' | 'success' | 'error' | 'warning' | 'pending';
}) {
  return (
    <span
      aria-hidden='true'
      data-slot='status-dot'
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        {
          neutral: 'bg-muted-foreground',
          success: 'bg-success',
          error: 'bg-destructive',
          warning: 'bg-warning',
          pending: 'bg-link animate-pulse',
        }[tone],
      )}
    />
  );
}
