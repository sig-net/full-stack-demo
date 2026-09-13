"use client";

import type * as React from "react";
import { type RefObject, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Keeps the transient seed input in the dialog and restores focus on close.
 *
 * @param root0 - Seed wallet dialog properties.
 * @param root0.chainName - Chain label shown in the dialog.
 * @param root0.open - Whether the dialog is open.
 * @param root0.onOpenChange - Dialog state callback.
 * @param root0.onInstall - Seed installation callback.
 * @param root0.returnFocus - Trigger ref receiving focus after close.
 * @returns The seed wallet dialog.
 */
export function SeedWalletDialog({
  chainName,
  open,
  onOpenChange,
  onInstall,
  returnFocus,
}: {
  chainName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (seed: string) => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  const id = useId();
  const [seed, setSeed] = useState("");
  const changeOpen = (value: boolean): void => {
    setSeed("");
    onOpenChange(value);
  };
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{chainName} seed wallet</DialogTitle>
          <DialogDescription>
            A hexadecimal seed (16–64 bytes, optional 0x) creates a wallet that signs in this page.
            Keys stay in tab memory. Refresh requires re-entry. A wallet seed is separate from your
            vault identity secret.
          </DialogDescription>
        </DialogHeader>
        <form
          className="ds-stack-control"
          onSubmit={(event) => {
            event.preventDefault();
            const value = seed.trim();
            if (!value) return;
            changeOpen(false);
            onInstall(value);
          }}
        >
          <Label htmlFor={id}>{chainName} seed</Label>
          <Input
            id={id}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={seed}
            onChange={(event) => {
              setSeed(event.target.value);
            }}
          />
          <div className="ds-control-gap flex flex-wrap justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                changeOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!seed.trim()}>
              Install {chainName} seed wallet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
