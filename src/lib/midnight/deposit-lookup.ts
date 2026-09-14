import type { RequestIdHex } from "@sig-net/midnight";

/** Recorded field whose value rules a request out of recovery under the current session. */
export type DepositLookupMismatch = "identity" | "token" | "deployment";

/**
 * Distinct results of resolving one deposit request ID against the selected vault and network.
 *
 * `completed` is reported only from observed evidence. Absence from the pending view is reported
 * as `not-found`, which cannot distinguish a settled deposit from one that was never created here.
 */
export type DepositLookup =
  | { readonly kind: "looking-up" }
  | { readonly kind: "recoverable"; readonly requestId: RequestIdHex; readonly units: bigint }
  | { readonly kind: "completed"; readonly requestId: RequestIdHex }
  | { readonly kind: "not-found"; readonly requestId: RequestIdHex }
  | {
      readonly kind: "mismatched";
      readonly requestId: RequestIdHex;
      readonly mismatch: DepositLookupMismatch;
    }
  | { readonly kind: "malformed" }
  | { readonly kind: "error"; readonly cause: string };

/** Every kind a lookup can report, so a surface can prove it renders the whole set. */
export type DepositLookupKind = DepositLookup["kind"];

/** Rendered form of one lookup outcome, shared by every surface that reports a resolution. */
export interface DepositLookupMessage {
  readonly summary: string;
  readonly nextAction: string;
  readonly tone: "neutral" | "warning" | "error";
}

const MISMATCH_MESSAGE: Record<DepositLookupMismatch, DepositLookupMessage> = {
  identity: {
    summary: "This pending deposit belongs to another vault identity.",
    nextAction: "Apply the vault secret that created the request, then check the ID again.",
    tone: "warning",
  },
  token: {
    summary: "This pending deposit uses a different token.",
    nextAction: "Select the token the request was created for, then check the ID again.",
    tone: "warning",
  },
  deployment: {
    summary: "The selected vault deployment holds no initialised vault.",
    nextAction: "Check the configured vault contract address and network, then try again.",
    tone: "warning",
  },
};

/**
 * Renders one lookup outcome with the wording the deposit dialog contract fixes for absence.
 *
 * @param lookup - Outcome reported by the data layer.
 * @returns Summary, next action and semantic tone for the shared feedback components.
 */
export function describeDepositLookup(lookup: DepositLookup): DepositLookupMessage {
  switch (lookup.kind) {
    case "looking-up":
      return {
        summary: "Checking this deposit request ID.",
        nextAction: "Reading the request from the selected vault and network.",
        tone: "neutral",
      };
    case "recoverable":
      return {
        summary: "This deposit request can be resumed.",
        nextAction: "The pending request supplies the amount, so no second request is created.",
        tone: "neutral",
      };
    case "completed":
      return {
        summary: "Already completed.",
        nextAction: "This request was settled on this vault. Activity holds its transactions.",
        tone: "neutral",
      };
    case "not-found":
      return {
        summary:
          "No pending deposit found for this request in the selected vault and network. It may already be completed, or the request may not have been created here.",
        nextAction: "Check your network, vault and request ID.",
        tone: "warning",
      };
    case "mismatched":
      return MISMATCH_MESSAGE[lookup.mismatch];
    case "malformed":
      return {
        summary: "That is not a deposit request ID.",
        nextAction: "A request ID is 64 hexadecimal characters. Paste it exactly as it was copied.",
        tone: "error",
      };
    case "error":
      return {
        summary: "The deposit request ID could not be checked.",
        nextAction:
          "The vault ledger could not be read, so nothing here says whether the deposit happened. Try again once the node and indexer respond.",
        tone: "error",
      };
  }
}
