import { rawTokenType } from "@midnight-ntwrk/compact-runtime";
import type { FinalizedTxData } from "@midnight-ntwrk/midnight-js/types";
import {
  type AbiDecodedOutput,
  asciiPadded,
  bytesToHex,
  calculateRequestId,
  deserializeEvmOutput,
  evmAddressAbiWord,
  hexToBytes,
  MPC_FAILURE_OUTPUT,
  MPC_PARAMS_BYTES,
  MPCDestination,
  MPCSignatureAlgorithm,
  numericAbiWord,
  parseRequestIdHex,
  PATH_BYTES,
  pureCircuits as signetPureCircuits,
  requestIdBytes,
  type RequestIdHex,
  requestIdHex,
  type RespondBidirectionalEvent,
  respondBidirectionalEventToCircuitInput,
  serializeRespondOutput,
  type SignBidirectionalEvent,
  signBidirectionalEventToSignedEvmTransaction,
  SIGNET_DEFAULT_KEY_VERSION,
  signetEventSourceFromPublicDataProvider,
  SignetRequestResponseReader,
  stripHexPrefix,
  toSignBidirectionalEventIndex,
  TxParamType,
} from "@sig-net/midnight";
import type { VaultProviders } from "@sig-net/midnight-examples-erc20-vault-contract";
import {
  ledger,
  pureCircuits as vaultPureCircuits,
  VAULT_DEPOSIT_REQUESTS_PATH,
  VAULT_PATH_HEX,
  VAULT_REDEEM_REQUESTS_PATH,
  VAULT_REQUESTS_PATH,
  VAULT_SUPPLY_REQUESTS_PATH,
  VAULT_SWAP_REQUESTS_PATH,
} from "@sig-net/midnight-examples-erc20-vault-contract";
import { Contract as EthersContract, type ContractMethod, type Transaction } from "ethers";

import { sepolia } from "@/lib/config/evm";
import { withEthersProvider } from "@/lib/evm/ethers-provider";
import { assertGasReserve } from "@/lib/evm/gas-reserve";

import { type DepositLookup, describeDepositLookup } from "./deposit-lookup";
import type { PendingDepositRequest } from "./deposit-sweep";
import { derivePathAddress, type PathRendering, resolvePathRendering } from "./evm-addresses";
import {
  ERC20_TRANSFER_GAS_LIMIT as GAS_LIMIT,
  ERC20_TRANSFER_MAX_FEE_PER_GAS as MAX_FEE,
  ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS as PRIORITY_FEE,
  MPC_OPERATION_ETH_RESERVE,
  STATA_GAS_LIMIT,
  STATA_MAX_FEE_PER_GAS,
  STATA_MAX_PRIORITY_FEE_PER_GAS,
  SWAP_GAS_LIMIT,
  SWAP_MAX_FEE_PER_GAS,
  SWAP_MAX_PRIORITY_FEE_PER_GAS,
} from "./evm-envelope";
import {
  AAVE_USDC,
  APPROVE_SELECTOR as STATA_APPROVE_SELECTOR,
  MAX_APPROVE as STATA_MAX_APPROVE,
  REDEEM_MPC_ROUTING,
  REDEEM_OUTPUT_SCHEMA,
  REDEEM_RESPOND_SCHEMA,
  STATA_DEPOSIT_SELECTOR,
  STATA_REDEEM_SELECTOR,
  STATA_USDC,
  SUPPLY_MPC_ROUTING,
  SUPPLY_OUTPUT_SCHEMA,
  SUPPLY_RESPOND_SCHEMA,
} from "./evm-stata";
import {
  APPROVE_SELECTOR,
  EXACT_OUTPUT_SINGLE_SELECTOR,
  MAX_APPROVE,
  quoteExactInputSingle,
  routerAllowance,
  SWAP_MPC_ROUTING,
  SWAP_OUTPUT_SCHEMA,
  SWAP_RESPOND_SCHEMA,
  UNISWAP_SWAP_ROUTER_02,
} from "./evm-swap";
import type { OperationProgress, VaultExecutionResult } from "./flow";
import { observeExecution } from "./observed-execution";
import type { StandaloneVaultContract } from "./vault-providers";

const ERC20_TRANSFER_SELECTOR = new Uint8Array([0xa9, 0x05, 0x9c, 0xbb]);
const BOOLEAN_RESULT_SCHEMA = '[{"name":"success","type":"bool"}]';
const VAULT_PATH = asciiPadded("vault", PATH_BYTES);
const MINUTE = 60_000;

/** Boolean response schemas shared by ERC20 transfers and approval requests. */
export const BOOLEAN_RESULT_MPC_ROUTING = {
  algo: MPCSignatureAlgorithm.ecdsa,
  dest: MPCDestination.unused,
  params: new Uint8Array(MPC_PARAMS_BYTES),
  outputDeserializationSchema: asciiPadded(BOOLEAN_RESULT_SCHEMA, BOOLEAN_RESULT_SCHEMA.length),
  respondSerializationSchema: asciiPadded(BOOLEAN_RESULT_SCHEMA, BOOLEAN_RESULT_SCHEMA.length),
};

/** Public deployment inputs captured before a vault session is constructed. */
export interface Env {
  contractAddress: string; // Midnight vault contract
  signetContractAddress: string; // Midnight central signet contract
  mpcSecpPub: string; // MPC root secp256k1 pubkey (0x hex)
  evmRpcUrl: string;
  verifyRpcChain?: boolean;
}

const addrBytes = (hex: string): Uint8Array => hexToBytes(stripHexPrefix(hex));
const TRANSIENT_RPC = /timeout|network error|failed to fetch|connection|econn|socket/i;
async function rpcStep<T>(step: string, attempts: number, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const code = typeof e === "object" && e !== null && "code" in e ? e.code : undefined;
      const message =
        typeof e === "object" && e !== null && "message" in e ? String(e.message) : "";
      const transient =
        code === "TIMEOUT" || code === "NETWORK_ERROR" || TRANSIENT_RPC.test(message);
      if (!transient || attempt === attempts) break;
      await sleep(2000 * attempt);
    }
  }
  const detail =
    typeof lastError === "object" &&
    lastError !== null &&
    "message" in lastError &&
    lastError.message != null &&
    typeof lastError.message === "string"
      ? lastError.message
      : String(lastError);
  throw new Error(`${step} failed after ${attempts.toString()} attempts: ${detail}`);
}

/**
 * Local deadline for observing an MPC response, elapsed while the request was still outstanding.
 *
 * The request remains live on the ledger and nothing was submitted a second time, so a caller
 * resumes the same request by its ID. This is never evidence that the operation failed on chain.
 */
export class SettlementObservationTimeout extends Error {
  readonly requestId: RequestIdHex;
  readonly stage: "signature" | "attestation";
  /**
   * @param stage - MPC response whose observation ran out of time.
   * @param requestId - Request that stays live on the ledger.
   * @param waitedMs - Length of the observation this client performed.
   * @param options - Standard error options carrying the last failed read as the cause.
   */
  constructor(
    stage: "signature" | "attestation",
    requestId: RequestIdHex,
    waitedMs: number,
    options?: ErrorOptions,
  ) {
    const minutes = Math.round(waitedMs / MINUTE).toString();
    const subject =
      stage === "signature" ? "MPC signature" : "MPC attestation of the EVM execution";
    super(
      `The ${subject} for request ${requestId} has not arrived within ${minutes} minutes of observation. The request is still live on chain: recover it with this request ID.`,
      options,
    );
    this.name = "SettlementObservationTimeout";
    this.requestId = requestId;
    this.stage = stage;
  }
}

