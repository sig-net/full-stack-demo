"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Keeps wide table content inside a horizontally scrollable container.
 *
 * @param properties - Table properties and optional class names.
 * @returns The scrollable table container.
 */
function Table(properties: React.ComponentProps<"table">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

/**
 * Applies the shared header row border treatment.
 *
 * @param properties - Table header properties.
 * @returns The table header.
 */
function TableHeader(properties: React.ComponentProps<"thead">): React.JSX.Element {
  const { className, ...props } = properties;
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

/**
 * Removes the trailing border from the final body row.
 *
 * @param properties - Table body properties.
 * @returns The table body.
 */
function TableBody(properties: React.ComponentProps<"tbody">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

/**
 * Groups footer rows with the shared muted surface and border.
 *
 * @param properties - Table footer properties.
 * @returns The table footer.
 */
function TableFooter(properties: React.ComponentProps<"tfoot">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("bg-muted/50 border-t font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

/**
 * Clickable rows activate on Enter or Space only when the row itself owns focus.
 * Nested links and controls retain their own keyboard behaviour.
 *
 * @param properties - Row properties with optional click activation.
 * @returns The table row.
 */
function TableRow(properties: React.ComponentProps<"tr">): React.JSX.Element {
  const { className, onClick, ...props } = properties;
  return (
    <tr
      data-slot="table-row"
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                event.currentTarget.click();
              }
            }
          : undefined
      }
      className={cn(
        "hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Provides the shared table heading alignment and checkbox spacing.
 *
 * @param properties - Table heading properties.
 * @returns The table heading.
 */
function TableHead(properties: React.ComponentProps<"th">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Provides the shared table cell alignment and checkbox spacing.
 *
 * @param properties - Table cell properties.
 * @returns The table cell.
 */
function TableCell(properties: React.ComponentProps<"td">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <td
      data-slot="table-cell"
      className={cn("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

/**
 * Places supporting table text below the table surface.
 *
 * @param properties - Caption properties.
 * @returns The table caption.
 */
function TableCaption(properties: React.ComponentProps<"caption">): React.JSX.Element {
  const { className, ...props } = properties;
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
