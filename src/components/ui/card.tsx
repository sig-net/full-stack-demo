import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Propagates the density variant through card group data attributes.
 *
 * @param properties - Container properties and the card density variant.
 * @returns The card container.
 */
function Card(
  properties: React.ComponentProps<"div"> & { size?: "default" | "sm" },
): React.JSX.Element {
  const { className, size = "default", ...props } = properties;
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card bg-card text-card-foreground ring-foreground/10 flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl py-(--card-spacing) text-sm ring-1 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Adapts header columns and rows to the presence of action and description slots.
 *
 * @param properties - Container properties and optional class names.
 * @returns The card header.
 */
function CardHeader(properties: React.ComponentProps<"div">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Inherits the card density variant through the enclosing card group.
 *
 * @param properties - Container properties and optional class names.
 * @returns The card title.
 */
function CardTitle(properties: React.ComponentProps<"div">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <div
      data-slot="card-title"
      className={cn(
        "cn-font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Marks the description slot used by the card header layout selectors.
 *
 * @param properties - Container properties and optional class names.
 * @returns The card description.
 */
function CardDescription(properties: React.ComponentProps<"div">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

/**
 * Marks the action slot used by the card header column layout.
 *
 * @param properties - Container properties and optional class names.
 * @returns The card action.
 */
function CardAction(properties: React.ComponentProps<"div">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

/**
 * Uses the enclosing card spacing token for content padding.
 *
 * @param properties - Container properties and optional class names.
 * @returns The card content.
 */
function CardContent(properties: React.ComponentProps<"div">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <div
      data-slot="card-content"
      className={cn("flex flex-col gap-(--space-content) px-(--card-spacing)", className)}
      {...props}
    />
  );
}

/**
 * Uses the card footer slot to scope its border and spacing treatment.
 *
 * @param properties - Container properties and optional class names.
 * @returns The card footer.
 */
function CardFooter(properties: React.ComponentProps<"div">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "bg-muted/50 flex items-center rounded-b-xl border-t p-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
