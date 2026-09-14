import {
  type Address,
  BaseError,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  type Hash,
  InsufficientFundsError,
  pad,
  ProviderRpcError,
  toEventSelector,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { expect, it, vi } from "vitest";

import {
  describeTransferFailure,
  Erc20TransferError,
  type TransferFailureKind,
  type TransferRecovery,
} from "@/lib/evm/transfer-failure";

import { browserWalletFixture, hash } from "./browser-wallet-fixture";

const token: Address = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const destination: Address = "0x2222222222222222222222222222222222222222";
const replacement: Hash = `0x${"44".repeat(32)}`;

const rejection = new ProviderRpcError(
  new Error("MetaMask Tx Signature: User denied transaction signature."),
  { code: 4001, shortMessage: "User rejected the request." },
);

/** Signs through the real wallet client so the connector error reaches the classifier as viem wraps it. */
async function connectorFailure(cause: Error): Promise<unknown> {
  const f = browserWalletFixture();
  await f.wallet.connect();
  f.controls.sendGate = Promise.reject(cause);
  try {
    await f.wallet.client.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [destination, 1n],
    });
    throw new Error("Expected the connector to reject");
  } catch (error) {
    return error;
  } finally {
    f.wallet.disconnect();
  }
}

const cases: {
  name: string;
  error: () => unknown;
  submitted: boolean;
  sessionChanged?: boolean;
  kind: TransferFailureKind;
  recovery: TransferRecovery;
}[] = [
  {
    name: "connector code 4001 before submission",
    error: () => connectorFailure(rejection),
    submitted: false,
    kind: "rejected",
    recovery: "send-again",
  },
  {
    name: "connector code 4001 after a hash is known",
    error: () => connectorFailure(rejection),
    submitted: true,
    kind: "unknown",
    recovery: "recheck",
  },
  {
    name: "insufficient native funds",
    error: () =>
      new InsufficientFundsError({
        cause: new BaseError("The account has insufficient funds for this transaction."),
      }),
    submitted: false,
    kind: "fees",
    recovery: "send-again",
  },
  {
    name: "declared insufficient fee reserve",
    error: () => new Erc20TransferError("fees", "Insufficient native balance for network fees."),
    submitted: false,
    kind: "fees",
    recovery: "send-again",
  },
  {
    name: "preflight RPC failure",
    error: () => new Error("HTTP request failed: fetch failed"),
    submitted: false,
    kind: "preflight",
    recovery: "send-again",
  },
  {
    name: "receipt wait timeout",
    error: () => new WaitForTransactionReceiptTimeoutError({ hash }),
    submitted: true,
    kind: "unknown",
    recovery: "recheck",
  },
  {
    name: "mined revert",
    error: () => new Erc20TransferError("reverted", "The EVM transfer reverted."),
    submitted: true,
    kind: "reverted",
    recovery: "send-again",
  },
  {
    name: "cancellation or replacement",
    error: () =>
      new Erc20TransferError(
        "replaced",
        "The mined transaction replaced or cancelled this token transfer.",
      ),
    submitted: true,
    kind: "replaced",
    recovery: "recheck",
  },
  {
    // The caller establishes the session change from its captured assertions, so the failure here
    // carries ordinary RPC wording and the classification still lands on the session state.
    name: "wallet or network change before submission",
    error: () => new Error("HTTP request failed: fetch failed"),
    submitted: false,
    sessionChanged: true,
    kind: "session",
    recovery: "reconnect",
  },
  {
    name: "wallet or network change after a hash is known",
    error: () => new Error("HTTP request failed: fetch failed"),
    submitted: true,
    sessionChanged: true,
    kind: "unknown",
    recovery: "recheck",
  },
  {
    name: "released local wait",
    error: () => new Erc20TransferError("abandoned", "Wait released."),
    submitted: false,
    kind: "abandoned",
    recovery: "recheck",
  },
];

const covered: Record<TransferFailureKind, true> = {
  rejected: true,
  fees: true,
  preflight: true,
  reverted: true,
  replaced: true,
  unknown: true,
  abandoned: true,
  session: true,
};

