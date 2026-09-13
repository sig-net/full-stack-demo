import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { Transaction as LedgerTransaction } from "@midnightntwrk/ledger-v9";
import {
  bytesToHex,
  requestIdBytes,
  respondBidirectionalEventToCircuitInput,
  serializeRespondOutput,
  signBidirectionalEventToUnsignedEvmTransaction,
  SIGNET_DEFAULT_KEY_VERSION,
  SignetRequestResponseReader,
  verifyRespondBidirectionalSignature,
} from "@sig-net/midnight";
import {
  calculateSignetAttestationDigest,
  ecdsaSignatureToMpcSignature,
  signAttestationDigest,
  signatureToSignatureRespondedEvent,
} from "@sig-net/midnight/testing";
import { TransactionReceipt, Wallet } from "ethers";
import { expect, it, vi } from "vitest";

import {
  ERC20_TRANSFER_GAS_LIMIT,
  ERC20_TRANSFER_MAX_FEE_PER_GAS,
  ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
} from "@/lib/midnight/evm-envelope";
import * as observation from "@/lib/midnight/observed-execution";
import { evmProvider, readPendingDeposit, runDeposit } from "@/lib/midnight/vault";
import type { StandaloneVaultContract } from "@/lib/midnight/vault-providers";

import { createPendingDeposit, createVaultCircuitFixture } from "./vault-circuit-fixture";

vi.mock(import("@/lib/midnight/observed-execution"), { spy: true });

