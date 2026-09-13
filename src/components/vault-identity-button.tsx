"use client";

import type * as React from "react";
import { useRef, useState } from "react";
import { bytesToHex } from "viem";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Feedback } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useVault } from "@/providers/vault-context";

/**
 * Opens the vault identity dialog from a menu item or standalone trigger.
 *
 * @param root0 - Identity control properties.
 * @param root0.menuItem - Whether to render the menu item trigger.
 * @returns The identity trigger and dialog.
 */
export function VaultIdentityButton({
  menuItem = false,
}: {
  menuItem?: boolean;
}): React.JSX.Element {
  const trigger = useRef<HTMLButtonElement>(null);
  const vault = useVault();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [validation, setValidation] = useState("");
  const { copyToClipboard, isCopied, error, reset } = useCopyToClipboard();
  const changeOpen = (value: boolean): void => {
    setOpen(value);
    setInput(value ? vault.identitySecret : "");
    setValidation("");
    reset();
  };
  const control = (
    <Button
      ref={trigger}
      variant={menuItem ? "menu" : "outline"}
      onClick={() => {
        changeOpen(true);
      }}
    >
      {vault.identitySecret ? "Vault identity" : "Set vault identity"}
    </Button>
  );
  return (
    <>
      {menuItem ? (
        <DropdownMenuItem
          asChild
          onSelect={(event) => {
            event.preventDefault();
          }}
        >
          {control}
        </DropdownMenuItem>
      ) : (
        control
      )}
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Vault identity</DialogTitle>
            <DialogDescription>
              Generate or paste an independent 32-byte secret. Keep a copy to access this identity
              again. It stays in page memory and refresh requires re-entry.
            </DialogDescription>
          </DialogHeader>
          <form
            className="ds-stack-control"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                vault.setIdentitySecret(input);
                changeOpen(false);
              } catch (failure) {
                setValidation((failure as Error).message);
              }
            }}
          >
            <Label htmlFor="vault-secret">Vault secret</Label>
            <Input
              id="vault-secret"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setValidation("");
                reset();
              }}
              placeholder="64 hexadecimal characters"
            />
            {validation && (
              <Feedback tone="error" role="alert">
                {validation}
              </Feedback>
            )}
            <div className="ds-control-gap flex">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setInput(bytesToHex(crypto.getRandomValues(new Uint8Array(32))).slice(2));
                  reset();
                  setValidation("");
                }}
              >
                Generate secret
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!input}
                onClick={() => void copyToClipboard(input)}
              >
                {isCopied ? "Copied" : "Copy secret"}
              </Button>
            </div>
            {error && (
              <Feedback tone="error" role="alert">
                {error.message}
              </Feedback>
            )}
            <Button type="submit" disabled={!input.trim()}>
              Use vault secret
            </Button>
            {vault.identitySecret && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  vault.clearIdentity();
                  changeOpen(false);
                }}
              >
                Clear vault identity
              </Button>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
