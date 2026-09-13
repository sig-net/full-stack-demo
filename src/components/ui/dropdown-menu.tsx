"use client";

import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Coordinates this module's trigger, content and item composition.
 *
 * @param properties - Dropdown root properties.
 * @returns The dropdown root.
 */
function DropdownMenu(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.Root>,
): React.JSX.Element {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...properties} />;
}

/**
 * Provides the portal boundary for dropdown content.
 *
 * @param properties - Portal properties.
 * @returns The dropdown portal.
 */
function DropdownMenuPortal(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>,
): React.JSX.Element {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...properties} />;
}

/**
 * Provides the trigger slot for the shared dropdown composition.
 *
 * @param properties - Trigger properties.
 * @returns The dropdown trigger.
 */
function DropdownMenuTrigger(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
): React.JSX.Element {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...properties} />;
}

/**
 * Portals the menu surface and applies bounded alignment defaults.
 *
 * @param properties - Content properties and positioning options.
 * @returns The portalled dropdown content.
 */
function DropdownMenuContent(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.Content>,
): React.JSX.Element {
  const { className, align = "start", sideOffset = 4, ...props } = properties;
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "cn-menu-target cn-menu-translucent bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 z-50 max-h-(--radix-dropdown-menu-content-available-height) w-72 max-w-[calc(100vw-2rem)] min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg p-1 shadow-md ring-1 duration-100 data-[state=closed]:overflow-hidden",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

/**
 * Groups related items within the shared dropdown composition.
 *
 * @param properties - Group properties.
 * @returns The dropdown group.
 */
function DropdownMenuGroup(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.Group>,
): React.JSX.Element {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...properties} />;
}

/**
 * Keeps item highlight, disabled state and destructive tone on the menu item.
 *
 * @param properties - Item properties and bounded presentation options.
 * @returns The dropdown item.
 */
function DropdownMenuItem(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    variant?: "default" | "destructive";
  },
): React.JSX.Element {
  const { className, inset, variant = "default", ...props } = properties;
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item data-highlighted:bg-accent focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:*:[svg]:text-destructive relative flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Adds a menu item indicator while preserving the checkbox state.
 *
 * @param properties - Checkbox item properties and inset option.
 * @returns The dropdown checkbox item.
 */
function DropdownMenuCheckboxItem(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
    inset?: boolean;
  },
): React.JSX.Element {
  const { className, children, checked, inset, ...props } = properties;
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "data-highlighted:bg-accent focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground relative flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

/**
 * Groups radio items under one selected value in the menu composition.
 *
 * @param properties - Radio group properties.
 * @returns The dropdown radio group.
 */
function DropdownMenuRadioGroup(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
): React.JSX.Element {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...properties} />;
}

/**
 * Adds a menu item indicator while preserving the radio state.
 *
 * @param properties - Radio item properties and inset option.
 * @returns The dropdown radio item.
 */
function DropdownMenuRadioItem(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
    inset?: boolean;
  },
): React.JSX.Element {
  const { className, children, inset, ...props } = properties;
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "data-highlighted:bg-accent focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground relative flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

/**
 * Aligns a non-interactive label with inset menu items.
 *
 * @param properties - Label properties and inset option.
 * @returns The dropdown label.
 */
function DropdownMenuLabel(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean },
): React.JSX.Element {
  const { className, inset, ...props } = properties;
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "text-muted-foreground px-1.5 py-1 text-xs font-medium data-inset:pl-7",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Separates menu groups with the shared border treatment.
 *
 * @param properties - Separator properties.
 * @returns The dropdown separator.
 */
function DropdownMenuSeparator(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>,
): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

/**
 * Aligns a keyboard shortcut label at the end of a menu row.
 *
 * @param properties - Shortcut span properties.
 * @returns The shortcut label.
 */
function DropdownMenuShortcut(properties: React.ComponentProps<"span">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground ml-auto text-xs tracking-widest",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Coordinates a nested branch within the shared dropdown composition.
 *
 * @param properties - Submenu properties.
 * @returns The dropdown submenu.
 */
function DropdownMenuSub(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>,
): React.JSX.Element {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...properties} />;
}

/**
 * Opens a nested branch and keeps its chevron aligned with inset content.
 *
 * @param properties - Submenu trigger properties and inset option.
 * @returns The submenu trigger.
 */
function DropdownMenuSubTrigger(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  },
): React.JSX.Element {
  const { className, inset, children, ...props } = properties;
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "data-highlighted:bg-accent focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="cn-rtl-flip ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

/**
 * Applies the nested menu surface, positioning tokens and open or closed animations.
 *
 * @param properties - Submenu content properties.
 * @returns The submenu content.
 */
function DropdownMenuSubContent(
  properties: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>,
): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "cn-menu-target cn-menu-translucent bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 z-50 min-w-[96px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg p-1 shadow-lg ring-1 duration-100",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
