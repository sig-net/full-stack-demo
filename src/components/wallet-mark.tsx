"use client";

import { Wallet } from "lucide-react";
import Image from "next/image";
import type * as React from "react";
import { useState } from "react";

/**
 * Displays extension artwork while retaining the wallet glyph when loading fails.
 *
 * @param root0 - Wallet artwork properties.
 * @param root0.iconUrl - Optional extension-provided artwork URL.
 * @returns The wallet artwork or fallback glyph.
 */
export function WalletMark({ iconUrl }: { iconUrl?: string }): React.JSX.Element {
  const [failedUrl, setFailedUrl] = useState<string>();
  if (!iconUrl || failedUrl === iconUrl)
    return <Wallet className="size-4 shrink-0" aria-hidden="true" />;
  return (
    <Image
      src={iconUrl}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      unoptimized
      className="ds-round size-4 shrink-0"
      onError={() => {
        setFailedUrl(iconUrl);
      }}
    />
  );
}
