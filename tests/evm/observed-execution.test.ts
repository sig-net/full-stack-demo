import {
  signBidirectionalEventToUnsignedEvmTransaction,
  signetEventSourceFromPublicDataProvider,
  SignetRequestResponseReader,
} from "@sig-net/midnight";
import { signatureToSignatureRespondedEvent } from "@sig-net/midnight/testing";
import { VAULT_DEPOSIT_REQUESTS_PATH } from "@sig-net/midnight-examples-erc20-vault-contract";
import { JsonRpcProvider, TransactionReceipt, Wallet } from "ethers";
import { expect, it, vi } from "vitest";

import { observeExecution } from "@/lib/midnight/observed-execution";

import { createPendingDeposit, createVaultCircuitFixture } from "../sdk/vault-circuit-fixture";

it("skips malformed and unmined signatures, verifies trace shape and rejects stale receipt continuations", async () => {
  const fixture = await createVaultCircuitFixture();
  const { binding } = fixture;
  const { request, requestId } = await createPendingDeposit(
    fixture,
    new Uint8Array(20).fill(9),
    1000000n,
  );
  const provider = new JsonRpcProvider("https://rpc.example.invalid");
  const reader = new SignetRequestResponseReader({
    requesterContractAddress: binding.environment.contractAddress,
    requesterRequestsPath: VAULT_DEPOSIT_REQUESTS_PATH,
    signetContractAddress: binding.environment.signetContractAddress,
    publicDataProvider: binding.providers.publicDataProvider,
    eventSource: signetEventSourceFromPublicDataProvider(binding.providers.publicDataProvider),
  });
  const signatures = [1, 2].map((byte) => {
    const transaction = signBidirectionalEventToUnsignedEvmTransaction(request);
    const signer = new Wallet(`0x${byte.toString(16).padStart(2, "0").repeat(32)}`);
    transaction.signature = signer.signingKey.sign(transaction.unsignedHash);
    return { transaction, signature: signatureToSignatureRespondedEvent(transaction.signature) };
  });
  const [unmined, mined] = signatures;
  if (!unmined || !mined?.transaction.hash)
    throw new Error("Expected complete signed fixture transactions");
  vi.spyOn(reader, "getSignatureRequest").mockResolvedValue(request);
  const events = vi
    .spyOn(reader, "getSignatureRespondedEvents")
    .mockResolvedValue([
      { signature: { ...mined.signature.signature, s: new Uint8Array(1) } },
      unmined.signature,
      mined.signature,
    ]);
  const receipt = new TransactionReceipt(
    {
      to: mined.transaction.to,
      from: "0x1111111111111111111111111111111111111111",
      contractAddress: null,
      hash: mined.transaction.hash,
      index: 0,
      blockHash: `0x${"02".repeat(32)}`,
      blockNumber: 1,
      logsBloom: "0x",
      logs: [],
      gasUsed: 21000n,
      cumulativeGasUsed: 21000n,
      gasPrice: 1n,
      type: 2,
      status: 1,
      root: null,
    },
    provider,
  );
  const lookup = vi
    .spyOn(provider, "getTransactionReceipt")
    .mockImplementation((hash) =>
      Promise.resolve(hash === mined.transaction.hash ? receipt : null),
    );
  const output = `0x${"00".repeat(31)}01`;
  const trace = vi.spyOn(provider, "send").mockResolvedValue({ output });
  const active = vi.fn<() => void>();
  const observe = (): ReturnType<typeof observeExecution> =>
    observeExecution(reader, provider, requestId, active);
  try {
    await expect(observe()).resolves.toStrictEqual({ success: true, output });
    expect(lookup.mock.calls.map((call) => call[0])).toStrictEqual([
      unmined.transaction.hash,
      mined.transaction.hash,
    ]);
    expect(trace).toHaveBeenLastCalledWith("debug_traceTransaction", [
      mined.transaction.hash,
      { tracer: "callTracer" },
    ]);
    vi.spyOn(receipt, "status", "get").mockReturnValue(0);
    await expect(observe()).resolves.toStrictEqual({ success: false, output: null });
    expect(trace).toHaveBeenCalledTimes(1);
    vi.spyOn(receipt, "status", "get").mockReturnValue(1);
    trace.mockResolvedValue({});
    await expect(observe()).resolves.toStrictEqual({ success: true, output: "0x" });
    trace.mockResolvedValue({ output: "0x1" });
    await expect(observe()).rejects.toThrow("invalid output bytes");
    trace.mockResolvedValue(null);
    await expect(observe()).rejects.toThrow("missing its top call frame");
    active.mockImplementationOnce(() => {
      throw new Error("session replaced");
    });
    await expect(observe()).rejects.toThrow("session replaced");
    vi.spyOn(receipt, "status", "get").mockReturnValue(0);
    for (const result of [receipt, null]) {
      active.mockReset();
      lookup.mockImplementationOnce(() => {
        active.mockImplementation(() => {
          throw new Error("late receipt session replaced");
        });
        return Promise.resolve(result);
      });
      await expect(observe()).rejects.toThrow("late receipt session replaced");
    }
    active.mockReset();
    lookup.mockResolvedValue(null);
    events.mockResolvedValue([unmined.signature]);
    await expect(observe()).resolves.toBeUndefined();
  } finally {
    provider.destroy();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
    await binding.wallet.disconnect();
  }
});
