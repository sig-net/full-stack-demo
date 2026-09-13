"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Coordinates this module's trigger, content and close composition.
 *
 * @param properties - Dialog root properties.
 * @returns The dialog root.
 */
function Dialog(properties: React.ComponentProps<typeof DialogPrimitive.Root>): React.JSX.Element {
  return <DialogPrimitive.Root data-slot="dialog" {...properties} />;
}

/**
 * Provides the trigger slot for the shared dialog composition.
 *
 * @param properties - Dialog trigger properties.
 * @returns The dialog trigger.
 */
function DialogTrigger(
  properties: React.ComponentProps<typeof DialogPrimitive.Trigger>,
): React.JSX.Element {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...properties} />;
}

/**
 * Provides the dialog portal boundary used by overlay content.
 *
 * @param properties - Dialog portal properties.
 * @returns The dialog portal.
 */
function DialogPortal(
  properties: React.ComponentProps<typeof DialogPrimitive.Portal>,
): React.JSX.Element {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...properties} />;
}

/**
 * Connects a control to the dialog close action.
 *
 * @param properties - Dialog close properties.
 * @returns The dialog close control.
 */
function DialogClose(
  properties: React.ComponentProps<typeof DialogPrimitive.Close>,
): React.JSX.Element {
  return <DialogPrimitive.Close data-slot="dialog-close" {...properties} />;
}

/**
 * Covers the page behind dialog content and carries the modal transition states.
 *
 * @param properties - Overlay properties and optional class names.
 * @returns The dialog overlay.
 */
function DialogOverlay(
  properties: React.ComponentProps<typeof DialogPrimitive.Overlay>,
): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 bg-overlay/10 fixed inset-0 isolate z-50 duration-100 supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Places modal content in the portal and optionally adds the shared close control.
 *
 * @param properties - Content properties and close control preference.
 * @returns The portalled dialog content.
 */
function DialogContent(
  properties: React.ComponentProps<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
  },
): React.JSX.Element {
  const { className, children, showCloseButton = true, ...props } = properties;
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl p-4 text-sm ring-1 duration-100 outline-none sm:max-w-md",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/**
 * Groups dialog heading content with the shared vertical spacing.
 *
 * @param properties - Header container properties.
 * @returns The dialog header.
 */
function DialogHeader(properties: React.ComponentProps<"div">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <div data-slot="dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />
  );
}

/**
 * Groups dialog actions and can append a standard close action.
 *
 * @param properties - Footer properties and close action preference.
 * @returns The dialog footer.
 */
function DialogFooter(
  properties: React.ComponentProps<"div"> & { showCloseButton?: boolean },
): React.JSX.Element {
  const { className, showCloseButton = false, children, ...props } = properties;
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "bg-muted/50 -mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t p-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

/**
 * Supplies the title slot used by the dialog's accessible naming.
 *
 * @param properties - Dialog title properties.
 * @returns The dialog title.
 */
function DialogTitle(
  properties: React.ComponentProps<typeof DialogPrimitive.Title>,
): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("cn-font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  );
}

/**
 * Supplies descriptive dialog text and shared inline link treatment.
 *
 * @param properties - Dialog description properties.
 * @returns The dialog description.
 */
function DialogDescription(
  properties: React.ComponentProps<typeof DialogPrimitive.Description>,
): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
