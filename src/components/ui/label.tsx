"use client";

import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Preserves label association properties such as `htmlFor` through the Radix primitive.
 *
 * @param properties - Label primitive properties and optional class names.
 * @returns The label element with shared text styles.
 */
function Label(properties: React.ComponentProps<typeof LabelPrimitive.Root>): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