it("recovers a generated pending deposit without creating a request or reading an EVM nonce", async () => {
  const fixture = await createVaultCircuitFixture();
  const { binding } = fixture;
  const token = new Uint8Array(20).fill(9);
  const tokenAddress = `0x${bytesToHex(token)}`;
  const { pendingState, requestId, request } = await createPendingDeposit(fixture, token, 1000000n);
  const state = new ContractState();
  state.data = pendingState;
  vi.spyOn(binding.providers.publicDataProvider, "queryContractState").mockResolvedValue(state);
  const output = serializeRespondOutput('[{"name":"success","type":"bool"}]', { success: true });
  const response = {
    signature: ecdsaSignatureToMpcSignature(
      signAttestationDigest(
        calculateSignetAttestationDigest(requestIdBytes(requestId), output),
        fixture.responseSecret,
      ),
    ),
  };
  const transaction = signBidirectionalEventToUnsignedEvmTransaction(request);
  const signer = new Wallet(`0x${"01".repeat(32)}`);
  transaction.signature = signer.signingKey.sign(transaction.unsignedHash);
  const signature = signatureToSignatureRespondedEvent(transaction.signature);
  vi.spyOn(
    SignetRequestResponseReader.prototype,
    "getVerifiedSignatureRespondedEvent",
  ).mockResolvedValue({ verified: signature, verdicts: [] });
  vi.spyOn(SignetRequestResponseReader.prototype, "getSignatureRequest").mockResolvedValue(request);
  vi.spyOn(
    SignetRequestResponseReader.prototype,
    "getRespondBidirectionalEvents",
  ).mockResolvedValue([response]);
  vi.spyOn(
    SignetRequestResponseReader.prototype,
    "getVerifiedRespondBidirectionalEvent",
  ).mockImplementation((id, candidate, key) =>
    Promise.resolve(
      verifyRespondBidirectionalSignature(requestIdBytes(id), candidate, response, key)
        ? response
        : undefined,
    ),
  );
  vi.mocked(observation.observeExecution).mockResolvedValue({
    success: true,
    output: `0x${"00".repeat(31)}01`,
  });
  const provider = evmProvider(binding.environment.evmRpcUrl);
  vi.spyOn(provider, "getTransactionReceipt").mockImplementation((hash) =>
    Promise.resolve(
      new TransactionReceipt(
        {
          to: signer.address,
          from: signer.address,
          contractAddress: null,
          hash,
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
      ),
    ),
  );
  const nonce = vi.spyOn(provider, "getTransactionCount");
  const start = vi.spyOn(binding.contract.callTx, "startDeposit");
  const completion: Awaited<ReturnType<StandaloneVaultContract["callTx"]["completeDeposit"]>> = {
    public: {
      ...binding.contract.deployTxData.public,
      nextContractState: pendingState.state,
      publicTranscript: [],
      partitionedTranscript: [undefined, undefined],
      logEvents: [],
    },
    private: {
      input: { value: [], alignment: [] },
      output: { value: [], alignment: [] },
      privateTranscriptOutputs: [],
      result: [],
      nextPrivateState: binding.contract.deployTxData.private.initialPrivateState,
      nextZswapLocalState: {
        coinPublicKey: "00".repeat(32),
        currentIndex: 0n,
        inputs: [],
        outputs: [],
      },
      unprovenTx: LedgerTransaction.fromParts("undeployed"),
      newCoins: [],
    },
    calls: [],
  };
  const complete = vi
    .spyOn(binding.contract.callTx, "completeDeposit")
    .mockResolvedValue(completion);
  try {
    expect(
      (
        await readPendingDeposit(
          binding.providers,
          binding.environment,
          binding.identity,
          tokenAddress,
          requestId,
        )
      ).amount,
    ).toBe(1000000n);
    await expect(
      readPendingDeposit(
        binding.providers,
        binding.environment,
        { ...binding.identity, commitment: new Uint8Array(32) },
        tokenAddress,
        requestId,
      ),
    ).rejects.toThrow("another vault identity");
    await expect(
      readPendingDeposit(
        binding.providers,
        binding.environment,
        binding.identity,
        "00".repeat(20),
        requestId,
      ),
    ).rejects.toThrow("different token");
    await runDeposit(
      binding.providers,
      binding.contract,
      binding.environment,
      binding.identity,
      tokenAddress,
      1000000n,
      vi.fn(),
      undefined,
      requestId,
    );
    expect(start).not.toHaveBeenCalled();
    expect(nonce).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.[1]).toEqual(respondBidirectionalEventToCircuitInput(response));
    await expect(
      runDeposit(
        binding.providers,
        binding.contract,
        binding.environment,
        binding.identity,
        tokenAddress,
        1n,
        vi.fn(),
        undefined,
        requestId,
      ),
    ).rejects.toThrow("amount changed");
    vi.spyOn(provider, "call").mockResolvedValue(`0x${1000000n.toString(16).padStart(64, "0")}`);
    await expect(
      runDeposit(
        binding.providers,
        binding.contract,
        binding.environment,
        binding.identity,
        tokenAddress,
        1000000n,
        vi.fn(),
      ),
    ).rejects.toThrow("newly available funds");
    const duplicate = await fixture.generatedContract.circuits.startDeposit(
      fixture.context("startDeposit", pendingState),
      0n,
      ERC20_TRANSFER_GAS_LIMIT,
      ERC20_TRANSFER_MAX_FEE_PER_GAS,
      ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
      SIGNET_DEFAULT_KEY_VERSION,
      { erc20Address: token, amount: 1000000n },
    );
    state.data = duplicate.context.callContext.currentQueryContext.state;
    await expect(
      runDeposit(
        binding.providers,
        binding.contract,
        binding.environment,
        binding.identity,
        tokenAddress,
        1000000n,
        vi.fn(),
      ),
    ).rejects.toThrow("Multiple pending deposits");
    state.data = fixture.readyState;
    await expect(
      readPendingDeposit(
        binding.providers,
        binding.environment,
        binding.identity,
        tokenAddress,
        requestId,
      ),
    ).rejects.toThrow("already be completed");
    await expect(
      runDeposit(
        binding.providers,
        binding.contract,
        binding.environment,
        binding.identity,
        tokenAddress,
        1000000n,
        vi.fn(),
        undefined,
        requestId,
      ),
    ).rejects.toThrow("already be completed");
    expect(start).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
  } finally {
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
  }
});
