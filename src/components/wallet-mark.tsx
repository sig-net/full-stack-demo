'use client';

import { useState } from 'react';
import { Wallet } from 'lucide-react';

export function WalletMark({ iconUrl }: { iconUrl?: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  if (!iconUrl || failedUrl === iconUrl)
    return <Wallet className='size-4 shrink-0' aria-hidden='true' />;
  return (
    // Extension artwork must remain an image source, never injected markup.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl}
      alt=''
      aria-hidden='true'
      className='size-4 shrink-0 rounded-sm'
      onError={() => setFailedUrl(iconUrl)}
    />
  );
}