it("covers every declared transfer failure kind", () => {
  expect(cases.length).toBeGreaterThan(0);
  expect([...new Set(cases.map((entry) => entry.kind))].sort()).toEqual(
    Object.keys(covered).sort(),
  );
});

it.each(cases)("classifies $name", async ({ error, submitted, sessionChanged, kind, recovery }) => {
  const failure = describeTransferFailure(await error(), {
    submitted,
    sessionChanged: sessionChanged ?? false,
  });
  expect(failure.kind).toBe(kind);
  expect(failure.recovery).toBe(recovery);
  expect(failure.message.length).toBeGreaterThan(0);
  expect(failure.nextAction.length).toBeGreaterThan(0);
});

it("preserves the connector's own wording as an optional disclosure", async () => {
  const failure = describeTransferFailure(await connectorFailure(rejection), {
    submitted: false,
    sessionChanged: false,
  });
  expect(failure.detail).toBe("MetaMask Tx Signature: User denied transaction signature.");
});

it("never reads the failure's own wording to decide that a session changed", () => {
  const worded = new Error("EVM wallet session changed. Connect again.");
  const withoutEvidence = describeTransferFailure(worded, {
    submitted: false,
    sessionChanged: false,
  });
  const withEvidence = describeTransferFailure(worded, { submitted: false, sessionChanged: true });
  expect(withoutEvidence.kind).toBe("preflight");
  expect(withEvidence.kind).toBe("session");
});

const recheckFixture = async (): Promise<ReturnType<typeof browserWalletFixture>> => {
  const f = browserWalletFixture();
  await f.wallet.connect();
  return f;
};

const recheckCases: { outcome: string; kind: TransferFailureKind | null }[] = [
  { outcome: "pending", kind: "unknown" },
  { outcome: "reverted", kind: "reverted" },
  { outcome: "replaced", kind: "replaced" },
  { outcome: "confirmed", kind: null },
];

it.each(recheckCases)(
  "rechecks a submitted transfer as $outcome without sending anything",
  async ({ outcome, kind }) => {
    const f = await recheckFixture();
    const account = getAddress(f.wallet.account);
    const units = 1000000n;
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [destination, units],
    });
    const replaced = outcome === "replaced";
    const receipt = vi.spyOn(f.publicClient, "getTransactionReceipt");
    if (outcome === "pending")
      receipt.mockRejectedValue(new Error("Transaction receipt not found"));
    else
      receipt.mockResolvedValue({
        blockHash: hash,
        blockNumber: 1n,
        contractAddress: null,
        cumulativeGasUsed: 50000n,
        effectiveGasPrice: 1n,
        from: account,
        gasUsed: 50000n,
        logsBloom: "0x",
        status: outcome === "reverted" ? "reverted" : "success",
        to: token,
        transactionHash: replaced ? replacement : hash,
        transactionIndex: 0,
        type: "eip1559",
        logs: replaced
          ? []
          : [
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
                data: encodeAbiParameters([{ type: "uint256" }], [units]),
              },
            ],
      });
    vi.spyOn(f.publicClient, "getTransaction").mockResolvedValue({
      blockHash: hash,
      blockNumber: 1n,
      from: account,
      gas: 50000n,
      hash: replaced ? replacement : hash,
      input: replaced ? "0x" : data,
      nonce: 0,
      r: "0x1",
      s: "0x1",
      to: replaced ? account : token,
      transactionIndex: 0,
      value: 0n,
      v: 27n,
      type: "legacy",
      typeHex: "0x0",
      gasPrice: 1n,
    });
    const attempt = f.wallet.recheckErc20Transfer({ hash, token, destination, units });
    const settled = await attempt.then(
      (value) => ({ value, failure: null }),
      (error: unknown) => ({
        value: null,
        failure: describeTransferFailure(error, { submitted: true, sessionChanged: false }),
      }),
    );
    expect(settled.failure?.kind ?? null).toBe(kind);
    expect(settled.value).toEqual(kind === null ? { hash, units } : null);
    expect(f.calls).not.toContain("eth_sendTransaction");
    f.wallet.disconnect();
  },
);
