// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { attributedLendingHistory, lendingNetCost } from "@/lib/midnight/lending-position";
import type { LendingPosition, MidnightTxRecord } from "@/lib/midnight/tx-history";

const position: LendingPosition = {
  deploymentFingerprint: `0x${"08".repeat(32)}`,
  commitment: "01".repeat(32),
  midnightNetwork: "undeployed",
  chainId: 11155111,
  vaultContract: "02".repeat(32),
  assetToken: `0x${"03".repeat(20)}`,
  shareToken: `0x${"04".repeat(20)}`,
  assetDecimals: 6,
  shareDecimals: 18,
};
const record: MidnightTxRecord = {
  id: "request",
  type: "Supply",
  fromSymbol: "USDC",
  fromAmount: "1 USDC",
  toSymbol: "shares",
  toAmount: "1 shares",
  timestampRaw: 1,
  status: "completed",
  position,
  assetUnits: "1000000",
  shareUnits: "1000000000000000000",
};

describe("public history ingress and lending attribution", () => {
  it("retains a completed local deposit with an explicitly unset explorer after reload", async () => {
    const deposit: MidnightTxRecord = {
      id: "3cd5333a18b35c5dab85cda8fd9471b54012dfb6180c3f50bf7d426c97ffb300",
      type: "Deposit",
      fromSymbol: "EVM",
      fromAmount: "0.1 USDC",
      toSymbol: "USDC",
      toAmount: "0.1 USDC",
      timestampRaw: 1,
      status: "completed",
      chainId: 11155111,
      rpcUrl: "http://localhost:8545",
      explorerUrl: "",
      txHash: `0x${"05".repeat(32)}`,
    };
    localStorage.setItem("midnight-tx-history-v1", JSON.stringify([deposit]));
    vi.resetModules();
    const { midnightTxHistory } = await import("@/lib/midnight/tx-history");
    const listener = vi.fn();
    const unsubscribe = midnightTxHistory.subscribe(listener);
    expect(listener).toHaveBeenCalledWith([deposit]);
    unsubscribe();
    localStorage.removeItem("midnight-tx-history-v1");
  });

  it("keeps interrupted observations and rejects malformed persisted records individually", async () => {
    const pending = {
      ...record,
      status: "pending",
      txHash: `0x${"05".repeat(32)}`,
      counterparty: position.assetToken,
    };
    const invalid = [
      { ...record, type: "Deposit", status: "refunded" },
      { ...record, explorerUrl: "javascript:alert(1)" },
      { ...record, txHash: "bogus" },
      { ...record, rpcUrl: "not a URL" },
      { ...record, type: "Invented" },
      { ...record, fromAmount: undefined },
      { ...record, basisAssets: "NaN" },
      { ...record, assetUnits: "1.5" },
      { ...record, timestampRaw: -1 },
      { ...record, position: { ...position, shareDecimals: -1 } },
    ];
    expect(invalid.length).toBeGreaterThan(0);
    localStorage.setItem("midnight-tx-history-v1", JSON.stringify([pending, ...invalid]));
    vi.resetModules();
    const { midnightTxHistory } = await import("@/lib/midnight/tx-history");
    const listener = vi.fn();
    const unsubscribe = midnightTxHistory.subscribe(listener);
    expect(listener).toHaveBeenCalledWith([
      { ...pending, status: "interrupted", failureReason: "Interrupted by a page reload" },
    ]);
    unsubscribe();
    localStorage.removeItem("midnight-tx-history-v1");
  });

  it("excludes equal balances attributed to different identities, deployments and token scales", () => {
    const mismatches: LendingPosition[] = [
      { ...position, deploymentFingerprint: `0x${"09".repeat(32)}` },
      { ...position, commitment: "06".repeat(32) },
      { ...position, vaultContract: "07".repeat(32) },
      { ...position, midnightNetwork: "preview" },
      { ...position, chainId: 1 },
      { ...position, shareToken: position.assetToken },
      { ...position, assetDecimals: 18 },
    ];
    expect(mismatches.length).toBeGreaterThan(0);
    for (const scope of mismatches) expect(attributedLendingHistory([record], scope)).toEqual([]);
    expect(attributedLendingHistory([{ ...record, position: undefined }], position)).toEqual([]);
    const attributed = attributedLendingHistory([record], position);
    expect(lendingNetCost(attributed, 1000000000000000000n)).toBe(1000000n);
    expect(lendingNetCost(attributed, 1n)).toBeNull();
  });

  it("retains integer precision through supply and redemption with unequal decimal scales", () => {
    const supply = {
      ...record,
      assetUnits: "9007199254740993000000",
      shareUnits: "9007199254740993000000000000000000",
    };
    const redeem = {
      ...record,
      type: "Redeem" as const,
      assetUnits: "1000001",
      shareUnits: "1000000000000000000",
    };
    expect(
      lendingNetCost([supply, redeem], BigInt(supply.shareUnits) - BigInt(redeem.shareUnits)),
    ).toBe(BigInt(supply.assetUnits) - 1000001n);
    expect(lendingNetCost([{ ...record, assetUnits: undefined }], 1000000000000000000n)).toBeNull();
  });
});