// The reported settlement wait is around fifteen minutes. That is a reported duration and not a
// protocol maximum, so this limit bounds how long this client keeps observing. Elapsing it reports
// an unfinished observation of a live request.
const MPC_OBSERVATION_LIMIT = 20 * MINUTE;
// One-second polling keeps the first reading fresh, and a wait that runs into minutes backs off so
// a fifteen-minute observation costs hundreds of ledger reads.
const POLL_BACKOFF_STEPS = [
  { untilMs: 30_000, intervalMs: 1000 },
  { untilMs: 2 * MINUTE, intervalMs: 2000 },
] as const;
const POLL_INTERVAL_CEILING_MS = 5000;
// A read that keeps failing is reported as itself, so a persistent fault never masquerades as a
// slow MPC while a transient one never ends an operation that is still progressing.
const MAX_CONSECUTIVE_READ_FAILURES = 5;

/**
 * @param elapsedMs - Time spent in the current wait.
 * @returns The interval before the next poll of the same wait.
 */
export function pollBackoffMs(elapsedMs: number): number {
  return (
    POLL_BACKOFF_STEPS.find((step) => elapsedMs < step.untilMs)?.intervalMs ??
    POLL_INTERVAL_CEILING_MS
  );
}

const rand32 = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Memory-owned secret and both deployment-compatible renderings of its commitment path. */
export interface Identity {
  secretKey: Uint8Array;
  commitment: Uint8Array;
  /** UTF-8 decode of the path bytes with NULs stripped. */
  pathString: string;
  /** Lowercase hex of the full 32 path bytes, padding included. */
  pathHex: string;
}

/**
 * Retains the supplied secret reference so its session owner can erase it on disposal.
 *
 * @param secretKey - Session-owned copy of the vault secret.
 * @returns Commitment and path renderings paired with the retained secret.
 */
export function deriveIdentity(secretKey: Uint8Array): Identity {
  const commitment = vaultPureCircuits.userCommitment(secretKey);
  const pathString = new TextDecoder("utf-8").decode(commitment).replace(/\0/g, "");
  return { secretKey, commitment, pathString, pathHex: bytesToHex(commitment) };
}

/** Pins address derivation and operation eligibility to one live binding generation. */
export type VaultSessionEnvironment = Env & {
  readonly pathRendering: PathRendering;
  assertActive: () => void;
};

/**
 * Verifies captured RPC discovery policy and Midnight vault address rendering before binding.
 *
 * @param providers - Providers bound to the captured deployment.
 * @param env - Public deployment inputs.
 * @param signal - Cancels deployment reads when their binding is superseded.
 * @returns The rendering that matches the deployed vault address.
 */
export async function resolveVaultDeployment(
  providers: VaultProviders,
  env: Env,
  signal?: AbortSignal,
): Promise<PathRendering> {
  if (env.verifyRpcChain !== false)
    await withEthersProvider(
      env.evmRpcUrl,
      async (provider) => {
        const network = await provider.getNetwork();
        if (network.chainId !== BigInt(sepolia.id))
          throw new Error("Vault operations require a Sepolia RPC with chain ID 11155111.");
      },
      { timeoutMs: 15_000, signal },
    );
  const state = await readVaultLedger(providers, env);
  return resolvePathRendering(env, bytesToHex(state.vaultEvmAddress));
}

/**
 * Derives the identity deposit destination only while its binding remains active.
 *
 * @param env - Session generation and verified rendering.
 * @param identity - Commitment path for the depositing identity.
 * @returns The EVM deposit destination.
 */
export function depositAddress(env: VaultSessionEnvironment, identity: Identity): string {
  env.assertActive();
  return derivePathAddress(env, identity.pathHex, env.pathRendering);
}

/**
 * Derives the pooled destination using the rendering verified for this session.
 *
 * @param env - Active session generation and verified rendering.
 * @returns The EVM pooled vault destination.
 */
export function vaultAddress(env: VaultSessionEnvironment): string {
  env.assertActive();
  return derivePathAddress(env, VAULT_PATH_HEX, env.pathRendering);
}

/**
 * Normalises the generated vault colour for comparison with wallet balance keys.
 *
 * @param erc20Hex - EVM token address.
 * @param vaultContractAddress - Midnight contract owning the colour.
 * @returns Lowercase colour hex without a prefix.
 */
export function vaultTokenType(erc20Hex: string, vaultContractAddress: string): string {
  return rawTokenType(
    vaultPureCircuits.vaultTokenDomainSeparator(addrBytes(erc20Hex)),
    vaultContractAddress,
  )
    .replace(/^0x/, "")
    .toLowerCase();
}

/**
 * Reads exact ERC-20 units through the connection shared with transaction continuation.
 *
 * @param rpcUrl - Captured EVM endpoint.
 * @param erc20Hex - ERC-20 contract address.
 * @param address - Balance owner.
 * @returns Unscaled token units.
 */
export async function erc20Balance(
  rpcUrl: string,
  erc20Hex: string,
  address: string,
): Promise<bigint> {
  return withEthersProvider(rpcUrl, async (provider) => {
    const token = new EthersContract(
      erc20Hex,
      ["function balanceOf(address) view returns (uint256)"],
      provider,
    );
    return token.getFunction<ContractMethod<string[], bigint, bigint>>("balanceOf")(address);
  });
}

async function requireSweepReserve(
  env: VaultSessionEnvironment,
  depositEvm: string,
): Promise<void> {
  let observed: bigint | undefined;
  let failed = false;
  try {
    observed = await withEthersProvider(env.evmRpcUrl, async (provider) =>
      provider.getBalance(depositEvm),
    );
  } catch {
    failed = true;
  }
  env.assertActive();
  assertGasReserve({
    purpose: "deposit-sweep",
    required: MPC_OPERATION_ETH_RESERVE.deposit,
    observed,
    failed,
  });
}

async function readVaultLedger(
  providers: VaultProviders,
  env: Env,
): Promise<ReturnType<typeof ledger>> {
  const cs = await providers.publicDataProvider.queryContractState(env.contractAddress);
  if (!cs) throw new Error(`no contract state at ${env.contractAddress}`);
  return ledger(cs.data);
}

function responseReader(
  providers: VaultProviders,
  env: VaultSessionEnvironment,
  requestsPath: readonly number[] = VAULT_REQUESTS_PATH,
): SignetRequestResponseReader {
  return new SignetRequestResponseReader({
    requesterContractAddress: env.contractAddress,
    requesterRequestsPath: [...requestsPath],
    signetContractAddress: env.signetContractAddress,
    publicDataProvider: providers.publicDataProvider,
    eventSource: signetEventSourceFromPublicDataProvider(providers.publicDataProvider),
  });
}

/**
 * Keeps transfer request lookup aligned with the generated circuit's emitted record.
 *
 * @param env - Captured requester deployment.
 * @param before - Ledger snapshot supplying the request nonce and EVM chain.
 * @param path - Caller commitment or shared vault derivation path.
 * @param nonce - EVM account nonce captured before submission.
 * @param erc20 - Token contract called by the request.
 * @param transferTo - Receiver encoded into the transfer calldata.
 * @param amount - Exact base units encoded into the transfer calldata.
 * @returns The key used to locate the circuit's request after submission.
 */
