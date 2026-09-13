"use client";

import { Info, KeyRound } from "lucide-react";
import type * as React from "react";
import { useId, useRef, useState } from "react";
import { bytesToHex } from "viem";

import { Button } from "@/components/ui/button";
import { Feedback, StatusDot } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useVault } from "@/providers/vault-context";
import { useVaultIdentity } from "@/providers/vault-identity-context";

const identityHelp =
  "Your vault identity uses a separate secret from either wallet. Keep a copy: refresh requires re-entry. Losing it can prevent access to vault funds or completion of a pending deposit. Deposits transfer on EVM first, then require this identity to complete on Midnight.";

/**
 * Shares applied identity while each anchored editor owns its temporary input.
 *
 * @param props - Trigger reference and optional focus destination after connected activation.
 * @param props.triggerRef - Reference to the persistent toolbar trigger.
 * @param props.appliedFocusRef - Focus destination when applying can replace the home editor.
 * @returns The identity trigger and editor.
 */
export function VaultIdentityButton({
  triggerRef,
  appliedFocusRef,
}: {
  triggerRef?: React.Ref<HTMLButtonElement>;
  appliedFocusRef?: React.RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  const focusAfterApply = useRef(false);
  const inputId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const vault = useVault();
  const identity = useVaultIdentity();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [validation, setValidation] = useState("");
  const { copyToClipboard, isCopied, error, reset } = useCopyToClipboard();
  const changeOpen = (value: boolean): void => {
    if (value) focusAfterApply.current = false;
    setOpen(value);
    setInput(value ? identity.identitySecret : "");
    setValidation("");
    reset();
  };
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          size="xs"
          aria-label={`Vault identity: ${identity.identitySecret ? "set" : "not set"}`}
        >
          <KeyRound aria-hidden="true" />
          <span>Vault identity</span>
          <StatusDot tone={identity.identitySecret ? "success" : "neutral"} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        size="wide"
        align="end"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCloseAutoFocus={(event) => {
          if (focusAfterApply.current && appliedFocusRef?.current) {
            event.preventDefault();
            appliedFocusRef.current.focus();
          }
        }}
      >
        <PopoverHeader>
          <PopoverTitle id={titleId}>Vault identity</PopoverTitle>
          <PopoverDescription id={descriptionId}>{identityHelp}</PopoverDescription>
        </PopoverHeader>
        <form
          className="ds-stack-control"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              identity.setIdentitySecret(input);
              focusAfterApply.current = vault.status !== "disconnected";
              changeOpen(false);
            } catch (failure) {
              setValidation(
                failure instanceof Error ? failure.message : "Vault identity could not be applied.",
              );
            }
          }}
        >
          <Label htmlFor={inputId}>Vault secret</Label>
          <Input
            id={inputId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setValidation("");
              reset();
            }}
            aria-invalid={Boolean(validation)}
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
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              changeOpen(false);
            }}
          >
            Cancel
          </Button>
          {identity.identitySecret && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                identity.clearIdentity();
                changeOpen(false);
              }}
            >
              Clear vault identity
            </Button>
          )}
        </form>
        {vault.status === "missing-identity" && (
          <p role="status">Set a vault identity to load the vault.</p>
        )}
        {vault.status === "loading" && <p role="status">Loading vault…</p>}
        {vault.error && (
          <>
            <Feedback tone="error" role="alert">
              {vault.error}
            </Feedback>
            <Button variant="outline" onClick={vault.retry}>
              Retry vault
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Makes the identity retention warning available to keyboard and touch users.
 *
 * @returns The help trigger and anchored explanation.
 */
export function VaultIdentityHelp(): React.JSX.Element {
  const titleId = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="About vault identity">
          <Info aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-labelledby={titleId}>
        <PopoverTitle id={titleId}>Keep your vault secret</PopoverTitle>
        <PopoverDescription>{identityHelp}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
