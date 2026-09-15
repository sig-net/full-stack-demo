import { ContractState } from "@midnight-ntwrk/compact-runtime";
import { Transaction as LedgerTransaction } from "@midnightntwrk/ledger-v9";
import {
  bytesToHex,
  requestIdBytes,
  respondBidirectionalEventToCircuitInput,
  serializeRespondOutput,
  SIGNET_DEFAULT_KEY_VERSION,
  SignetRequestResponseReader,
  verifyRespondBidirectionalSignature,
} from "@sig-net/midnight";
import {
  calculateSignetAttestationDigest,
  ecdsaSignatureToMpcSignature,
  signAttestationDigest,
} from "@sig-net/midnight/testing";
import { JsonRpcProvider } from "ethers";
import { TransactionReceipt } from "ethers";
import { expect, it, vi } from "vitest";

import {
  ERC20_TRANSFER_GAS_LIMIT,
  ERC20_TRANSFER_MAX_FEE_PER_GAS,
  ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
} from "@/lib/midnight/evm-envelope";
import * as observation from "@/lib/midnight/observed-execution";
import { lookupDepositRequest, runDeposit } from "@/lib/midnight/vault";
import type { StandaloneVaultContract } from "@/lib/midnight/vault-providers";

import { createProgressRecorder } from "./flow-progress-fixture";
import {
  createPendingDeposit,
  createSignatureResponse,
  createVaultCircuitFixture,
} from "./vault-circuit-fixture";

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
  const { signer, signature } = createSignatureResponse(request, `0x${"01".repeat(32)}`);
  vi.spyOn(
    SignetRequestResponseReader.prototype,
    "getVerifiedSignatureRespondedEvent",
  ).mockResolvedValue({ verified: signature, verdicts: [] });
  vi.spyOn(SignetRequestResponseReader.prototype, "getSignatureRequest").mockResolvedValue(request);
  const respondEvents = vi
    .spyOn(SignetRequestResponseReader.prototype, "getRespondBidirectionalEvents")
    .mockResolvedValue([response]);
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
  const provider = new JsonRpcProvider(binding.environment.evmRpcUrl);
  vi.spyOn(JsonRpcProvider.prototype, "getTransactionReceipt").mockImplementation((hash) =>
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
  const nonce = vi.spyOn(JsonRpcProvider.prototype, "getTransactionCount");
  const broadcast = vi.spyOn(JsonRpcProvider.prototype, "broadcastTransaction");
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
      await lookupDepositRequest(
        binding.providers,
        binding.environment,
        binding.identity,
        tokenAddress,
        requestId,
      ),
    ).toEqual({ kind: "recoverable", requestId, units: 1000000n });
    expect(
      await lookupDepositRequest(
        binding.providers,
        binding.environment,
        { ...binding.identity, commitment: new Uint8Array(32) },
        tokenAddress,
        requestId,
      ),
    ).toEqual({ kind: "mismatched", requestId, mismatch: "identity" });
    expect(
      await lookupDepositRequest(
        binding.providers,
        binding.environment,
        binding.identity,
        "00".repeat(20),
        requestId,
      ),
    ).toEqual({ kind: "mismatched", requestId, mismatch: "token" });
    expect(
      await lookupDepositRequest(
        binding.providers,
        binding.environment,
        binding.identity,
        tokenAddress,
        "not a request id",
      ),
    ).toEqual({ kind: "malformed" });
    const recorder = createProgressRecorder();
    const records: { hash: string | undefined; completions: number }[] = [];
    await runDeposit(
      recorder.progress,
      binding.providers,
      binding.contract,
      binding.environment,
      binding.identity,
      tokenAddress,
      1000000n,
      vi.fn(),
      (_rid, hash) => {
        records.push({ hash, completions: complete.mock.calls.length });
      },
      requestId,
    );
    expect(start).not.toHaveBeenCalled();
    expect(nonce).not.toHaveBeenCalled();
    // The already mined receipt satisfies the sweep, so recovery sends no transaction of its own
    // and cannot change the nonce or the amount of the one the MPC already signed.
    expect(broadcast).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(recorder.eventNames()).toEqual([
      "request-confirmed",
      "signature-wait",
      "evm-broadcast",
      "evm-receipt",
      "attestation-wait",
      "attestation-present",
      "midnight-settled",
    ]);
    expect(recorder.events.at(-1)).toEqual({
      name: "midnight-settled",
      midnightTxHash: completion.public.txHash,
      midnightBlockHeight: completion.public.blockHeight,
    });
    const broadcastHashes = recorder.events.flatMap((event) =>
      event.name === "evm-broadcast" ? [event.evmTxHash] : [],
    );
    expect(broadcastHashes).toHaveLength(1);
    expect(records).toEqual([
      { hash: undefined, completions: 0 },
      { hash: broadcastHashes[0], completions: 0 },
      { hash: broadcastHashes[0], completions: 0 },
    ]);
    expect(complete.mock.calls[0]?.[1]).toEqual(respondBidirectionalEventToCircuitInput(response));
    // Another session settling the same request between the attestation and the completion must
    // stop this one before it submits a second completion for a request the ledger has cleared.
    vi.mocked(observation.observeExecution).mockImplementationOnce(() => {
      state.data = fixture.readyState;
      return Promise.resolve({ success: true, output: `0x${"00".repeat(31)}01` });
    });
    await expect(
      runDeposit(
        createProgressRecorder().progress,
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
    ).rejects.toThrow("Already completed");
    expect(complete).toHaveBeenCalledTimes(1);
    state.data = pendingState;
    // A deployment holding no initialised vault is the one network-shaped mismatch a read proves.
    state.data = binding.contract.deployTxData.public.initialContractState.data;
    expect(
      await lookupDepositRequest(
        binding.providers,
        binding.environment,
        binding.identity,
        tokenAddress,
        requestId,
      ),
    ).toEqual({ kind: "mismatched", requestId, mismatch: "deployment" });
    state.data = pendingState;
    await expect(
      runDeposit(
        createProgressRecorder().progress,
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
    vi.spyOn(JsonRpcProvider.prototype, "call").mockResolvedValue(
      `0x${1000000n.toString(16).padStart(64, "0")}`,
    );
    await expect(
      runDeposit(
        createProgressRecorder().progress,
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
        createProgressRecorder().progress,
        binding.providers,
        binding.contract,
        binding.environment,
        binding.identity,
        tokenAddress,
        1000000n,
        vi.fn(),
      ),
    ).rejects.toThrow(
      "2 pending deposits from this deposit address already claim a sweep at this amount",
    );
    state.data = fixture.readyState;
    expect(
      await lookupDepositRequest(
        binding.providers,
        binding.environment,
        binding.identity,
        tokenAddress,
        requestId,
      ),
    ).toEqual({ kind: "completed", requestId });
    respondEvents.mockResolvedValueOnce([]);
    expect(
      await lookupDepositRequest(
        binding.providers,
        binding.environment,
        binding.identity,
        tokenAddress,
        requestId,
      ),
    ).toEqual({ kind: "not-found", requestId });
    respondEvents.mockRejectedValueOnce(new Error("indexer unavailable"));
    expect(
      await lookupDepositRequest(
        binding.providers,
        binding.environment,
        binding.identity,
        tokenAddress,
        requestId,
      ),
    ).toEqual({ kind: "error", cause: "indexer unavailable" });
    await expect(
      runDeposit(
        createProgressRecorder().progress,
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
    ).rejects.toThrow("Already completed");
    expect(start).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
  } finally {
    provider.destroy();
    binding.providers.privateStateProvider.dispose();
    await binding.providers.publicDataProvider.dispose();
  }
});