export function predictRequestId(
  env: VaultSessionEnvironment,
  before: ReturnType<typeof ledger>,
  path: Uint8Array,
  nonce: bigint,
  erc20: Uint8Array,
  transferTo: Uint8Array,
  amount: bigint,
): RequestIdHex {
  const expected: SignBidirectionalEvent = {
    sender: { bytes: addrBytes(env.contractAddress) },
    requestNonce: before.signetRequestNonce,
    keyVersion: SIGNET_DEFAULT_KEY_VERSION,
    path,
    ...BOOLEAN_RESULT_MPC_ROUTING,
    txParamType: TxParamType.evmType2,
    caip2Id: signetPureCircuits.ethereumCaip2Id(),
    txParams: {
      to: erc20,
      chainId: before.evmChainId,
      nonce,
      gasLimit: GAS_LIMIT,
      maxFeePerGas: MAX_FEE,
      maxPriorityFeePerGas: PRIORITY_FEE,
      value: 0n,
      accessListEntryCount: 0n,
      accessList: [],
      calldata: {
        is_some: true,
        value: {
          selector: ERC20_TRANSFER_SELECTOR,
          noWords: 2n,
          words: [evmAddressAbiWord(transferTo), numericAbiWord(amount)],
        },
      },
    },
  };
  return requestIdHex(calculateRequestId(expected));
}

async function assertRequestOnLedger(
  providers: VaultProviders,
  env: VaultSessionEnvironment,
  rid: RequestIdHex,
  circuit: string,
): Promise<void> {
  const after = await readVaultLedger(providers, env);
  if (!toSignBidirectionalEventIndex(after.signBidirectionalEventMap).has(rid)) {
    throw new Error(`request ${rid} not on the ledger after ${circuit}()`);
  }
}

async function assertDepositRequestOnLedger(
  providers: VaultProviders,
  env: VaultSessionEnvironment,
  rid: RequestIdHex,
): Promise<void> {
  const after = await readVaultLedger(providers, env);
  if (!toSignBidirectionalEventIndex(after.depositEventMap).has(rid)) {
    throw new Error(`deposit request ${rid} not on the ledger after startDeposit()`);
  }
}

async function assertSwapRequestOnLedger(
  providers: VaultProviders,
  env: VaultSessionEnvironment,
  rid: RequestIdHex,
): Promise<void> {
  const after = await readVaultLedger(providers, env);
  if (!toSignBidirectionalEventIndex(after.swapEventMap).has(rid)) {
    throw new Error(`swap request ${rid} not on the ledger after startSwap()`);
  }
}

/**
 * Keeps approval and swap request lookup aligned with their generated circuit envelopes.
 *
 * @param env - Captured requester deployment.
 * @param before - Ledger snapshot supplying the request nonce and EVM chain.
 * @param path - Circuit-specific derivation path.
 * @param nonce - EVM account nonce captured before submission.
 * @param to - Contract receiving the encoded call.
 * @param routing - Signature and output schemas paired with this circuit.
 * @param gasLimit - Gas limit shared with the circuit envelope.
 * @param maxFee - Fee cap shared with the circuit envelope.
 * @param priorityFee - Priority cap shared with the circuit envelope.
 * @param selector - Function selector shared with the circuit call.
 * @param words - ABI words in the circuit's declared order.
 * @returns The key used to locate the circuit's request after submission.
 */
export function predictCallRequestId(
  env: VaultSessionEnvironment,
  before: ReturnType<typeof ledger>,
  path: Uint8Array,
  nonce: bigint,
  to: Uint8Array,
  routing: Pick<
    SignBidirectionalEvent,
    "algo" | "dest" | "params" | "outputDeserializationSchema" | "respondSerializationSchema"
  >,
  gasLimit: bigint,
  maxFee: bigint,
  priorityFee: bigint,
  selector: Uint8Array,
  words: Uint8Array[],
): RequestIdHex {
  const expected: SignBidirectionalEvent = {
    sender: { bytes: addrBytes(env.contractAddress) },
    requestNonce: before.signetRequestNonce,
    keyVersion: SIGNET_DEFAULT_KEY_VERSION,
    path,
    ...routing,
    txParamType: TxParamType.evmType2,
    caip2Id: signetPureCircuits.ethereumCaip2Id(),
    txParams: {
      to,
      chainId: before.evmChainId,
      nonce,
      gasLimit,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: priorityFee,
      value: 0n,
      accessListEntryCount: 0n,
      accessList: [],
      calldata: {
        is_some: true,
        value: { selector, noWords: BigInt(words.length), words },
      },
    },
  };
  return requestIdHex(calculateRequestId(expected));
}

async function pollSignatureResponse(
  progress: OperationProgress,
  providers: VaultProviders,
  env: VaultSessionEnvironment,
  requestId: RequestIdHex,
  expectedSigner: string,
  log: (m: string) => void,
  requestsPath: readonly number[] = VAULT_REQUESTS_PATH,
  timeoutMs = MPC_OBSERVATION_LIMIT,
): Promise<Transaction> {
  const reader = responseReader(providers, env, requestsPath);
  const started = Date.now();
  const end = started + timeoutMs;
  const warned = new Set<bigint>();
  let consecutiveFailures = 0;
  let lastFailure: unknown;
  while (Date.now() < end) {
    env.assertActive();
    try {
      const { verified, verdicts } = await reader.getVerifiedSignatureRespondedEvent(
        requestId,
        expectedSigner,
      );
      consecutiveFailures = 0;
      lastFailure = undefined;
      progress.observed();
      for (const v of verdicts) {
        if (v.rejectedReason !== undefined && !warned.has(v.index)) {
          warned.add(v.index);
          log(`ignoring response post ${v.index.toString()}: ${v.rejectedReason}`);
        }
      }
      if (verified !== undefined) {
        const request = await reader.getSignatureRequest(requestId);
        return signBidirectionalEventToSignedEvmTransaction(request, verified);
      }
    } catch (failure) {
      env.assertActive();
      consecutiveFailures += 1;
      lastFailure = failure;
      if (consecutiveFailures >= MAX_CONSECUTIVE_READ_FAILURES) throw failure;
      log(`signature response read failed, retrying: ${failureDetail(failure)}`);
    }
    await sleep(pollBackoffMs(Date.now() - started));
  }
  throw new SettlementObservationTimeout("signature", requestId, timeoutMs, {
    cause: lastFailure,
  });
}

/**
 * Retains the same signed transaction across retries and receipt recovery.
 * Settle flows accept mined reverts for failure attestation, while sign-only approvals reject them.
 *
 * @param env - Session checked before every broadcast attempt.
 * @param tx - Captured signed transaction retained across receipt polling.
 * @param opts - Continuation policy for mined reverts and observation sinks.
 * @param opts.throwOnRevert - Treats a mined revert as a fatal sign-only approval failure.
 * @param opts.onBroadcast - Reports the hash once the transaction is on the network, which is
 *   before the receipt wait begins, so a surface can show the pending transaction.
 * @param opts.onReceipt - Reports the mined block of that same transaction.
 * @returns Completion after the same transaction is mined.
 */
