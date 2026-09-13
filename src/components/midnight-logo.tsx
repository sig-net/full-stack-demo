import Image from "next/image";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Supplies the local Midnight mark used when the icon set has no network glyph.
 *
 * @param properties - Optional sizing and positioning classes.
 * @param properties.className - Optional sizing and positioning classes.
 * @returns The Midnight logomark with its accessible name.
 */
export function MidnightLogo(properties: { className?: string }): React.JSX.Element {
  const { className } = properties;
  return (
    <span
      className={cn(
        "ds-circle ds-surface flex shrink-0 items-center justify-center overflow-hidden",
        className,
      )}
      title="Midnight"
    >
      <Image
        src="/midnight/logomark.svg"
        alt="Midnight"
        width={28}
        height={28}
        className="h-full w-full"
        unoptimized
      />
    </span>
  );
}
