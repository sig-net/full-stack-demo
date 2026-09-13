"use client";

import { z } from "zod";

const transactionTypeSchema = z.enum(["Deposit", "Withdraw", "Swap", "Supply", "Redeem"]);
const transactionStatusSchema = z.enum([
  "pending",
  "completed",
  "failed",
  "refunded",
  "interrupted",
]);
const unsignedUnitsSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const decimalSchema = z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const positionSchema = z.object({
  deploymentFingerprint: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  commitment: z.string().regex(/^[0-9a-fA-F]{64}$/),
  midnightNetwork: z.string().min(1),
  chainId: z.number().int().positive(),
  vaultContract: z.string().min(1),
  assetToken: addressSchema,
  shareToken: addressSchema,
  assetDecimals: z.number().int().min(0).max(255),
  shareDecimals: z.number().int().min(0).max(255),
});
/** Public identity and asset scope required before attributing lending history. */
export type LendingPosition = z.infer<typeof positionSchema>;
const transactionRecordSchema = z
  .object({
    id: z.string().min(1),
    type: transactionTypeSchema,
    fromSymbol: z.string().min(1),
    fromAmount: z.string(),
    toSymbol: z.string().min(1),
    toAmount: z.string(),
    counterparty: z.string().optional(),
    status: transactionStatusSchema,
    timestampRaw: z.number().int().nonnegative(),
    txHash: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .optional(),
    networkId: z.string().optional(),
    chainId: z.number().int().positive().optional(),
    rpcUrl: z.url({ protocol: /^https?$/ }).optional(),
    explorerUrl: z.url({ protocol: /^https?$/ }).optional(),
    vaultContractAddress: z.string().optional(),
    failureReason: z.string().optional(),
    position: positionSchema.optional(),
    assetUnits: unsignedUnitsSchema.optional(),
    shareUnits: unsignedUnitsSchema.optional(),
    basisAssets: decimalSchema.optional(),
    sharesReceived: decimalSchema.optional(),
    proceedsAssets: decimalSchema.optional(),
    sharesBurned: decimalSchema.optional(),
  })
  .refine((record) => record.type !== "Deposit" || record.status !== "refunded", {
    message: "Deposits cannot have a refunded outcome.",
  });

/** Operation categories retained in Activity and lending cost-basis history. */
export type MidnightTxType = z.infer<typeof transactionTypeSchema>;
/** Recorded observation and settlement states. */
export type MidnightTxStatus = z.infer<typeof transactionStatusSchema>;
/**
 * Persisted public operation record with display amount strings and Unix-second timestamps.
 * Cost-basis fields retain underlying and wrapper quantities separately as decimal strings.
 */
export type MidnightTxRecord = z.infer<typeof transactionRecordSchema>;

type Listener = (txs: MidnightTxRecord[]) => void;

const STORAGE_KEY = "midnight-tx-history-v1";
// Bound the log so a long-lived browser cannot grow it without limit. Oldest records drop first.
const MAX_RECORDS = 200;

function load(): MidnightTxRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    const records = z.array(z.unknown()).safeParse(parsed);
    if (!records.success) return [];
    // Reload interrupts observation without establishing a chain outcome.
    return records.data
      .flatMap((value) => {
        const record = transactionRecordSchema.safeParse(value);
        return record.success ? [record.data] : [];
      })
      .slice(0, MAX_RECORDS)
      .map((rec) =>
        rec.status === "pending"
          ? {
              ...rec,
              status: "interrupted" as const,
              failureReason: rec.failureReason ?? "Interrupted by a page reload",
            }
          : rec,
      );
  } catch {
    return [];
  }
}

function save(txs: MidnightTxRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
  } catch {
    // Quota exhausted or storage blocked (private mode). The log stays in memory for this page.
  }
}

class MidnightTxHistory {
  private txs: MidnightTxRecord[] = load();
  private listeners = new Set<Listener>();

  add(rec: MidnightTxRecord): void {
    this.txs = [rec, ...this.txs.filter((t) => t.id !== rec.id)].slice(0, MAX_RECORDS);
    this.emit();
  }

  update(id: string, patch: Partial<MidnightTxRecord>): void {
    this.txs = this.txs.map((t) => (t.id === id ? { ...t, ...patch } : t));
    this.emit();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.txs);
    return () => {
      this.listeners.delete(l);
    };
  }

  private emit(): void {
    const snap = this.txs;
    save(snap);
    for (const l of this.listeners) l(snap);
  }
}

/** Bounded history owner sharing in-memory updates and persisted public operation records. */
export const midnightTxHistory = new MidnightTxHistory();