export async function broadcastEvm(
  env: VaultSessionEnvironment,
  tx: Transaction,
  opts: {
    throwOnRevert?: boolean;
    onBroadcast?: (hash: string) => void;
    onReceipt?: (hash: string, blockNumber: number) => void;
  } = {},
): Promise<void> {
  const { throwOnRevert = true, onBroadcast, onReceipt } = opts;
  return withEthersProvider(env.evmRpcUrl, async (provider) => {
    const { hash } = tx;
    if (!hash) throw new Error("signed tx missing hash");
    const mined = await rpcStep("receipt lookup", 3, () => provider.getTransactionReceipt(hash));
    if (mined) {
      onBroadcast?.(hash);
      onReceipt?.(hash, mined.blockNumber);
      if (mined.status === 0 && throwOnRevert) throw new Error(`sweep ${hash} reverted`);
      return;
    }
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; ; attempt++) {
      try {
        await rpcStep("broadcast", 3, () => {
          env.assertActive();
          return provider.broadcastTransaction(tx.serialized);
        });
        break;
      } catch (e) {
        env.assertActive();
        const code = typeof e === "object" && e !== null && "code" in e ? e.code : undefined;
        const msg = (
          typeof e === "object" && e !== null && "message" in e ? String(e.message) : ""
        ).toLowerCase();
        // A repeated broadcast can report an existing transaction before receipt polling.
        if (
          code === "NONCE_EXPIRED" ||
          msg.includes("already known") ||
          msg.includes("nonce too low")
        )
          break;
        if (attempt >= MAX_ATTEMPTS || msg.includes("insufficient funds")) throw e;
        await sleep(2000);
      }
    }
    onBroadcast?.(hash);
    // A lost receipt poll must recheck the submitted transaction before failing continuation.
    const receipt = await rpcStep("receipt wait", 3, async () => {
      const r = await provider.waitForTransaction(hash, 1, 3 * MINUTE);
      return r ?? (await provider.getTransactionReceipt(hash));
    });
    if (!receipt)
      throw new Error(
        `Transaction ${hash} has not been mined within the receipt observation limit. It is on the network and the same hash can be rechecked.`,
      );
    onReceipt?.(hash, receipt.blockNumber);
    if (receipt.status === 0 && throwOnRevert) throw new Error(`sweep ${hash} reverted`);
  });
}

/** Decoded execution output remains paired with its verified attestation. */
interface AttestedRespondOutcome {
  event: RespondBidirectionalEvent;
  serializedOutput: Uint8Array;
  decoded: AbiDecodedOutput | undefined;
  succeeded: boolean;
  matchedFailureOutput: boolean;
}

/**
 * Accepts observed output only when its attestation verifies against the vault ledger response key.
 *
 * @param providers - Captured ledger and emitted-event capabilities.
 * @param env - Session owning the requester and EVM observation.
 * @param requestId - Request whose observed output and attestation must agree.
 * @param requestsPath - Ledger collection paired with the operation circuit.
 * @param schema - ABI schema used to decode observed EVM output.
 * @param respondSchema - Serialisation schema paired with the completion circuit.
 * @returns A verified outcome, or undefined while no candidate has a valid attestation.
 */
export async function fetchAttestedRespondOutcome(
  providers: VaultProviders,
  env: VaultSessionEnvironment,
  requestId: RequestIdHex,
  requestsPath: readonly number[] = VAULT_REQUESTS_PATH,
  schema: string = BOOLEAN_RESULT_SCHEMA,
  respondSchema: string = schema,
): Promise<AttestedRespondOutcome | undefined> {
  const reader = responseReader(providers, env, requestsPath);
  if ((await reader.getRespondBidirectionalEvents(requestId)).length === 0) return undefined;
  const { mpcResponseKey } = await readVaultLedger(providers, env);
  const observed = await withEthersProvider(env.evmRpcUrl, (provider) =>
    observeExecution(reader, provider, requestId, env.assertActive),
  );
  if (!observed) return undefined;
  const candidates: { serializedOutput: Uint8Array; isFailure: boolean }[] = [];
  let decodedValue: AbiDecodedOutput | undefined;
  if (observed.success && observed.output !== null) {
    try {
      const decoded = deserializeEvmOutput(schema, observed.output);
      decodedValue = decoded;
      candidates.push({
        serializedOutput: serializeRespondOutput(respondSchema, decoded),
        isFailure: false,
      });
    } catch {
      /* only the failure candidate can match */
    }
  }
  candidates.push({ serializedOutput: MPC_FAILURE_OUTPUT, isFailure: true });
  for (const c of candidates) {
    const event = await reader.getVerifiedRespondBidirectionalEvent(
      requestId,
      c.serializedOutput,
      mpcResponseKey,
    );
    if (event) {
      return {
        event,
        serializedOutput: c.serializedOutput,
        decoded: c.isFailure ? undefined : decodedValue,
        succeeded: !c.isFailure && decodedValue?.success === true,
        matchedFailureOutput: c.isFailure,
      };
    }
  }
  return undefined;
}

/** Public part of a finalised circuit call, which is the only part an operation record keeps. */
interface MidnightClaimTx {
  readonly public: Pick<FinalizedTxData, "txHash" | "blockHeight">;
}

/**
 * @param progress - Checkpoint sink of the captured operation.
 * @param claim - Finalised circuit call that concluded the operation on Midnight.
 * @returns The Midnight transaction hash of that call.
 */
function settledOnMidnight(progress: OperationProgress, claim: MidnightClaimTx): string {
  progress.event({
    name: "midnight-settled",
    midnightTxHash: claim.public.txHash,
    midnightBlockHeight: claim.public.blockHeight,
  });
  return claim.public.txHash;
}

async function settleViaMpc(
  progress: OperationProgress,
  providers: VaultProviders,
  env: VaultSessionEnvironment,
  rid: RequestIdHex,
  expectedSigner: string,
  log: (m: string) => void,
  requestsPath: readonly number[] = VAULT_REQUESTS_PATH,
  schema: string = BOOLEAN_RESULT_SCHEMA,
  respondSchema: string = schema,
  onEvmBroadcast?: (hash: string) => void,
): Promise<AttestedRespondOutcome & { evmTxHash: string | undefined }> {
  env.assertActive();
  progress.set("settling");
  log("Waiting for MPC signature and EVM settlement...");
  progress.event({ name: "signature-wait", requestId: rid });
  const signed = await pollSignatureResponse(
    progress,
    providers,
    env,
    rid,
    expectedSigner,
    log,
    requestsPath,
  );
  await broadcastEvm(env, signed, {
    throwOnRevert: false,
    onBroadcast: (hash) => {
      progress.event({ name: "evm-broadcast", evmTxHash: hash });
      onEvmBroadcast?.(hash);
    },
    onReceipt: (hash, blockNumber) => {
      progress.observed();
      progress.event({ name: "evm-receipt", evmTxHash: hash, evmBlockNumber: blockNumber });
    },
  });
  progress.event({ name: "attestation-wait", requestId: rid });
  const started = Date.now();
  const end = started + MPC_OBSERVATION_LIMIT;
  let consecutiveFailures = 0;
  let lastFailure: unknown;
  while (Date.now() < end) {
    env.assertActive();
    try {
      const outcome = await fetchAttestedRespondOutcome(
        providers,
        env,
        rid,
        requestsPath,
        schema,
        respondSchema,
      );
      consecutiveFailures = 0;
      lastFailure = undefined;
      progress.observed();
      if (outcome) {
        progress.event({
          name: "attestation-present",
          requestId: rid,
          succeeded: outcome.succeeded,
        });
        return { ...outcome, evmTxHash: signed.hash ?? undefined };
      }
    } catch (failure) {
      env.assertActive();
      consecutiveFailures += 1;
      lastFailure = failure;
      if (consecutiveFailures >= MAX_CONSECUTIVE_READ_FAILURES) throw failure;
      log(`attestation read failed, retrying: ${failureDetail(failure)}`);
    }
    await sleep(pollBackoffMs(Date.now() - started));
  }
  throw new SettlementObservationTimeout("attestation", rid, MPC_OBSERVATION_LIMIT, {
    cause: lastFailure,
  });
}

const failureDetail = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Resolves one request ID against the selected vault, identity and token as a distinct outcome.
 *
 * `completeDeposit` is the only circuit that removes a settled view, so an attested response with
 * no view left on this ledger is the evidence that the request was completed here. Without that
 * response the outcome is `not-found`, which never asserts that the deposit did not happen.
 *
 * @param providers - Captured ledger and emitted-event read capabilities.
 * @param env - Session whose validity is rechecked after every read.
 * @param identity - Expected commitment owner.
 * @param erc20Hex - Expected EVM token.
 * @param requestId - Request being resolved.
 * @returns The outcome, including the exact units a recoverable request settles.
 */
