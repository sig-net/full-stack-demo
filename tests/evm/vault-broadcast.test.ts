import {
  JsonRpcProvider,
  Signature,
  Transaction,
  TransactionReceipt,
  TransactionResponse,
  Wallet,
} from "ethers";
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

it("reports the sweep hash before the receipt wait resolves", async () => {
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
  const mined = Promise.withResolvers<TransactionReceipt | null>();
  vi.spyOn(JsonRpcProvider.prototype, "getTransactionReceipt").mockResolvedValue(null);
  vi.spyOn(JsonRpcProvider.prototype, "broadcastTransaction").mockResolvedValue(
    new TransactionResponse(
      {
        blockNumber: null,
        blockHash: null,
        hash: signed.hash,
        index: 0,
        type: signed.type ?? 0,
        to: signed.to,
        from: signer.address,
        nonce: signed.nonce,
        gasLimit: signed.gasLimit,
        gasPrice: signed.gasPrice ?? 1n,
        maxPriorityFeePerGas: null,
        maxFeePerGas: null,
        maxFeePerBlobGas: null,
        data: signed.data,
        value: signed.value,
        chainId: signed.chainId,
        signature: signed.signature ?? Signature.from(),
        accessList: null,
        blobVersionedHashes: null,
        authorizationList: null,
      },
      provider,
    ),
  );
  vi.spyOn(JsonRpcProvider.prototype, "waitForTransaction").mockReturnValue(mined.promise);
  const reported: string[] = [];
  const receipts: [string, number][] = [];
  try {
    const pending = broadcastEvm(fixture.environment, signed, {
      throwOnRevert: false,
      onBroadcast: (hash) => reported.push(hash),
      onReceipt: (hash, blockNumber) => receipts.push([hash, blockNumber]),
    });
    await vi.waitFor(() => {
      expect(reported).toEqual([signed.hash]);
    });
    expect(receipts).toEqual([]);
    mined.resolve(
      new TransactionReceipt(
        {
          to: signer.address,
          from: signer.address,
          contractAddress: null,
          hash: signed.hash,
          index: 0,
          blockHash: `0x${"02".repeat(32)}`,
          blockNumber: 11701696,
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
      ),
    );
    await pending;
    expect(reported).toEqual([signed.hash]);
    expect(receipts).toEqual([[signed.hash, 11701696]]);
  } finally {
    provider.destroy();
    fixture.providers.privateStateProvider.dispose();
    await fixture.providers.publicDataProvider.dispose();
  }
});

it("reports no sweep hash when the transaction never reaches the network", async () => {
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
  vi.spyOn(JsonRpcProvider.prototype, "getTransactionReceipt").mockResolvedValue(null);
  vi.spyOn(JsonRpcProvider.prototype, "broadcastTransaction").mockRejectedValue(
    new Error("insufficient funds for intrinsic transaction cost"),
  );
  const reported: string[] = [];
  try {
    await expect(
      broadcastEvm(fixture.environment, signed, {
        throwOnRevert: false,
        onBroadcast: (hash) => reported.push(hash),
      }),
    ).rejects.toThrow("insufficient funds");
    expect(reported).toEqual([]);
  } finally {
    provider.destroy();
    fixture.providers.privateStateProvider.dispose();
    await fixture.providers.publicDataProvider.dispose();
  }
});
