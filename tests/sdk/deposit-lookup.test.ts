import { parseRequestIdHex } from "@sig-net/midnight";
import { expect, it } from "vitest";

import {
  type DepositLookup,
  type DepositLookupKind,
  type DepositLookupMismatch,
  describeDepositLookup,
} from "@/lib/midnight/deposit-lookup";

const REQUEST_ID = parseRequestIdHex("ab".repeat(32));

const CASES: readonly { lookup: DepositLookup; tone: "neutral" | "warning" | "error" }[] = [
  { lookup: { kind: "looking-up" }, tone: "neutral" },
  { lookup: { kind: "recoverable", requestId: REQUEST_ID, units: 1000000n }, tone: "neutral" },
  { lookup: { kind: "completed", requestId: REQUEST_ID }, tone: "neutral" },
  { lookup: { kind: "not-found", requestId: REQUEST_ID }, tone: "warning" },
  { lookup: { kind: "mismatched", requestId: REQUEST_ID, mismatch: "identity" }, tone: "warning" },
  { lookup: { kind: "mismatched", requestId: REQUEST_ID, mismatch: "token" }, tone: "warning" },
  {
    lookup: { kind: "mismatched", requestId: REQUEST_ID, mismatch: "deployment" },
    tone: "warning",
  },
  { lookup: { kind: "malformed" }, tone: "error" },
  { lookup: { kind: "error", cause: "indexer unavailable" }, tone: "error" },
];

// Adding a kind or a mismatch without a case here fails typecheck through these records and fails
// the suite through the set comparisons below.
const EVERY_KIND: Record<DepositLookupKind, true> = {
  "looking-up": true,
  recoverable: true,
  completed: true,
  "not-found": true,
  mismatched: true,
  malformed: true,
  error: true,
};
const EVERY_MISMATCH: Record<DepositLookupMismatch, true> = {
  identity: true,
  token: true,
  deployment: true,
};

it("describes every lookup outcome with its own summary, next action and tone", () => {
  expect(CASES.length).toBeGreaterThan(0);
  for (const { lookup, tone } of CASES) {
    const message = describeDepositLookup(lookup);
    expect(message.summary.length).toBeGreaterThan(0);
    expect(message.nextAction.length).toBeGreaterThan(0);
    expect(message.tone).toBe(tone);
  }
  const summaries = CASES.map(({ lookup }) => describeDepositLookup(lookup).summary);
  expect(new Set(summaries).size).toBe(CASES.length);
});

it("covers every kind and every mismatch the lookup can report", () => {
  const kinds = Object.keys(EVERY_KIND);
  const mismatches = Object.keys(EVERY_MISMATCH);
  expect(kinds.length).toBeGreaterThan(0);
  expect(mismatches.length).toBeGreaterThan(0);
  expect(new Set(CASES.map(({ lookup }) => lookup.kind))).toEqual(new Set(kinds));
  expect(
    new Set(CASES.flatMap(({ lookup }) => (lookup.kind === "mismatched" ? [lookup.mismatch] : []))),
  ).toEqual(new Set(mismatches));
});

it("states the contract's absence wording without claiming the deposit never happened", () => {
  const absent = describeDepositLookup({ kind: "not-found", requestId: REQUEST_ID });
  expect(absent.summary).toBe(
    "No pending deposit found for this request in the selected vault and network. It may already be completed, or the request may not have been created here.",
  );
  expect(absent.nextAction).toBe("Check your network, vault and request ID.");
  const unreadable = describeDepositLookup({ kind: "error", cause: "indexer unavailable" });
  expect(unreadable.nextAction).toContain("nothing here says whether the deposit happened");
});