export async function lookupDepositRequest(
  providers: VaultProviders,
  env: VaultSessionEnvironment,
  identity: Identity,
  erc20Hex: string,
  requestId: string,
): Promise<DepositLookup> {
  let parsed: RequestIdHex;
  try {
    parsed = parseRequestIdHex(requestId.trim());
  } catch {
    return { kind: "malformed" };
  }
  const id = requestIdBytes(parsed);
  let state: ReturnType<typeof ledger>;
  try {
    state = await readVaultLedger(providers, env);
  } catch (error) {
    return { kind: "error", cause: failureDetail(error) };
  }
  env.assertActive();
  if (!state.initialised) return { kind: "mismatched", requestId: parsed, mismatch: "deployment" };
  if (state.depositEventMap.member(id) && state.depositSettleViews.member(id)) {
    const view = state.depositSettleViews.lookup(id);
    if (bytesToHex(view.commitment) !== bytesToHex(identity.commitment))
      return { kind: "mismatched", requestId: parsed, mismatch: "identity" };
    if (bytesToHex(view.erc20) !== bytesToHex(addrBytes(erc20Hex)))
      return { kind: "mismatched", requestId: parsed, mismatch: "token" };
    return { kind: "recoverable", requestId: parsed, units: view.amount };
  }
  try {
    const responded = await responseReader(
      providers,
      env,
      VAULT_DEPOSIT_REQUESTS_PATH,
    ).getRespondBidirectionalEvents(parsed);
    env.assertActive();
    if (responded.length > 0) return { kind: "completed", requestId: parsed };
  } catch (error) {
    return { kind: "error", cause: failureDetail(error) };
  }
  return { kind: "not-found", requestId: parsed };
}

/**
 * Lists every deposit request this identity still has to settle for one token.
 *
 * Each pending request already owns a sweep signed against the deposit address's current EVM
 * nonce, so callers use this list to keep a second sweep from being created beside it.
 *
 * @param providers - Captured ledger read capability.
 * @param env - Session whose validity is rechecked after the read.
 * @param identity - Commitment owning the requests.
 * @param erc20Hex - Token whose requests are listed.
 * @returns Pending request identifiers with the exact units each one sweeps.
 */
export async function readPendingDeposits(
  providers: VaultProviders,
  env: VaultSessionEnvironment,
  identity: Identity,
  erc20Hex: string,
): Promise<PendingDepositRequest[]> {
  const erc20 = addrBytes(erc20Hex);
  const state = await readVaultLedger(providers, env);
  env.assertActive();
  return [...state.depositSettleViews]
    .filter(
      ([, view]) =>
        bytesToHex(view.commitment) === bytesToHex(identity.commitment) &&
        bytesToHex(view.erc20) === bytesToHex(erc20),
    )
    .map(([id, view]) => ({ requestId: requestIdHex(id), units: view.amount }));
}

/**
 * Resumes a recorded deposit or starts one request, preserving its identifiers before continuation.
 *
 * @param progress - Captured operation checkpoint sink.
 * @param providers - Captured proof, ledger and submission capabilities.
 * @param vault - Standalone circuit calls guarded by the binding generation.
 * @param env - Captured deployment and active-generation check.
 * @param identity - Commitment identifying the depositing owner.
 * @param erc20Hex - ERC-20 token being moved.
 * @param amount - Exact unscaled input units.
 * @param log - Operation progress sink.
 * @param onRecord - Retains request and transaction identifiers for continuation.
 * @param recoveryRequestId - Existing pending request to resume without starting another deposit.
 * @returns Completion after the shielded deposit is settled.
 * @throws {Error} If captured inputs, execution or attestation cannot be verified.
 */
export async function runDeposit(
  progress: OperationProgress,
  providers: VaultProviders,
  vault: StandaloneVaultContract,
  env: VaultSessionEnvironment,
  identity: Identity,
  erc20Hex: string,
  amount: bigint,
  log: (m: string) => void,
  onRecord?: (rid: RequestIdHex, evmTxHash?: string) => void,
  recoveryRequestId?: string,
): Promise<VaultExecutionResult> {
  env.assertActive();
  const erc20 = addrBytes(erc20Hex);
  const userEvm = depositAddress(env, identity);
  const before = await readVaultLedger(providers, env);
  if (!before.initialised) throw new Error("vault not initialised");
  const pendingForToken = [...before.depositSettleViews].filter(
    ([, view]) =>
      bytesToHex(view.commitment) === bytesToHex(identity.commitment) &&
      bytesToHex(view.erc20) === bytesToHex(erc20),
  );
  const pending = pendingForToken.filter(([, view]) => view.amount === amount);
  if (!recoveryRequestId && pending.length > 1)
    throw new Error(
      "Multiple pending deposits match this identity, token and amount. Select a specific request before continuing.",
    );
  let rid: RequestIdHex;
  if (recoveryRequestId) {
    const lookup = await lookupDepositRequest(
      providers,
      env,
      identity,
      erc20Hex,
      recoveryRequestId,
    );
    if (lookup.kind !== "recoverable") {
      const described = describeDepositLookup(lookup);
      throw new Error(`${described.summary} ${described.nextAction}`);
    }
    if (lookup.units !== amount) throw new Error("Pending deposit amount changed.");
    rid = lookup.requestId;
    progress.event({ name: "request-confirmed", requestId: rid });
    log(`Recovering pending deposit 0x${rid}`);
  } else if (pending[0]) {
    rid = requestIdHex(pending[0][0]);
    const unspent = await erc20Balance(env.evmRpcUrl, erc20Hex, userEvm);
    env.assertActive();
    if (unspent >= amount)
      throw new Error(
        `Pending deposit 0x${rid} requires explicit recovery before sweeping newly available funds.`,
      );
    await assertDepositRequestOnLedger(providers, env, rid);
    progress.event({ name: "request-confirmed", requestId: rid });
    log(`Resuming pending deposit 0x${rid}`);
  } else if (pendingForToken[0]) {
    // Every pending request owns a sweep signed against this address's current EVM nonce, so a
    // request created beside one of a different amount could never be mined.
    throw new Error(
      `Pending deposit 0x${requestIdHex(pendingForToken[0][0])} already claims the next sweep from this deposit address. Recover it by its request ID before depositing a different amount.`,
    );
  } else {
    // Only a brand-new request signs a sweep that still has to be broadcast, so only this branch
    // requires the deposit address to hold its fee reserve. A resumed or recovered request may
    // have spent that reserve on a sweep that is already on chain.
    await requireSweepReserve(env, userEvm);
    const nonce = await evmNonce(env, userEvm);
    log(`Deposit sender ${userEvm} (evm nonce ${nonce.toString()})`);
    rid = predictRequestId(
      env,
      before,
      identity.commitment,
      nonce,
      erc20,
      before.vaultEvmAddress,
      amount,
    );
    log(`Predicted requestId 0x${rid}`);
    env.assertActive();
    progress.set("proving");
    log("Submitting startDeposit() on Midnight...");
    await vault.callTx.startDeposit(
      nonce,
      GAS_LIMIT,
      MAX_FEE,
      PRIORITY_FEE,
      SIGNET_DEFAULT_KEY_VERSION,
      { erc20Address: erc20, amount },
    );
    progress.event({ name: "request-submitted", predictedRequestId: rid });
    await assertDepositRequestOnLedger(providers, env, rid);
    progress.observed();
    progress.event({ name: "request-confirmed", requestId: rid });
  }
  onRecord?.(rid);

  const outcome = await settleViaMpc(
    progress,
    providers,
    env,
    rid,
    userEvm,
    log,
    VAULT_DEPOSIT_REQUESTS_PATH,
    BOOLEAN_RESULT_SCHEMA,
    BOOLEAN_RESULT_SCHEMA,
    (hash) => {
      onRecord?.(rid, hash);
    },
  );
  onRecord?.(rid, outcome.evmTxHash);
  if (!outcome.succeeded) throw new Error(`MPC attested deposit ${rid} as FAILED`);

  env.assertActive();

  progress.set("claim-proving");
  log("Submitting completeDeposit() to mint shielded token...");
  const selfRecipient = {
    is_some: false,
    value: {
      is_left: true,
      left: { bytes: new Uint8Array(32) },
      right: { bytes: new Uint8Array(32) },
    },
  };
  const claim = await vault.callTx.completeDeposit(
    requestIdBytes(rid),
    respondBidirectionalEventToCircuitInput(outcome.event),
    outcome.serializedOutput,
    rand32(),
    selfRecipient,
  );
  env.assertActive();
  log("Deposit complete. Shielded token minted.");
  return {
    status: "settled",
    outputUnits: null,
    midnightTxHash: settledOnMidnight(progress, claim),
  };
}

