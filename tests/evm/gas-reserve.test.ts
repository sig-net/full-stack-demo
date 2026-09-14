import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";

import type { EvmChainConfig } from "@/lib/config/evm";
import {
  describeGasReserve,
  type GasReserveKind,
  type GasReservePurpose,
  gasReserveQueryOptions,
  readNativeBalance,
  requireGasReserve,
} from "@/lib/evm/gas-reserve";
import {
  ERC20_TRANSFER_GAS_LIMIT,
  ERC20_TRANSFER_MAX_FEE_PER_GAS,
  MPC_OPERATION_ETH_RESERVE,
  STATA_GAS_LIMIT,
  STATA_MAX_FEE_PER_GAS,
  SWAP_GAS_LIMIT,
  SWAP_MAX_FEE_PER_GAS,
  VAULT_EVM_ETH_RESERVE,
  VAULT_EVM_OPERATIONS,
} from "@/lib/midnight/evm-envelope";
import type { FlowKind } from "@/lib/midnight/flow";

const CHAIN_ID = 11155111n;
const ACCOUNT = "0xc2458C8B892a8CBc30113802206E672847dA637E";
const OTHER_ACCOUNT = "0x9D06725cCEC3f56eA7eE970e3e92E3f87B4523C2";

function chainConfig(rpcUrl: string): EvmChainConfig {
  return { network: "local", chainId: CHAIN_ID, rpcUrl, explorerUrl: "" };
}

it("derives every operation reserve from the signed envelope caps", () => {
  const transfer = ERC20_TRANSFER_GAS_LIMIT * ERC20_TRANSFER_MAX_FEE_PER_GAS;
  const swap = SWAP_GAS_LIMIT * SWAP_MAX_FEE_PER_GAS;
  const stata = STATA_GAS_LIMIT * STATA_MAX_FEE_PER_GAS;
  const expected: Record<FlowKind, bigint> = {
    deposit: transfer,
    withdraw: transfer,
    swap: swap + transfer,
    supply: stata + transfer,
    redeem: stata,
  };
  expect(Object.keys(expected).length).toBeGreaterThan(0);
  expect(MPC_OPERATION_ETH_RESERVE).toStrictEqual(expected);
  expect(transfer).toBe(3_000_000_000_000_000n);
  expect(VAULT_EVM_OPERATIONS).not.toContain("deposit");
  expect(VAULT_EVM_ETH_RESERVE).toBe(
    VAULT_EVM_OPERATIONS.reduce(
      (largest, kind) =>
        MPC_OPERATION_ETH_RESERVE[kind] > largest ? MPC_OPERATION_ETH_RESERVE[kind] : largest,
      0n,
    ),
  );
  expect(VAULT_EVM_ETH_RESERVE).toBe(MPC_OPERATION_ETH_RESERVE.swap);
});

const required = MPC_OPERATION_ETH_RESERVE.deposit;
const boundaries: {
  label: string;
  observed: bigint | undefined;
  failed: boolean;
  kind: GasReserveKind;
  shortfall: bigint | null;
}[] = [
  { label: "zero", observed: 0n, failed: false, kind: "empty", shortfall: required },
  {
    label: "one wei below",
    observed: required - 1n,
    failed: false,
    kind: "insufficient",
    shortfall: 1n,
  },
  { label: "exactly at", observed: required, failed: false, kind: "sufficient", shortfall: null },
  { label: "above", observed: required + 1n, failed: false, kind: "sufficient", shortfall: null },
  { label: "no read yet", observed: undefined, failed: false, kind: "checking", shortfall: null },
  { label: "failed read", observed: undefined, failed: true, kind: "unavailable", shortfall: null },
  {
    label: "failed read with a stale value",
    observed: required,
    failed: true,
    kind: "unavailable",
    shortfall: null,
  },
];

it.each(boundaries)(
  "classifies a $label deposit reserve as $kind",
  ({ observed, failed, kind, shortfall }) => {
    const reserve = describeGasReserve({
      purpose: "deposit-sweep",
      required,
      observed,
      failed,
    });
    expect(reserve.kind).toBe(kind);
    expect(reserve.shortfall).toBe(shortfall);
    expect(reserve.required).toBe(required);
    expect(reserve.observed).toBe(
      kind === "sufficient" || kind === "empty" || kind === "insufficient" ? observed : null,
    );
    expect(reserve.reason.length).toBeGreaterThan(0);
    expect(reserve.nextAction.length).toBeGreaterThan(0);
  },
);

it("covers every reserve kind and keeps both purposes distinct", () => {
  expect(boundaries.length).toBeGreaterThan(0);
  const covered: Record<GasReserveKind, true> = {
    checking: true,
    unavailable: true,
    empty: true,
    insufficient: true,
    sufficient: true,
  };
  expect(new Set(boundaries.map((entry) => entry.kind))).toStrictEqual(
    new Set(Object.keys(covered)),
  );
  const purposes: GasReservePurpose[] = ["deposit-sweep", "vault-operations"];
  const reasons = purposes.map(
    (purpose) => describeGasReserve({ purpose, required, observed: 0n, failed: false }).reason,
  );
  expect(new Set(reasons).size).toBe(purposes.length);
  expect(reasons[0]).toContain("deposit address");
  expect(reasons[1]).toContain("vault address");
});

it("scopes the reserve query to its endpoint, chain, session and account", () => {
  const base = gasReserveQueryOptions({
    config: chainConfig("http://127.0.0.1:1"),
    sessionId: "session-a",
    address: ACCOUNT,
  });
  const differentSession = gasReserveQueryOptions({
    config: chainConfig("http://127.0.0.1:1"),
    sessionId: "session-b",
    address: ACCOUNT,
  });
  const differentAccount = gasReserveQueryOptions({
    config: chainConfig("http://127.0.0.1:1"),
    sessionId: "session-a",
    address: OTHER_ACCOUNT,
  });
  const differentEndpoint = gasReserveQueryOptions({
    config: chainConfig("http://127.0.0.1:2"),
    sessionId: "session-a",
    address: ACCOUNT,
  });
  const keys = [base, differentSession, differentAccount, differentEndpoint].map((options) =>
    JSON.stringify(options.queryKey),
  );
  expect(keys.length).toBeGreaterThan(0);
  expect(new Set(keys).size).toBe(keys.length);
  expect(JSON.stringify(base.queryKey)).not.toContain("session-b");
});

it("reads a native balance and enforces the requirement without a signing session", async () => {
  const { startRpcStub } = await import("./rpc-stub");
  const stub = await startRpcStub(CHAIN_ID);
  try {
    const config = chainConfig(stub.url);
    stub.setBalance(required);
    expect(await readNativeBalance(config, ACCOUNT)).toBe(required);
    expect(stub.requested).toStrictEqual([ACCOUNT.toLowerCase()]);

    const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scope = { config, sessionId: "session-a", address: ACCOUNT };
    await expect(
      requireGasReserve({ queries, scope, purpose: "deposit-sweep", required }),
    ).resolves.toBeUndefined();

    stub.setBalance(required - 1n);
    await expect(
      requireGasReserve({ queries, scope, purpose: "deposit-sweep", required }),
    ).rejects.toThrow("below the reserve needed");

    stub.setBalance(0n);
    await expect(
      requireGasReserve({ queries, scope, purpose: "vault-operations", required }),
    ).rejects.toThrow("holds no ETH");

    stub.failBalance();
    await expect(
      requireGasReserve({ queries, scope, purpose: "vault-operations", required }),
    ).rejects.toThrow("could not be read");
  } finally {
    await stub.close();
  }
});
