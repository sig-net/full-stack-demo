"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Coordinates this module's trigger and content composition.
 *
 * @param properties - Popover root properties.
 * @returns The popover root.
 */
function Popover(
  properties: React.ComponentProps<typeof PopoverPrimitive.Root>,
): React.JSX.Element {
  return <PopoverPrimitive.Root data-slot="popover" {...properties} />;
}

/**
 * Provides the trigger slot for the shared popover composition.
 *
 * @param properties - Popover trigger properties.
 * @returns The popover trigger.
 */
function PopoverTrigger(
  properties: React.ComponentProps<typeof PopoverPrimitive.Trigger>,
): React.JSX.Element {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...properties} />;
}

/**
 * Portals popover content and applies the bounded default or wide layout.
 *
 * @param properties - Content properties and popover layout options.
 * @returns The portalled popover content.
 */
function PopoverContent(
  properties: React.ComponentProps<typeof PopoverPrimitive.Content> & {
    size?: "default" | "wide";
  },
): React.JSX.Element {
  const { className, align = "center", sideOffset = 4, size = "default", ...props } = properties;
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 z-50 flex max-h-[min(85dvh,var(--radix-popover-content-available-height))] w-72 max-w-[calc(100vw-2rem)] origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 overflow-y-auto rounded-lg p-2.5 text-sm shadow-md ring-1 outline-hidden duration-100",
          size === "wide" && "w-96",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/**
 * Provides an anchor element for popover positioning.
 *
 * @param properties - Popover anchor properties.
 * @returns The popover anchor.
 */
function PopoverAnchor(
  properties: React.ComponentProps<typeof PopoverPrimitive.Anchor>,
): React.JSX.Element {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...properties} />;
}

/**
 * Groups popover heading content with its local spacing.
 *
 * @param properties - Header container properties.
 * @returns The popover header.
 */
function PopoverHeader(properties: React.ComponentProps<"div">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  );
}

/**
 * Marks the popover title slot.
 *
 * @param properties - Title properties.
 * @returns The popover title.
 */
function PopoverTitle(properties: React.ComponentProps<"h2">): React.JSX.Element {
  const { className, ...props } = properties;
  return <div data-slot="popover-title" className={cn("font-medium", className)} {...props} />;
}

/**
 * Marks the popover description slot.
 *
 * @param properties - Description properties.
 * @returns The popover description.
 */
function PopoverDescription(properties: React.ComponentProps<"p">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