/**
 * Retains withdrawal identity through signing, EVM settlement and the distinct refund outcome.
 *
 * @param progress - Captured operation checkpoint sink.
 * @param providers - Captured proof, ledger and submission capabilities.
 * @param vault - Standalone circuit calls guarded by the binding generation.
 * @param env - Captured deployment and active-generation check.
 * @param _identity - Captured operation identity retained in the common caller contract.
 * @param erc20Hex - ERC-20 token being moved.
 * @param amount - Exact unscaled input units.
 * @param destHex - Captured withdrawal destination.
 * @param log - Operation progress sink.
 * @param onRecord - Retains request and transaction identifiers for continuation.
 * @returns Completion of withdrawal settlement or its refund.
 * @throws {Error} If captured inputs, execution or attestation cannot be verified.
 */
export async function runWithdraw(
  progress: OperationProgress,
  providers: VaultProviders,
  vault: StandaloneVaultContract,
  env: VaultSessionEnvironment,
  _identity: Identity,
  erc20Hex: string,
  amount: bigint,
  destHex: string,
  log: (m: string) => void,
  onRecord?: (rid: RequestIdHex, evmTxHash?: string) => void,
): Promise<VaultExecutionResult> {
  env.assertActive();
  const erc20 = addrBytes(erc20Hex);
  const dest = addrBytes(destHex);
  const vaultEvm = vaultAddress(env);
  const nonce = await evmNonce(env, vaultEvm);
  log(`Withdraw sender (vault) ${vaultEvm} (evm nonce ${nonce.toString()})`);

  const before = await readVaultLedger(providers, env);
  if (!before.initialised) throw new Error("vault not initialised");
  const rid = predictRequestId(env, before, VAULT_PATH, nonce, erc20, dest, amount);

  const coin = {
    nonce: rand32(),
    color: hexToBytes(vaultTokenType(erc20Hex, env.contractAddress)),
    value: amount,
  };

  env.assertActive();

  progress.set("proving");
  log("Submitting startWithdraw() (surrendering the vault coin)...");
  await vault.callTx.startWithdraw(
    nonce,
    SIGNET_DEFAULT_KEY_VERSION,
    { erc20Address: erc20, amount, destEvmAddress: dest },
    coin,
  );
  await assertRequestOnLedger(providers, env, rid, "withdraw");
  onRecord?.(rid);

  const outcome = await settleViaMpc(
    progress,
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_REQUESTS_PATH,
    BOOLEAN_RESULT_SCHEMA,
    BOOLEAN_RESULT_SCHEMA,
    (hash) => {
      onRecord?.(rid, hash);
    },
  );
  onRecord?.(rid, outcome.evmTxHash);

  if (outcome.matchedFailureOutput) {
    env.assertActive();
    progress.set("refunding");
    log("EVM transfer never executed. Refunding...");
    const claim = await vault.callTx.refundWithdraw(
      requestIdBytes(rid),
      respondBidirectionalEventToCircuitInput(outcome.event),
      outcome.serializedOutput,
      rand32(),
    );
    env.assertActive();
    log("Withdraw settled (refunded).");
    return { status: "refunded", midnightTxHash: settledOnMidnight(progress, claim) };
  }
  env.assertActive();
  progress.set("claim-proving");
  log("Settling completeWithdraw...");
  const claim = await vault.callTx.completeWithdraw(
    requestIdBytes(rid),
    respondBidirectionalEventToCircuitInput(outcome.event),
    outcome.serializedOutput,
    rand32(),
  );
  env.assertActive();
  log("Withdraw finalized (success).");
  return {
    status: "settled",
    outputUnits: null,
    midnightTxHash: settledOnMidnight(progress, claim),
  };
}

async function evmNonce(env: VaultSessionEnvironment, address: string): Promise<bigint> {
  return withEthersProvider(env.evmRpcUrl, async (provider) =>
    BigInt(await provider.getTransactionCount(address)),
  );
}

async function ensureRouterApproved(
  progress: OperationProgress,
  providers: VaultProviders,
  vault: StandaloneVaultContract,
  env: VaultSessionEnvironment,
  erc20Hex: string,
  log: (m: string) => void,
): Promise<void> {
  const vaultEvm = vaultAddress(env);
  const allowance = await routerAllowance(env.evmRpcUrl, erc20Hex, vaultEvm);
  if (allowance > 0n) return;

  log("Approving Uniswap router for this token (one-time)...");
  const erc20 = addrBytes(erc20Hex);
  const nonce = await evmNonce(env, vaultEvm);
  const before = await readVaultLedger(providers, env);
  if (!before.initialised) throw new Error("vault not initialised");
  const rid = predictCallRequestId(
    env,
    before,
    VAULT_PATH,
    nonce,
    erc20,
    BOOLEAN_RESULT_MPC_ROUTING,
    GAS_LIMIT,
    MAX_FEE,
    PRIORITY_FEE,
    APPROVE_SELECTOR,
    [evmAddressAbiWord(addrBytes(UNISWAP_SWAP_ROUTER_02)), numericAbiWord(MAX_APPROVE)],
  );
  await vault.callTx.approveRouter(erc20, nonce, SIGNET_DEFAULT_KEY_VERSION);
  await assertRequestOnLedger(providers, env, rid, "approveRouter");

  const signed = await pollSignatureResponse(
    progress,
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_REQUESTS_PATH,
    3 * MINUTE,
  );
  await broadcastEvm(env, signed);
  log("Router approved.");
}

/**
 * Captures an exact-output target from the input quote and retains the same request through settlement.
 *
 * @param progress - Captured operation checkpoint sink.
 * @param providers - Captured proof, ledger and submission capabilities.
 * @param vault - Standalone circuit calls guarded by the binding generation.
 * @param env - Captured deployment and active-generation check.
 * @param _identity - Captured operation identity retained in the common caller contract.
 * @param tokenInHex - Token surrendered by the swap.
 * @param tokenOutHex - Requested output token.
 * @param amountInMaximum - Maximum exact input units captured by the caller.
 * @param log - Operation progress sink.
 * @param fee - Selected pool fee tier.
 * @param slippageBps - Allowed quote slippage in basis points.
 * @param onRecord - Retains request and transaction identifiers for continuation.
 * @returns Completion after output and change settlement or input refund.
 * @throws {Error} If captured inputs, execution or attestation cannot be verified.
 */
