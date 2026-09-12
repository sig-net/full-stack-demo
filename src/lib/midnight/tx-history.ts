'use client';

// Persist operation history so the lend widget can reconstruct its cost basis.

export type MidnightTxType =
  | 'Deposit'
  | 'Withdraw'
  | 'Swap'
  | 'Supply'
  | 'Redeem';
export type MidnightTxStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface MidnightTxRecord {
  id: string;
  type: MidnightTxType;
  fromSymbol: string;
  fromAmount: string; // pre-formatted, may be an address for the WALLET side
  toSymbol: string;
  toAmount: string;
  counterparty?: string; // deposit address / withdraw destination
  status: MidnightTxStatus;
  timestampRaw: number; // unix seconds
  txHash?: string; // Sepolia tx hash, when known
  // Keep the node's failure verdict inspectable after the toast dismisses.
  failureReason?: string;
  // Cost basis for the lend position, recorded per leg so the widget can show earnings. Assets are
  // in underlying units (Aave USDC), shares in stataUSDC units. The widget needs BOTH sides: the
  // assets give the basis, and the shares prove the history accounts for the whole position.
  /** Assets supplied on a Supply leg. */
  basisAssets?: string;
  /** Shares the wrapper minted for a Supply leg, as attested by the MPC. */
  sharesReceived?: string;
  /** Assets received on a Redeem leg, as attested by the MPC. */
  proceedsAssets?: string;
  /** Shares burned on a Redeem leg. */
  sharesBurned?: string;
}

type Listener = (txs: MidnightTxRecord[]) => void;

const STORAGE_KEY = 'midnight-tx-history-v1';
// Bound the log so a long-lived browser cannot grow it without limit. Oldest records drop first.
const MAX_RECORDS = 200;

function isRecord(value: unknown): value is MidnightTxRecord {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Partial<MidnightTxRecord>;
  return (
    typeof rec.id === 'string' &&
    typeof rec.type === 'string' &&
    typeof rec.status === 'string' &&
    typeof rec.timestampRaw === 'number'
  );
}

function load(): MidnightTxRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A flow cannot resume across a reload, so a stored 'pending' would spin for ever. Mark it
    // failed instead: the row stays inspectable and the widget still ignores it.
    return parsed
      .filter(isRecord)
      .slice(0, MAX_RECORDS)
      .map(rec =>
        rec.status === 'pending'
          ? {
              ...rec,
              status: 'failed' as const,
              failureReason:
                rec.failureReason ?? 'Interrupted by a page reload',
            }
          : rec,
      );
  } catch {
    return [];
  }
}

function save(txs: MidnightTxRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
  } catch {
    // Quota exhausted or storage blocked (private mode). The log stays in memory for this page.
  }
}

class MidnightTxHistory {
  private txs: MidnightTxRecord[] = load();
  private listeners = new Set<Listener>();

  /** Insert (or replace by id) a record, newest first. */
  add(rec: MidnightTxRecord) {
    this.txs = [rec, ...this.txs.filter(t => t.id !== rec.id)].slice(
      0,
      MAX_RECORDS,
    );
    this.emit();
  }

  /** Patch an existing record (e.g. pending -> completed/failed/refunded, add a tx hash). */
  update(id: string, patch: Partial<MidnightTxRecord>) {
    this.txs = this.txs.map(t => (t.id === id ? { ...t, ...patch } : t));
    this.emit();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.txs);
    return () => {
      this.listeners.delete(l);
    };
  }

  private emit() {
    const snap = this.txs;
    save(snap);
    for (const l of this.listeners) l(snap);
  }
}

export const midnightTxHistory = new MidnightTxHistory();
