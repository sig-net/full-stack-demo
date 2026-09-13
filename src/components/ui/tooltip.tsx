"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Applies the local zero delay default while forwarding provider properties.
 *
 * @param properties - Provider properties and optional delay.
 * @returns The tooltip provider.
 */
function TooltipProvider(
  properties: React.ComponentProps<typeof TooltipPrimitive.Provider>,
): React.JSX.Element {
  const { delayDuration = 0, ...props } = properties;
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

/**
 * Coordinates a tooltip trigger and its content composition.
 *
 * @param properties - Tooltip root properties.
 * @returns The tooltip root.
 */
function Tooltip(
  properties: React.ComponentProps<typeof TooltipPrimitive.Root>,
): React.JSX.Element {
  return <TooltipPrimitive.Root data-slot="tooltip" {...properties} />;
}

/**
 * Provides the trigger slot for the shared tooltip composition.
 *
 * @param properties - Trigger properties.
 * @returns The tooltip trigger.
 */
function TooltipTrigger(
  properties: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
): React.JSX.Element {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...properties} />;
}

/**
 * Portals tooltip text and appends the positioned arrow to the content.
 *
 * @param properties - Content properties and optional side offset.
 * @returns The portalled tooltip content.
 */
function TooltipContent(
  properties: React.ComponentProps<typeof TooltipPrimitive.Content>,
): React.JSX.Element {
  const { className, sideOffset = 0, children, ...props } = properties;
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-foreground text-background data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md px-3 py-1.5 text-xs has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
