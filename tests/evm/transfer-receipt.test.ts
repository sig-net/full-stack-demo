import type { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";

import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  type Hash,
  type Hex,
  pad,
  ProviderRpcError,
  type PublicClient,
  toEventSelector,
  type Transaction,
  type TransactionReceipt,
} from "viem";
import { expect, it, type MockInstance, vi } from "vitest";

import { parseTokenAmount } from "@/lib/utils/token-amount";

import { account, browserWalletFixture, hash, type WalletFixture } from "./browser-wallet-fixture";

const destination: Address = "0x2222222222222222222222222222222222222222";
const token: Address = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const replacement: Hash = `0x${"44".repeat(32)}`;
const data = encodeFunctionData({
  abi: erc20Abi,
  functionName: "transfer",
  args: [destination, 1000000n],
});

interface TransferFixture extends WalletFixture {
  receipt: TransactionReceipt;
  transaction: Transaction;
  balance: MockInstance<PublicClient["readContract"]>;
  native: MockInstance<PublicClient["getBalance"]>;
  gas: MockInstance<PublicClient["estimateGas"]>;
  settled: MockInstance<PublicClient["waitForTransactionReceipt"]>;
  submitted: Hash[];
  invalidate(): void;
  run(amount?: string): Promise<{ hash: Hash; units: bigint }>;
}

const assertRemoved = (events: EventEmitter): void => {
  expect(events.eventNames().reduce((count, event) => count + events.listenerCount(event), 0)).toBe(
    0,
  );
};

it("accepts initial authorisation events and removes only owned listeners", async () => {
  const f = browserWalletFixture();
  f.controls.initialEvent = true;
  await f.wallet.connect();
  expect(f.wallet.account).toBe(account);
  expect(f.calls.filter((method) => method === "eth_requestAccounts")).toHaveLength(1);
  const external = vi.fn();
  f.events.on("accountsChanged", external);
  f.wallet.disconnect();
  f.events.emit("accountsChanged", [destination]);
  expect(external).toHaveBeenCalledWith([destination]);
  expect(f.events.listenerCount("accountsChanged")).toBe(1);
  f.events.removeListener("accountsChanged", external);
  assertRemoved(f.events);
});

it.each(["accountsChanged", "chainChanged", "disconnect"] as const)(
  "invalidates connected sessions on %s",
  async (event) => {
    const f = browserWalletFixture();
    await f.wallet.connect();
    if (event === "accountsChanged") f.events.emit(event, [destination]);
    if (event === "chainChanged") f.events.emit(event, "0x1");
    if (event === "disconnect")
      f.events.emit(
        event,
        new ProviderRpcError(new Error("Disconnected"), {
          code: 4900,
          shortMessage: "Disconnected",
        }),
      );
    expect(() => f.wallet.account).toThrow(/session changed/);
    expect(f.invalidated).toHaveBeenCalledTimes(1);
    assertRemoved(f.events);
  },
);

it.each(["resolve", "reject"] as const)(
  "deduplicates a pending connection and discards late %s",
  async (settlement) => {
    const f = browserWalletFixture();
    const gate = Promise.withResolvers<Address[]>();
    f.controls.requestGate = gate.promise;
    const first = f.wallet.connect();
    expect(f.wallet.connect()).toBe(first);
    f.wallet.disconnect();
    if (settlement === "resolve") gate.resolve([account]);
    else gate.reject(new Error("Rejected"));
    await expect(first).rejects.toThrow(/session changed|Rejected/);
    assertRemoved(f.events);
    const fresh = browserWalletFixture();
    await fresh.wallet.connect();
    fresh.wallet.disconnect();
  },
);

it("switches networks and rejects refused switches or silent account/network changes", async () => {
  const switched = browserWalletFixture();
  switched.controls.chain = "0x1";
  await switched.wallet.connect();
  expect(switched.wallet.account).toBe(account);
  switched.wallet.disconnect();
  const refused = browserWalletFixture();
  refused.controls.chain = "0x1";
  refused.controls.refuseSwitch = true;
  await expect(refused.wallet.connect()).rejects.toThrow(/rejected/);
  assertRemoved(refused.events);
  const wrong = browserWalletFixture();
  await wrong.wallet.connect();
  wrong.controls.chain = "0x1";
  await expect(wrong.wallet.verify()).rejects.toThrow(/Sepolia/);
  assertRemoved(wrong.events);
  const changed = browserWalletFixture();
  await changed.wallet.connect();
  changed.controls.accounts = [destination];
  await expect(changed.wallet.verify()).rejects.toThrow(/account changed/);
  assertRemoved(changed.events);
});

