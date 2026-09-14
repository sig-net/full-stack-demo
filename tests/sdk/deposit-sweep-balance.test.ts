import { expect, it } from "vitest";

import {
  type DepositSweepInput,
  type DepositSweepKind,
  describeDepositSweepBalance,
} from "@/lib/midnight/deposit-sweep";

const BASE: DepositSweepInput = {
  bound: true,
  loading: false,
  failed: false,
  units: 10_000_000n,
  decimals: 6,
  pendingRequests: [],
  pendingFailed: false,
  symbol: "USDC",
};

const REQUEST = { requestId: "ab".repeat(32), units: 4_000_000n };

const CASES: readonly (readonly [string, Partial<DepositSweepInput>, DepositSweepKind])[] = [
  ["no vault identity", { bound: false }, "unbound"],
  ["a first read in flight", { loading: true, units: null, decimals: null }, "checking"],
  ["a failed balance read", { failed: true }, "unavailable"],
  ["an absent settled read", { units: null }, "unavailable"],
  ["unavailable token precision", { decimals: null }, "unavailable"],
  ["an unreadable pending view", { pendingFailed: true }, "unavailable"],
  ["an empty deposit address", { units: 0n }, "empty"],
  ["a funded deposit address", {}, "available"],
  ["a pending request beside funds", { pendingRequests: [REQUEST] }, "reserved"],
  ["a pending request beside no funds", { units: 0n, pendingRequests: [REQUEST] }, "reserved"],
  [
    "a pending request beside a failed read",
    { failed: true, pendingRequests: [REQUEST] },
    "reserved",
  ],
];

it.each(CASES)("describes %s", (_case, overrides, expected) => {
  const balance = describeDepositSweepBalance({ ...BASE, ...overrides });
  const available = expected === "available";
  expect(balance.kind).toBe(expected);
  expect((balance.reason ?? "").length > 0).toBe(!available);
  expect((balance.nextAction ?? "").length > 0).toBe(!available);
});

it("reports the observed units when a sweep can start from them", () => {
  const balance = describeDepositSweepBalance(BASE);
  expect(balance.units).toBe(BASE.units);
  expect(balance.decimals).toBe(BASE.decimals);
});

it("never reports an unreadable balance as an empty one", () => {
  for (const overrides of [{ failed: true }, { units: null }, { decimals: null }]) {
    const balance = describeDepositSweepBalance({ ...BASE, ...overrides });
    expect(balance.kind).toBe("unavailable");
    expect(balance.units).toBeNull();
  }
});

it("counts the pending requests that share the address's next nonce", () => {
  const one = describeDepositSweepBalance({ ...BASE, pendingRequests: [REQUEST] });
  const two = describeDepositSweepBalance({
    ...BASE,
    pendingRequests: [REQUEST, { requestId: "cd".repeat(32), units: 1n }],
  });
  expect(one.reason).toContain("A deposit request");
  expect(two.reason).toContain("2 deposit requests");
  expect(two.tone).toBe("warning");
});

it("covers every balance kind", () => {
  const covered: Readonly<Record<DepositSweepKind, true>> = {
    unbound: true,
    reserved: true,
    checking: true,
    unavailable: true,
    empty: true,
    available: true,
  };
  const inventory = Object.keys(covered);
  expect(inventory.length).toBeGreaterThan(0);
  expect(CASES.length).toBeGreaterThan(0);
  expect(new Set(CASES.map(([, , kind]) => kind))).toEqual(new Set(inventory));
});