export async function runSwap(
  progress: OperationProgress,
  providers: VaultProviders,
  vault: StandaloneVaultContract,
  env: VaultSessionEnvironment,
  _identity: Identity,
  tokenInHex: string,
  tokenOutHex: string,
  amountInMaximum: bigint,
  log: (m: string) => void,
  fee = 500n,
  slippageBps = 100n,
  onRecord?: (rid: RequestIdHex, evmTxHash?: string) => void,
): Promise<VaultExecutionResult> {
  env.assertActive();
  const tokenIn = addrBytes(tokenInHex);
  const tokenOut = addrBytes(tokenOutHex);
  const vaultEvm = vaultAddress(env);

  env.assertActive();
  progress.set("preparing");
  await ensureRouterApproved(progress, providers, vault, env, tokenInHex, log);

  // The UI captures maximum spend, while settlement requires a guaranteed exact output.
  const { amountOut: expectedOut } = await quoteExactInputSingle(
    env.evmRpcUrl,
    tokenInHex,
    tokenOutHex,
    fee,
    amountInMaximum,
  );
  const amountOut = (expectedOut * (10_000n - slippageBps)) / 10_000n;
  if (amountOut <= 0n) throw new Error("swap amount too small to quote an output");
  log(
    `Quote: ${amountInMaximum.toString()} in -> ~${expectedOut.toString()} out (min ${amountOut.toString()}, fee ${fee.toString()})`,
  );

  const nonce = await evmNonce(env, vaultEvm);
  const before = await readVaultLedger(providers, env);
  if (!before.initialised) throw new Error("vault not initialised");
  const rid = predictCallRequestId(
    env,
    before,
    VAULT_PATH,
    nonce,
    addrBytes(UNISWAP_SWAP_ROUTER_02),
    SWAP_MPC_ROUTING,
    SWAP_GAS_LIMIT,
    SWAP_MAX_FEE_PER_GAS,
    SWAP_MAX_PRIORITY_FEE_PER_GAS,
    EXACT_OUTPUT_SINGLE_SELECTOR,
    [
      evmAddressAbiWord(tokenIn),
      evmAddressAbiWord(tokenOut),
      numericAbiWord(fee),
      evmAddressAbiWord(addrBytes(vaultEvm)),
      numericAbiWord(amountOut),
      numericAbiWord(amountInMaximum),
      numericAbiWord(0n),
    ],
  );
  const coin = {
    nonce: rand32(),
    color: hexToBytes(vaultTokenType(tokenInHex, env.contractAddress)),
    value: amountInMaximum,
  };

  env.assertActive();

  progress.set("proving");
  log("Submitting startSwap() (surrendering the tokenIn vault coin)...");
  await vault.callTx.startSwap(
    nonce,
    SIGNET_DEFAULT_KEY_VERSION,
    { tokenIn, tokenOut, fee, amountOut, amountInMaximum },
    coin,
  );
  await assertSwapRequestOnLedger(providers, env, rid);
  onRecord?.(rid);

  const outcome = await settleViaMpc(
    progress,
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_SWAP_REQUESTS_PATH,
    SWAP_OUTPUT_SCHEMA,
    SWAP_RESPOND_SCHEMA,
    (hash) => {
      onRecord?.(rid, hash);
    },
  );
  onRecord?.(rid, outcome.evmTxHash);

  if (outcome.matchedFailureOutput) {
    env.assertActive();
    progress.set("refunding");
    log("Swap did not execute on EVM. Refunding tokenIn...");
    const claim = await vault.callTx.refundSwap(
      requestIdBytes(rid),
      respondBidirectionalEventToCircuitInput(outcome.event),
      outcome.serializedOutput,
      rand32(),
    );
    env.assertActive();
    log("Swap refunded (did not execute).");
    return { status: "refunded", midnightTxHash: settledOnMidnight(progress, claim) };
  }
  env.assertActive();
  progress.set("claim-proving");
  log("Settling completeSwap (minting shielded tokenOut + change)...");
  // Output and change require independent nonces.
  const claim = await vault.callTx.completeSwap(
    requestIdBytes(rid),
    respondBidirectionalEventToCircuitInput(outcome.event),
    outcome.serializedOutput,
    rand32(),
    rand32(),
  );
  env.assertActive();
  log(
    `Swap complete. Minted ${amountOut.toString()} tokenOut (spent ~${String(outcome.decoded?.amountIn ?? "?")} tokenIn).`,
  );
  return {
    status: "settled",
    outputUnits: null,
    midnightTxHash: settledOnMidnight(progress, claim),
  };
}

async function stataAllowance(env: VaultSessionEnvironment, vaultEvm: string): Promise<bigint> {
  return withEthersProvider(env.evmRpcUrl, async (provider) => {
    const token = new EthersContract(
      AAVE_USDC,
      ["function allowance(address,address) view returns (uint256)"],
      provider,
    );
    return token.getFunction<ContractMethod<string[], bigint, bigint>>("allowance")(
      vaultEvm,
      STATA_USDC,
    );
  });
}

async function assertSupplyRequestOnLedger(
  providers: VaultProviders,
  env: VaultSessionEnvironment,
  rid: RequestIdHex,
): Promise<void> {
  const after = await readVaultLedger(providers, env);
  if (!toSignBidirectionalEventIndex(after.supplyEventMap).has(rid)) {
    throw new Error(`supply request ${rid} not on the ledger after startSupply()`);
  }
}

async function assertRedeemRequestOnLedger(
  providers: VaultProviders,
  env: VaultSessionEnvironment,
  rid: RequestIdHex,
): Promise<void> {
  const after = await readVaultLedger(providers, env);
  if (!toSignBidirectionalEventIndex(after.redeemEventMap).has(rid)) {
    throw new Error(`redeem request ${rid} not on the ledger after startRedeem()`);
  }
}

async function ensureStataApproved(
  progress: OperationProgress,
  providers: VaultProviders,
  vault: StandaloneVaultContract,
  env: VaultSessionEnvironment,
  log: (m: string) => void,
): Promise<void> {
  const vaultEvm = vaultAddress(env);
  const allowance = await stataAllowance(env, vaultEvm);
  if (allowance > 0n) return;

  log("Approving the Aave stataUSDC wrapper for USDC (one-time)...");
  const nonce = await evmNonce(env, vaultEvm);
  const before = await readVaultLedger(providers, env);
  if (!before.initialised) throw new Error("vault not initialised");
  const rid = predictCallRequestId(
    env,
    before,
    VAULT_PATH,
    nonce,
    addrBytes(AAVE_USDC),
    BOOLEAN_RESULT_MPC_ROUTING,
    GAS_LIMIT,
    MAX_FEE,
    PRIORITY_FEE,
    STATA_APPROVE_SELECTOR,
    [evmAddressAbiWord(addrBytes(STATA_USDC)), numericAbiWord(STATA_MAX_APPROVE)],
  );
  await vault.callTx.approveStata(nonce, SIGNET_DEFAULT_KEY_VERSION);
  await assertRequestOnLedger(providers, env, rid, "approveStata");

  const signed = await pollSignatureResponse(
    progress,
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_REQUESTS_PATH,
    3 * MINUTE,
  );
  await broadcastEvm(env, signed);
  log("stataUSDC wrapper approved.");
}

