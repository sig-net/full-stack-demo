'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { queryClient } from '@/lib/query-client';
import { MidnightProvider } from './midnight-context';
import { MidnightProgressToaster } from '@/components/midnight-progress-toaster';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MidnightProvider>
        {children}
        <MidnightProgressToaster />
      </MidnightProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
