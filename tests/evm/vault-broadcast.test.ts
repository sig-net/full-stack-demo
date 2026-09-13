import { JsonRpcProvider, Transaction, TransactionReceipt, Wallet } from "ethers";
import { expect, it, vi } from "vitest";

import { broadcastEvm } from "@/lib/midnight/vault";

import { createVaultFixture } from "../sdk/vault-fixture";

it("uses an already mined receipt without rebroadcasting the signed transaction", async () => {
  const fixture = await createVaultFixture();
  const provider = new JsonRpcProvider(fixture.environment.evmRpcUrl);
  const signer = new Wallet(`0x${"01".repeat(32)}`);
  const signed = Transaction.from(
    await signer.signTransaction({
      to: signer.address,
      value: 0n,
      nonce: 0,
      gasLimit: 21000n,
      gasPrice: 1n,
      chainId: 11155111,
    }),
  );
  if (!signed.hash) throw new Error("Expected signed transaction hash");
  const receipt = new TransactionReceipt(
    {
      to: signer.address,
      from: signer.address,
      contractAddress: null,
      hash: signed.hash,
      index: 0,
      blockHash: `0x${"02".repeat(32)}`,
      blockNumber: 1,
      logsBloom: `0x${"00".repeat(256)}`,
      logs: [],
      gasUsed: 21000n,
      cumulativeGasUsed: 21000n,
      gasPrice: 1n,
      type: 0,
      status: 1,
      root: null,
    },
    provider,
  );
  vi.spyOn(JsonRpcProvider.prototype, "getTransactionReceipt").mockResolvedValue(receipt);
  const broadcast = vi.spyOn(JsonRpcProvider.prototype, "broadcastTransaction");
  try {
    await broadcastEvm(fixture.environment, signed);
    expect(broadcast).not.toHaveBeenCalled();
  } finally {
    provider.destroy();
    fixture.providers.privateStateProvider.dispose();
    await fixture.providers.publicDataProvider.dispose();
  }
});

it("cannot broadcast after the session changes during receipt lookup", async () => {
  const fixture = await createVaultFixture();
  const provider = new JsonRpcProvider(fixture.environment.evmRpcUrl);
  const signer = new Wallet(`0x${"01".repeat(32)}`);
  const signed = Transaction.from(
    await signer.signTransaction({
      to: signer.address,
      value: 0n,
      nonce: 0,
      gasLimit: 21000n,
      gasPrice: 1n,
      chainId: 11155111,
    }),
  );
  const lookup = Promise.withResolvers<TransactionReceipt | null>();
  const read = vi
    .spyOn(JsonRpcProvider.prototype, "getTransactionReceipt")
    .mockReturnValue(lookup.promise);
  const broadcast = vi.spyOn(JsonRpcProvider.prototype, "broadcastTransaction");
  let active = true;
  const environment = {
    ...fixture.environment,
    assertActive: () => {
      if (!active) throw new Error("Vault session superseded.");
    },
  };
  try {
    const pending = broadcastEvm(environment, signed);
    expect(read).toHaveBeenCalledTimes(1);
    active = false;
    lookup.resolve(null);
    await expect(pending).rejects.toThrow("superseded");
    expect(broadcast).not.toHaveBeenCalled();
  } finally {
    provider.destroy();
    fixture.providers.privateStateProvider.dispose();
    await fixture.providers.publicDataProvider.dispose();
  }
});
