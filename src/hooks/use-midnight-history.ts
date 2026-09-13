"use client";

import { useEffect, useState } from "react";

import { midnightTxHistory, type MidnightTxRecord } from "@/lib/midnight/tx-history";

/**
 * Shares the history owner's subscription lifecycle across Activity and position projections.
 *
 * @returns The latest validated public operation records.
 */
export function useMidnightHistory(): MidnightTxRecord[] {
  const [records, setRecords] = useState<MidnightTxRecord[]>([]);
  useEffect(() => midnightTxHistory.subscribe(setRecords), []);
  return records;
}