/**
 * Preserves the supply request through EVM execution and validates the attested share amount before minting.
 *
 * @param progress - Captured operation checkpoint sink.
 * @param providers - Captured proof, ledger and submission capabilities.
 * @param vault - Standalone circuit calls guarded by the binding generation.
 * @param env - Captured deployment and active-generation check.
 * @param _identity - Captured operation identity retained in the common caller contract.
 * @param amount - Exact unscaled input units.
 * @param log - Operation progress sink.
 * @param onRecord - Retains request and transaction identifiers for continuation.
 * @returns Explicit settlement or refund with attested output units when available.
 * @throws {Error} If captured inputs, execution or attestation cannot be verified.
 */
export async function runSupply(
  progress: OperationProgress,
  providers: VaultProviders,
  vault: StandaloneVaultContract,
  env: VaultSessionEnvironment,
  _identity: Identity,
  amount: bigint,
  log: (m: string) => void,
  onRecord?: (rid: RequestIdHex, evmTxHash?: string) => void,
): Promise<VaultExecutionResult> {
  env.assertActive();
  const vaultEvm = vaultAddress(env);

  env.assertActive();

  progress.set("preparing");
  await ensureStataApproved(progress, providers, vault, env, log);

  const nonce = await evmNonce(env, vaultEvm);
  const before = await readVaultLedger(providers, env);
  if (!before.initialised) throw new Error("vault not initialised");
  const rid = predictCallRequestId(
    env,
    before,
    VAULT_PATH,
    nonce,
    addrBytes(STATA_USDC),
    SUPPLY_MPC_ROUTING,
    STATA_GAS_LIMIT,
    STATA_MAX_FEE_PER_GAS,
    STATA_MAX_PRIORITY_FEE_PER_GAS,
    STATA_DEPOSIT_SELECTOR,
    [numericAbiWord(amount), evmAddressAbiWord(addrBytes(vaultEvm))],
  );
  const coin = {
    nonce: rand32(),
    color: hexToBytes(vaultTokenType(AAVE_USDC, env.contractAddress)),
    value: amount,
  };

  env.assertActive();

  progress.set("proving");
  log("Submitting startSupply() (surrendering USDC to lend)...");
  await vault.callTx.startSupply(nonce, SIGNET_DEFAULT_KEY_VERSION, amount, coin);
  await assertSupplyRequestOnLedger(providers, env, rid);
  onRecord?.(rid);

  const outcome = await settleViaMpc(
    progress,
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_SUPPLY_REQUESTS_PATH,
    SUPPLY_OUTPUT_SCHEMA,
    SUPPLY_RESPOND_SCHEMA,
    (hash) => {
      onRecord?.(rid, hash);
    },
  );
  onRecord?.(rid, outcome.evmTxHash);

  if (outcome.matchedFailureOutput) {
    env.assertActive();
    progress.set("refunding");
    log("Supply did not execute on EVM. Refunding USDC...");
    const claim = await vault.callTx.refundSupply(
      requestIdBytes(rid),
      respondBidirectionalEventToCircuitInput(outcome.event),
      outcome.serializedOutput,
      rand32(),
    );
    env.assertActive();
    log("Supply refunded (did not execute).");
    return { status: "refunded", midnightTxHash: settledOnMidnight(progress, claim) };
  }
  env.assertActive();
  progress.set("claim-proving");
  const shares = outcome.decoded?.shares;
  if (shares !== undefined && typeof shares !== "bigint")
    throw new Error("Invalid attested share amount");
  log("Settling completeSupply (minting shielded stataUSDC)...");
  const claim = await vault.callTx.completeSupply(
    requestIdBytes(rid),
    respondBidirectionalEventToCircuitInput(outcome.event),
    outcome.serializedOutput,
    rand32(),
  );
  env.assertActive();
  log(`Supply complete. Minted ${shares?.toString() ?? "?"} stataUSDC shares.`);
  return {
    status: "settled",
    outputUnits: shares ?? null,
    midnightTxHash: settledOnMidnight(progress, claim),
  };
}

/**
 * Preserves the redeem request and validates its attested asset amount before completing settlement.
 *
 * @param progress - Captured operation checkpoint sink.
 * @param providers - Captured proof, ledger and submission capabilities.
 * @param vault - Standalone circuit calls guarded by the binding generation.
 * @param env - Captured deployment and active-generation check.
 * @param _identity - Captured operation identity retained in the common caller contract.
 * @param shares - Exact wrapper units to redeem.
 * @param log - Operation progress sink.
 * @param onRecord - Retains request and transaction identifiers for continuation.
 * @returns Explicit settlement or refund with attested output units when available.
 * @throws {Error} If captured inputs, execution or attestation cannot be verified.
 */
export async function runRedeem(
  progress: OperationProgress,
  providers: VaultProviders,
  vault: StandaloneVaultContract,
  env: VaultSessionEnvironment,
  _identity: Identity,
  shares: bigint,
  log: (m: string) => void,
  onRecord?: (rid: RequestIdHex, evmTxHash?: string) => void,
): Promise<VaultExecutionResult> {
  env.assertActive();
  const vaultEvm = vaultAddress(env);

  env.assertActive();

  progress.set("proving");
  const nonce = await evmNonce(env, vaultEvm);
  const before = await readVaultLedger(providers, env);
  if (!before.initialised) throw new Error("vault not initialised");
  const rid = predictCallRequestId(
    env,
    before,
    VAULT_PATH,
    nonce,
    addrBytes(STATA_USDC),
    REDEEM_MPC_ROUTING,
    STATA_GAS_LIMIT,
    STATA_MAX_FEE_PER_GAS,
    STATA_MAX_PRIORITY_FEE_PER_GAS,
    STATA_REDEEM_SELECTOR,
    [
      numericAbiWord(shares),
      evmAddressAbiWord(addrBytes(vaultEvm)),
      evmAddressAbiWord(addrBytes(vaultEvm)),
    ],
  );
  const coin = {
    nonce: rand32(),
    color: hexToBytes(vaultTokenType(STATA_USDC, env.contractAddress)),
    value: shares,
  };

  log("Submitting startRedeem() (surrendering stataUSDC shares)...");
  await vault.callTx.startRedeem(nonce, SIGNET_DEFAULT_KEY_VERSION, shares, coin);
  await assertRedeemRequestOnLedger(providers, env, rid);
  onRecord?.(rid);

  const outcome = await settleViaMpc(
    progress,
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_REDEEM_REQUESTS_PATH,
    REDEEM_OUTPUT_SCHEMA,
    REDEEM_RESPOND_SCHEMA,
    (hash) => {
      onRecord?.(rid, hash);
    },
  );
  onRecord?.(rid, outcome.evmTxHash);

  if (outcome.matchedFailureOutput) {
    env.assertActive();
    progress.set("refunding");
    log("Redeem did not execute on EVM. Refunding stataUSDC...");
    const claim = await vault.callTx.refundRedeem(
      requestIdBytes(rid),
      respondBidirectionalEventToCircuitInput(outcome.event),
      outcome.serializedOutput,
      rand32(),
    );
    env.assertActive();
    log("Redeem refunded (did not execute).");
    return { status: "refunded", midnightTxHash: settledOnMidnight(progress, claim) };
  }
  env.assertActive();
  progress.set("claim-proving");
  const assets = outcome.decoded?.assets;
  if (assets !== undefined && typeof assets !== "bigint")
    throw new Error("Invalid attested asset amount");
  log("Settling completeRedeem (minting shielded USDC)...");
  const claim = await vault.callTx.completeRedeem(
    requestIdBytes(rid),
    respondBidirectionalEventToCircuitInput(outcome.event),
    outcome.serializedOutput,
    rand32(),
  );
  env.assertActive();
  log(`Redeem complete. Minted ${assets?.toString() ?? "?"} USDC.`);
  return {
    status: "settled",
    outputUnits: assets ?? null,
    midnightTxHash: settledOnMidnight(progress, claim),
  };
}
