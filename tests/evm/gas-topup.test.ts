import * as viem from "viem";
import { beforeEach, expect, it, type MockInstance, vi } from "vitest";

import { createEvmChainConfig, sepolia } from "@/lib/config/evm";
import { ensureGasForTransaction } from "@/lib/evm/gas-topup";
import { GAS_TOPUP_ALLOWANCES } from "@/lib/evm/gas-topup-request";
import { getRelayerEthAccount } from "@/lib/utils/relayer-setup";

vi.mock("viem", { spy: true });

const recipient = "0x1111111111111111111111111111111111111111";
const hash: viem.Hash = `0x${"33".repeat(32)}`;
const configuration = createEvmChainConfig("https://funding.example.invalid");

beforeEach(() => {
  vi.mocked(viem.createWalletClient).mockReset();
  vi.stubEnv("RELAYER_PRIVATE_KEY", `0x${"01".repeat(32)}`);
});

function fixture(): {
  client: viem.PublicClient;
  controls: { targetBalance: bigint; relayerBalance: bigint };
  send: MockInstance<viem.WalletClient["sendTransaction"]>;
  wait: MockInstance<viem.PublicClient["waitForTransactionReceipt"]>;
  receipt: viem.TransactionReceipt;
} {
  const account = getRelayerEthAccount();
  const client = viem.createPublicClient({ transport: viem.http(configuration.rpcUrl) });
  const wallet = viem.createWalletClient({
    account,
    chain: sepolia,
    transport: viem.http(configuration.rpcUrl),
  });
  vi.mocked(viem.createWalletClient).mockReturnValue(wallet);
  const send = vi.spyOn(wallet, "sendTransaction").mockResolvedValue(hash);
  const controls = { targetBalance: 0n, relayerBalance: 10n ** 20n };
  vi.spyOn(client, "getBalance").mockImplementation(({ address }) =>
    Promise.resolve(address === account.address ? controls.relayerBalance : controls.targetBalance),
  );
  vi.spyOn(client, "getTransactionCount").mockResolvedValue(3);
  vi.spyOn(client, "getBlock").mockResolvedValue({
    baseFeePerGas: 1000000000n,
    blobGasUsed: 0n,
    excessBlobGas: 0n,
    sealFields: [],
    difficulty: 0n,
    extraData: "0x",
    gasLimit: 30000000n,
    gasUsed: 21000n,
    hash,
    logsBloom: "0x",
    miner: recipient,
    mixHash: hash,
    nonce: "0x0000000000000000",
    number: 1n,
    parentHash: hash,
    receiptsRoot: hash,
    sha3Uncles: hash,
    size: 1n,
    stateRoot: hash,
    timestamp: 1n,
    totalDifficulty: 0n,
    transactions: [],
    transactionsRoot: hash,
    uncles: [],
  });
  vi.spyOn(client, "estimateFeesPerGas").mockResolvedValue({
    maxFeePerGas: 3000000000n,
    maxPriorityFeePerGas: 1000000000n,
  });
  const receipt: viem.TransactionReceipt = {
    blockHash: hash,
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 21000n,
    effectiveGasPrice: 4000000000n,
    from: account.address,
    gasUsed: 21000n,
    logs: [],
    logsBloom: "0x",
    status: "success",
    to: recipient,
    transactionHash: hash,
    transactionIndex: 0,
    type: "eip1559",
  };
  const wait = vi.spyOn(client, "waitForTransactionReceipt").mockResolvedValue(receipt);
  return { client, controls, send, wait, receipt };
}

it("covers each operation allowance without sending when the target has enough funds", async () => {
  const f = fixture();
  expect(Object.keys(GAS_TOPUP_ALLOWANCES)).toHaveLength(5);
  for (const allowance of Object.values(GAS_TOPUP_ALLOWANCES)) {
    const fee = (allowance.maxFeePerGas * 110n) / 100n;
    f.controls.targetBalance = allowance.gasLimit * fee;
    const before = f.send.mock.calls.length;
    await expect(
      ensureGasForTransaction(configuration, f.client, recipient, allowance.gasLimit, fee),
    ).resolves.toStrictEqual({ topUpTxHash: null, topUpAmount: 0n });
    expect(f.send).toHaveBeenCalledTimes(before);
    f.controls.targetBalance = 0n;
    const result = await ensureGasForTransaction(
      configuration,
      f.client,
      recipient,
      allowance.gasLimit,
      fee,
    );
    expect(result).toStrictEqual({
      topUpTxHash: hash,
      topUpAmount: (allowance.gasLimit * fee * 3n) / 2n,
    });
    expect(f.wait).toHaveBeenLastCalledWith({ hash, confirmations: 1, timeout: 60000 });
    expect(f.send).toHaveBeenLastCalledWith({
      to: recipient,
      value: result.topUpAmount,
      nonce: 3,
      maxFeePerGas: 4000000000n,
      maxPriorityFeePerGas: 2000000000n,
      gas: 21000n,
    });
  }
});

it("rounds fractional buffers upwards, funds only the deficit and caps a transfer", async () => {
  const f = fixture();
  await expect(
    ensureGasForTransaction(configuration, f.client, recipient, 1n, 1n),
  ).resolves.toHaveProperty("topUpAmount", 2n);
  f.controls.targetBalance = 7n;
  await expect(
    ensureGasForTransaction(configuration, f.client, recipient, 1n, 10n),
  ).resolves.toHaveProperty("topUpAmount", 5n);
  f.controls.targetBalance = 0n;
  await expect(
    ensureGasForTransaction(configuration, f.client, recipient, 10n ** 18n, 100n),
  ).resolves.toHaveProperty("topUpAmount", viem.parseEther("0.05"));
});

it("reserves relayer transfer fees and propagates reverted or unavailable receipts", async () => {
  const f = fixture();
  f.controls.relayerBalance = 150n;
  await expect(
    ensureGasForTransaction(configuration, f.client, recipient, 1n, 100n),
  ).rejects.toThrow("insufficient ETH");
  expect(f.send).not.toHaveBeenCalled();
  f.controls.relayerBalance = 10n ** 20n;
  f.wait.mockResolvedValue({ ...f.receipt, status: "reverted" });
  await expect(ensureGasForTransaction(configuration, f.client, recipient, 1n, 1n)).rejects.toThrow(
    "reverted",
  );
  f.wait.mockRejectedValue(new Error("Receipt timeout"));
  await expect(ensureGasForTransaction(configuration, f.client, recipient, 1n, 1n)).rejects.toThrow(
    "Receipt timeout",
  );
});