const transferFixture = async (): Promise<TransferFixture> => {
  const f = browserWalletFixture();
  await f.wallet.connect();
  const receipt: TransactionReceipt = {
    blockHash: hash,
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 50000n,
    effectiveGasPrice: 1n,
    from: account,
    gasUsed: 50000n,
    logsBloom: "0x",
    status: "success",
    to: token,
    transactionHash: hash,
    transactionIndex: 0,
    type: "eip1559",
    logs: [
      {
        address: token,
        blockHash: hash,
        blockNumber: 1n,
        logIndex: 0,
        removed: false,
        transactionHash: hash,
        transactionIndex: 0,
        topics: [
          toEventSelector("Transfer(address,address,uint256)"),
          pad(account),
          pad(destination),
        ],
        data: encodeAbiParameters([{ type: "uint256" }], [1000000n]),
      },
    ],
  };
  const transaction: Transaction = {
    blockHash: hash,
    blockNumber: 1n,
    from: account,
    gas: 50000n,
    hash,
    input: data,
    nonce: 0,
    r: "0x1",
    s: "0x1",
    to: token,
    transactionIndex: 0,
    value: 0n,
    v: 27n,
    type: "legacy",
    typeHex: "0x0",
    gasPrice: 1n,
  };
  const balance = vi.spyOn(f.publicClient, "readContract").mockResolvedValue(2000000n);
  const native = vi.spyOn(f.publicClient, "getBalance").mockResolvedValue(1000000000000000000n);
  const gas = vi.spyOn(f.publicClient, "estimateGas").mockResolvedValue(50000n);
  vi.spyOn(f.publicClient, "getGasPrice").mockResolvedValue(1n);
  const settled = vi.spyOn(f.publicClient, "waitForTransactionReceipt").mockResolvedValue(receipt);
  vi.spyOn(f.publicClient, "getTransaction").mockResolvedValue(transaction);
  let active = true;
  const submitted: Hash[] = [];
  return {
    ...f,
    receipt,
    transaction,
    balance,
    native,
    gas,
    settled,
    submitted,
    invalidate: () => {
      active = false;
    },
    run: async (amount = "1") =>
      f.wallet.transferErc20({
        token,
        destination,
        units: parseTokenAmount(amount, 6),
        beforeSubmit: () => {
          if (!active) throw new Error("Identity changed");
        },
        submitted: (value) => {
          submitted.push(value);
        },
      }),
  };
};

it.each(["success", "repriced"])("accepts verified %s transfer", async (mode) => {
  const f = await transferFixture();
  if (mode === "repriced") f.receipt.transactionHash = replacement;
  expect(await f.run()).toEqual({ units: 1000000n, hash: f.receipt.transactionHash });
  expect(f.submitted.length).toBeGreaterThan(0);
  f.wallet.disconnect();
});
it.each(["cancelled", "reverted", "false"])("rejects %s transfer", async (mode) => {
  const f = await transferFixture();
  if (mode === "cancelled") {
    f.receipt.transactionHash = replacement;
    f.transaction.to = account;
    f.transaction.input = "0x";
  }
  if (mode === "reverted") f.receipt.status = "reverted";
  if (mode === "false") f.receipt.logs = [];
  await expect(f.run()).rejects.toThrow(/replaced|reverted|does not confirm/);
  expect(f.submitted.length).toBeGreaterThan(0);
  f.wallet.disconnect();
});

it.each(["1.0000009", "0", "-1", "1e6", "1.", "abc"])(
  "rejects invalid amount %s before signing",
  async (amount) => {
    const f = await transferFixture();
    await expect(f.run(amount)).rejects.toThrow(/amount/);
    expect(f.calls).not.toContain("eth_sendTransaction");
    f.wallet.disconnect();
  },
);

it.each(["token", "gas"])("rejects insufficient %s balance", async (cause) => {
  const f = await transferFixture();
  if (cause === "token") f.balance.mockResolvedValue(0n);
  else f.native.mockResolvedValue(0n);
  await expect(f.run()).rejects.toThrow(/Insufficient/);
  f.wallet.disconnect();
});

it.each(["identity", "account", "chain"])("guards pre-submission %s replacement", async (cause) => {
  const f = await transferFixture();
  const gate = Promise.withResolvers<bigint>();
  f.gas.mockReturnValue(gate.promise);
  const result = f.run();
  await vi.waitFor(() => {
    expect(f.gas).toHaveBeenCalled();
  });
  if (cause === "identity") f.invalidate();
  if (cause === "account") f.controls.accounts = [destination];
  if (cause === "chain") f.controls.chain = "0x1";
  gate.resolve(50000n);
  await expect(result).rejects.toThrow(/changed|Sepolia/);
  expect(f.submitted).toHaveLength(0);
  f.wallet.disconnect();
});

it.each(["approval", "receipt"])(
  "retains captured receipt after session replacement during %s",
  async (phase) => {
    const f = await transferFixture();
    const approval = Promise.withResolvers<Hex>();
    const receipt = Promise.withResolvers<TransactionReceipt>();
    if (phase === "approval") f.controls.sendGate = approval.promise;
    else f.settled.mockReturnValue(receipt.promise);
    const result = f.run();
    await vi.waitFor(() => {
      expect(
        phase === "receipt"
          ? f.settled.mock.calls.length
          : f.calls.filter((method) => method === "eth_sendTransaction").length,
      ).toBeGreaterThan(0);
    });
    f.invalidate();
    f.wallet.disconnect();
    approval.resolve(hash);
    receipt.resolve(f.receipt);
    expect((await result).hash).toBe(hash);
    expect(f.submitted).toEqual([hash, hash]);
  },
);

it("preserves transaction rejection without a submitted hash", async () => {
  const f = await transferFixture();
  const gate = Promise.withResolvers<Hex>();
  f.controls.sendGate = gate.promise;
  const result = f.run();
  await vi.waitFor(() => {
    expect(f.calls).toContain("eth_sendTransaction");
  });
  gate.reject(new Error("User rejected transaction"));
  await expect(result).rejects.toThrow(/rejected/);
  expect(f.submitted).toHaveLength(0);
  f.wallet.disconnect();
});

it("keeps browser signing consumers independent of app credentials and persistent restoration", async () => {
  const paths = [
    "src/lib/evm/wallet/BrowserWallet.ts",
    "src/lib/evm/erc20-transfer.ts",
    "src/providers/evm-wallet-context.tsx",
    "src/components/evm-wallet-button.tsx",
    "src/components/deposit-dialog/evm-deposit-transfer.tsx",
  ];
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    const source = await readFile(path, "utf8");
    expect(source.length).toBeGreaterThan(0);
    expect(source).not.toMatch(
      /localStorage|sessionStorage|privateKeyToAccount|SeedWallet|mnemonic/,
    );
  }
});
