import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingState({
  message = 'Loading...',
  size = 'md',
  className,
}: LoadingStateProps) {
  const sizeConfig = {
    sm: { icon: 16, text: 'ds-body' },
    md: { icon: 24, text: 'ds-prose' },
    lg: { icon: 32, text: 'ds-subheading' },
  };

  const config = sizeConfig[size];

  return (
    <div
      className={cn(
        'ds-stack ds-content-gap ds-inset-section items-center justify-center',
        className,
      )}
    >
      <Loader2 className='ds-text ds-spinner' size={config.icon} />
      <p className={cn('ds-text', config.text)}>{message}</p>
    </div>
  );
}
