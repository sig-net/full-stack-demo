import { rawTokenType } from '@midnight-ntwrk/compact-runtime';
import {
  Contract as EthersContract,
  FetchRequest,
  JsonRpcProvider,
  type Transaction,
} from 'ethers';
import {
  calculateRequestId,
  requestIdHex,
  requestIdBytes,
  deriveEvmAddress,
  evmAddressAbiWord,
  numericAbiWord,
  asciiPadded,
  hexToBytes,
  bytesToHex,
  stripHexPrefix,
  toSignBidirectionalEventIndex,
  deriveMidnightResponseKey,
  deserializeEvmOutput,
  serializeRespondOutput,
  signBidirectionalEventToSignedEvmTransaction,
  signetEventSourceFromPublicDataProvider,
  SignetRequestResponseReader,
  SIGNET_DEFAULT_KEY_VERSION,
  PATH_BYTES,
  MPC_PARAMS_BYTES,
  MPC_FAILURE_OUTPUT,
  MPCSignatureAlgorithm,
  MPCDestination,
  TxParamType,
  type RequestIdHex,
  type SignBidirectionalEvent,
} from '@sig-net/midnight';

import { flow } from './flow';
import {
  ERC20_TRANSFER_GAS_LIMIT as GAS_LIMIT,
  ERC20_TRANSFER_MAX_FEE_PER_GAS as MAX_FEE,
  ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS as PRIORITY_FEE,
} from './evm-envelope';
import {
  pureCircuits,
  ledger,
  VAULT_REQUESTS_PATH,
  VAULT_DEPOSIT_REQUESTS_PATH,
  VAULT_SWAP_REQUESTS_PATH,
  VAULT_SUPPLY_REQUESTS_PATH,
  VAULT_REDEEM_REQUESTS_PATH,
} from '@sig-net/midnight-examples-erc20-vault-contract';
import {
  AAVE_USDC,
  STATA_USDC,
  STATA_DEPOSIT_SELECTOR,
  STATA_REDEEM_SELECTOR,
  STATA_GAS_LIMIT,
  STATA_MAX_FEE_PER_GAS,
  STATA_MAX_PRIORITY_FEE_PER_GAS,
  APPROVE_SELECTOR as STATA_APPROVE_SELECTOR,
  MAX_APPROVE as STATA_MAX_APPROVE,
  SUPPLY_MPC_ROUTING,
  SUPPLY_OUTPUT_SCHEMA,
  SUPPLY_RESPOND_SCHEMA,
  REDEEM_MPC_ROUTING,
  REDEEM_OUTPUT_SCHEMA,
  REDEEM_RESPOND_SCHEMA,
} from './evm-stata';
import {
  APPROVE_SELECTOR,
  EXACT_OUTPUT_SINGLE_SELECTOR,
  MAX_APPROVE,
  SWAP_GAS_LIMIT,
  SWAP_MAX_FEE_PER_GAS,
  SWAP_MAX_PRIORITY_FEE_PER_GAS,
  SWAP_MPC_ROUTING,
  SWAP_OUTPUT_SCHEMA,
  SWAP_RESPOND_SCHEMA,
  UNISWAP_SWAP_ROUTER_02,
  quoteExactInputSingle,
  routerAllowance,
} from './evm-swap';

// Fixed EVM transfer envelope + MPC routing (mirrors the reference integration tests).
const ERC20_TRANSFER_SELECTOR = new Uint8Array([0xa9, 0x05, 0x9c, 0xbb]);
const RESULT_SCHEMA = '[{"name":"success","type":"bool"}]';
const VAULT_PATH = asciiPadded('vault', PATH_BYTES);
const MINUTE = 60_000;

const MPC_ROUTING = {
  algo: MPCSignatureAlgorithm.ecdsa,
  dest: MPCDestination.unused,
  params: new Uint8Array(MPC_PARAMS_BYTES),
  outputDeserializationSchema: asciiPadded(RESULT_SCHEMA, RESULT_SCHEMA.length),
  respondSerializationSchema: asciiPadded(RESULT_SCHEMA, RESULT_SCHEMA.length),
};

export type Env = {
  contractAddress: string; // Midnight vault contract
  signetContractAddress: string; // Midnight central signet contract
  mpcSecpPub: string; // MPC root secp256k1 pubkey (0x hex)
  evmRpcUrl: string; // Sepolia JSON-RPC
  fakenetResponsesUrl: string; // fakenet /responses cache
};

const addrBytes = (hex: string) => hexToBytes(stripHexPrefix(hex));
// One EVM provider per RPC URL, with an explicit request timeout. ethers' default connection
// gives up over a slow link and surfaces `timeout (code=TIMEOUT)` mid-flow, after the sweep has
// already landed. staticNetwork stops the repeated chainId round trips, which matters because
// balance polling and the flow share this connection.
const evmProviders = new Map<string, JsonRpcProvider>();
const EVM_REQUEST_TIMEOUT_MS = 120_000;
export function evmProvider(rpcUrl: string): JsonRpcProvider {
  const cached = evmProviders.get(rpcUrl);
  if (cached) return cached;
  const request = new FetchRequest(rpcUrl);
  request.timeout = EVM_REQUEST_TIMEOUT_MS;
  const provider = new JsonRpcProvider(request, undefined, {
    staticNetwork: true,
  });
  evmProviders.set(rpcUrl, provider);
  return provider;
}

// A single RPC round trip over a remote link can time out even when the chain is healthy.
// Retry the transient classes and label the step, so a failure names the call that failed
// instead of surfacing a bare `timeout (code=TIMEOUT)`.
const TRANSIENT_RPC = /timeout|network error|failed to fetch|connection|econn|socket/i;
async function rpcStep<T>(
  step: string,
  attempts: number,
  fn: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const transient =
        e?.code === 'TIMEOUT' ||
        e?.code === 'NETWORK_ERROR' ||
        TRANSIENT_RPC.test(String(e?.message ?? ''));
      if (!transient || attempt === attempts) break;
      await sleep(2000 * attempt);
    }
  }
  const detail = (lastError as any)?.message ?? String(lastError);
  throw new Error(`${step} failed after ${attempts} attempts: ${detail}`);
}

const rand32 = () => crypto.getRandomValues(new Uint8Array(32));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface Identity {
  secretKey: Uint8Array;
  commitment: Uint8Array;
  /** UTF-8 decode of the path bytes with NULs stripped. */
  pathString: string;
  /** Lowercase hex of the full 32 path bytes, padding included. */
  pathHex: string;
}

/** How a deployment renders a request's 32 path bytes for deriveEvmAddress. */
export type PathRendering = 'utf8' | 'hex';

// The MPC renders a request's derivation path as the lowercase hex of the full 32 stored
// bytes, padding included, and deriveEvmAddress takes that same rendering. Passing a UTF-8
// decode of those bytes instead yields a different address for every path, so the wallet
// shows a deposit address the MPC never signs from and every signature check fails.
export function deriveIdentity(secretKey: Uint8Array): Identity {
  const commitment = pureCircuits.userCommitment(secretKey);
  const pathString = new TextDecoder('utf-8')
    .decode(commitment)
    .replace(/\0/g, '');
  return { secretKey, commitment, pathString, pathHex: bytesToHex(commitment) };
}

// Deployments disagree on the rendering: the stagenet vault was initialized with the UTF-8
// form, the test harness deploys with the hex form. Pick by evidence instead of assuming.
// Only the correct rendering reproduces the vaultEvmAddress the contract stored at
// initialize, so that stored value identifies the convention. Default to utf8, which
// leaves the deployed stagenet vault unchanged when the check cannot run.
let pathRendering: PathRendering = 'utf8';
export const getPathRendering = (): PathRendering => pathRendering;
export function resolvePathRendering(env: Env, onChainVaultEvm: string): PathRendering {
  const norm = (a: string) => a.toLowerCase().replace(/^0x/, '');
  const hexForm = deriveEvmAddress(env.mpcSecpPub, env.contractAddress, VAULT_PATH_HEX);
  pathRendering = norm(hexForm) === norm(onChainVaultEvm) ? 'hex' : 'utf8';
  return pathRendering;
}
// Read the deployed vault's own address and set the rendering from it. Call once per connect.
export async function syncPathRendering(
  providers: any,
  env: Env,
): Promise<PathRendering> {
  const state = await readVaultLedger(providers, env);
  return resolvePathRendering(env, bytesToHex(state.vaultEvmAddress));
}
export function depositAddress(env: Env, identity: Identity): string {
  return deriveEvmAddress(
    env.mpcSecpPub,
    env.contractAddress,
    pathRendering === 'hex' ? identity.pathHex : identity.pathString,
  );
}
// The withdraw/swap/supply/redeem circuits all set the record path to pad(32, "vault").
export const VAULT_PATH_HEX = bytesToHex(asciiPadded('vault', PATH_BYTES));
export function vaultAddress(env: Env): string {
  return deriveEvmAddress(
    env.mpcSecpPub,
    env.contractAddress,
    pathRendering === 'hex' ? VAULT_PATH_HEX : 'vault',
  );
}

// Shielded vault-token color for an ERC-20 under this vault.
export function vaultTokenType(
  erc20Hex: string,
  vaultContractAddress: string,
): string {
  const raw: any = rawTokenType(
    (pureCircuits as any).vaultTokenDomainSeparator(addrBytes(erc20Hex)),
    vaultContractAddress as any,
  );
  return (typeof raw === 'string' ? raw : bytesToHex(raw))
    .replace(/^0x/, '')
    .toLowerCase();
}

export async function erc20Balance(
  rpcUrl: string,
  erc20Hex: string,
  address: string,
): Promise<bigint> {
  const token = new EthersContract(
    erc20Hex,
    ['function balanceOf(address) view returns (uint256)'],
    evmProvider(rpcUrl),
  );
  return BigInt(await token.getFunction('balanceOf')(address));
}

async function readVaultLedger(providers: any, env: Env): Promise<any> {
  const cs = await providers.publicDataProvider.queryContractState(
    env.contractAddress,
  );
  if (!cs) throw new Error(`no contract state at ${env.contractAddress}`);
  return (ledger as any)(cs.data);
}

function responseReader(
  providers: any,
  env: Env,
  requestsPath: readonly number[] = VAULT_REQUESTS_PATH,
): SignetRequestResponseReader {
  return new SignetRequestResponseReader({
    requesterContractAddress: env.contractAddress,
    // The reader locates the request by ledger-tree path. The Aave vault chunks its state past
    // 15 fields, so every event map is depth-2: signBidirectional [0,0], deposit [1,3], swap [1,7], supply
    // [1,11], redeem [1,13].
    requesterRequestsPath: [...requestsPath],
    signetContractAddress: env.signetContractAddress,
    publicDataProvider: providers.publicDataProvider,
    // 0.19: the MPC's responses are read from the signet contract's emitted
    // events, adapted from the same public data provider.
    eventSource: signetEventSourceFromPublicDataProvider(providers.publicDataProvider),
  } as any);
}

// Predict the request id the vault will record: the full request record, hashed.
function predictRequestId(
  env: Env,
  before: any,
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
    ...MPC_ROUTING,
    txParamType: TxParamType.evmType2,
    caip2Id: before.caip2Id,
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
  } as any;
  return requestIdHex(calculateRequestId(expected)) as RequestIdHex;
}

async function assertRequestOnLedger(
  providers: any,
  env: Env,
  rid: RequestIdHex,
  circuit: string,
) {
  const after = await readVaultLedger(providers, env);
  if (
    !toSignBidirectionalEventIndex(after.signBidirectionalEventMap).has(rid)
  ) {
    throw new Error(`request ${rid} not on the ledger after ${circuit}()`);
  }
}

// Deposits register in depositEventMap, a separate map from the transfer map above.
async function assertDepositRequestOnLedger(
  providers: any,
  env: Env,
  rid: RequestIdHex,
) {
  const after = await readVaultLedger(providers, env);
  if (!toSignBidirectionalEventIndex(after.depositEventMap).has(rid)) {
    throw new Error(`deposit request ${rid} not on the ledger after startDeposit()`);
  }
}

// Swaps register in swapEventMap, a separate map from the transfer map above.
async function assertSwapRequestOnLedger(
  providers: any,
  env: Env,
  rid: RequestIdHex,
) {
  const after = await readVaultLedger(providers, env);
  if (!toSignBidirectionalEventIndex(after.swapEventMap).has(rid)) {
    throw new Error(`swap request ${rid} not on the ledger after startSwap()`);
  }
}

// Predict the request id for any EVM call the vault records: the full request record hashed.
// Generalises predictRequestId over the calldata (selector + ABI words), the gas envelope
// and the MPC routing, so approve (2-word transfer schema) and swap (7-word amountOut
// schema) share one builder.
function predictCallRequestId(
  env: Env,
  before: any,
  path: Uint8Array,
  nonce: bigint,
  to: Uint8Array,
  routing: any,
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
    caip2Id: before.caip2Id,
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
  } as any;
  return requestIdHex(calculateRequestId(expected)) as RequestIdHex;
}

async function fetchFakenetResponse(
  env: Env,
  requestId: string,
  timeoutMs = 8000,
): Promise<any> {
  const url = `${env.fakenetResponsesUrl}/responses/${requestId}`;
  const deadline = Date.now() + timeoutMs;
  let last = 'not attempted';
  do {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = `fetch failed: ${String(e)}`;
    }
    await sleep(1000);
  } while (Date.now() < deadline);
  throw new Error(`no fakenet response for ${requestId} (${last})`);
}

// Stage 1: poll the signet contract until the MPC's signature over the EVM tx appears.
async function pollSignatureResponse(
  providers: any,
  env: Env,
  requestId: RequestIdHex,
  expectedSigner: string,
  log: (m: string) => void,
  requestsPath: readonly number[] = VAULT_REQUESTS_PATH,
  timeoutMs = 6 * MINUTE,
): Promise<Transaction> {
  const reader = responseReader(providers, env, requestsPath);
  const end = Date.now() + timeoutMs;
  const warned = new Set<bigint>();
  while (Date.now() < end) {
    const { verified, verdicts } =
      await reader.getVerifiedSignatureRespondedEvent(
        requestId,
        expectedSigner,
      );
    for (const v of verdicts as any[]) {
      if (v.rejectedReason !== undefined && !warned.has(v.count)) {
        warned.add(v.count);
        log(`ignoring response post ${v.count}: ${v.rejectedReason}`);
      }
    }
    if (verified !== undefined) {
      const request = await reader.getSignatureRequest(requestId);
      return signBidirectionalEventToSignedEvmTransaction(
        request,
        verified,
      ) as unknown as Transaction;
    }
    await sleep(1000);
  }
  throw new Error(`timed out waiting for signature response to ${requestId}`);
}

// Broadcast the MPC-signed EVM tx (idempotent across retries). In a settle flow a revert is a
// valid outcome — the MPC attests the failure and the caller refunds (swap/withdraw) or surfaces
// it (deposit) — so `throwOnRevert` is false there. Sign-only flows (router approval) have no
// attestation to fall back on, so a revert there is fatal.
//
// The signed tx is deterministic, so broadcasting is idempotent and retryable. A settle flow has
// already BURNED the surrendered coin, so a failed broadcast must not strand it: there is no
// failure attestation for a tx that never reached the chain (the MPC waits on-chain), so the only
// recovery is to land THIS tx. `ensureGas` re-runs the gas top-up between attempts, so an
// under-funded account ("insufficient funds") is refilled and the same signed tx re-broadcast.
async function broadcastEvm(
  env: Env,
  tx: Transaction,
  opts: { throwOnRevert?: boolean; ensureGas?: () => Promise<void> } = {},
): Promise<void> {
  const { throwOnRevert = true, ensureGas } = opts;
  const provider = evmProvider(env.evmRpcUrl);
  const { hash } = tx;
  if (!hash) throw new Error('signed tx missing hash');
  const mined = await rpcStep('receipt lookup', 3, () =>
    provider.getTransactionReceipt(hash),
  );
  if (mined) {
    if (mined.status === 0 && throwOnRevert)
      throw new Error(`sweep ${hash} reverted`);
    return;
  }
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      await rpcStep('broadcast', 3, () =>
        provider.broadcastTransaction(tx.serialized),
      );
      break;
    } catch (e: any) {
      const msg = String(e?.message ?? '').toLowerCase();
      // Already in the mempool (or mined by a prior attempt) — proceed to await the receipt.
      if (
        e?.code === 'NONCE_EXPIRED' ||
        msg.includes('already known') ||
        msg.includes('nonce too low')
      )
        break;
      if (attempt >= MAX_ATTEMPTS) throw e;
      // Under-funded gas: refill and re-broadcast the same signed tx. Other transient RPC
      // failures: back off and retry.
      if (msg.includes('insufficient funds') && ensureGas) await ensureGas();
      await sleep(2000);
    }
  }
  // The transfer is already broadcast at this point, so a lost receipt poll must not fail the
  // flow: re-check the receipt directly before giving up.
  const receipt = await rpcStep('receipt wait', 3, async () => {
    const r = await provider.waitForTransaction(hash, 1, 3 * MINUTE);
    return r ?? (await provider.getTransactionReceipt(hash));
  });
  if (!receipt) throw new Error(`sweep ${hash} not confirmed`);
  if (receipt.status === 0 && throwOnRevert)
    throw new Error(`sweep ${hash} reverted`);
}

// Stage 2: match the MPC's attestation digest against the recomputed serialized output.
// The log is unauthenticated — the settle circuits re-verify digest + signature in-circuit.
async function fetchAttestedRespondOutcome(
  providers: any,
  env: Env,
  requestId: RequestIdHex,
  requestsPath: readonly number[] = VAULT_REQUESTS_PATH,
  schema: string = RESULT_SCHEMA,
  respondSchema: string = schema,
): Promise<any | undefined> {
  const reader = responseReader(providers, env, requestsPath);
  // The MPC response key the vault pinned at deploy (sender-scoped: derived from
  // the MPC root pubkey + this vault's address). getVerifiedRespondBidirectionalEvent
  // authenticates each candidate's signature against it — the 0.19 event carries only
  // the signature, not a digest, so matching is by verifying, not by comparing digests.
  const mpcResponseKey = deriveMidnightResponseKey(
    env.mpcSecpPub,
    env.contractAddress,
  );
  let cached: any;
  try {
    cached = await fetchFakenetResponse(env, requestId);
  } catch {
    cached = undefined;
  }
  const candidates: { serializedOutput: Uint8Array; isFailure: boolean }[] = [];
  // The transfer schema decodes a bool; the swap OUTPUT schema a uint256 amountIn. The MPC
  // re-packs against `respondSchema` (equal to `schema` for the symmetric transfer case, but a
  // narrower uint64 for swap). decodedValue is what a success settle reads (the bool, or amountIn).
  let decodedValue: any;
  if (cached?.success && cached.output != null) {
    try {
      const decoded: any = deserializeEvmOutput(schema as any, cached.output);
      decodedValue = decoded;
      candidates.push({
        serializedOutput: serializeRespondOutput(respondSchema as any, decoded),
        isFailure: false,
      });
    } catch {
      /* only the failure candidate can match */
    }
  }
  candidates.push({ serializedOutput: MPC_FAILURE_OUTPUT, isFailure: true });
  // Only the candidate the MPC actually attested has a signature that verifies, so the
  // first verifying candidate is the genuine outcome. An undefined return means the post
  // is not up yet (or attests neither candidate) — the caller polls again.
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
        // Transfer schema only: a decoded bool `success`. Swaps read `decoded.amountOut`
        // and treat any non-failure match as success (matchedFailureOutput === false).
        succeeded: !c.isFailure && decodedValue?.success === true,
        matchedFailureOutput: c.isFailure,
      };
    }
  }
  return undefined;
}

// MPC round trip shared by deposit/withdraw/swap: signature -> broadcast -> attestation.
// indexField/schema default to the transfer map (field 0, bool); swaps pass field 11 + the
// uint256 amountOut schema.
async function settleViaMpc(
  providers: any,
  env: Env,
  rid: RequestIdHex,
  expectedSigner: string,
  log: (m: string) => void,
  requestsPath: readonly number[] = VAULT_REQUESTS_PATH,
  schema: string = RESULT_SCHEMA,
  respondSchema: string = schema,
  ensureGas?: () => Promise<void>,
): Promise<any> {
  flow.set('settling');
  log('Waiting for MPC signature + settling on Sepolia...');
  const signed = await pollSignatureResponse(
    providers,
    env,
    rid,
    expectedSigner,
    log,
    requestsPath,
  );
  // A revert is not fatal here: the MPC attests the failed execution and the caller refunds
  // (swap/withdraw) or reports it (deposit). Let it settle, then read the attestation below.
  // ensureGas re-runs the top-up between broadcast retries so an under-funded account never
  // strands the already-burned coin (there is no failure attestation for a never-sent tx).
  await broadcastEvm(env, signed, { throwOnRevert: false, ensureGas });
  const end = Date.now() + 6 * MINUTE;
  while (Date.now() < end) {
    const outcome = await fetchAttestedRespondOutcome(
      providers,
      env,
      rid,
      requestsPath,
      schema,
      respondSchema,
    );
    if (outcome) return { ...outcome, evmTxHash: signed.hash ?? undefined };
    await sleep(1000);
  }
  throw new Error(
    `timed out waiting for respond-bidirectional attestation for ${rid}`,
  );
}

// startDeposit() -> MPC round trip -> completeDeposit() mints the shielded token.
export async function runDeposit(
  providers: any,
  vault: any,
  env: Env,
  identity: Identity,
  erc20Hex: string,
  amount: bigint,
  log: (m: string) => void,
  onRecord?: (rid: RequestIdHex, evmTxHash?: string) => void,
) {
  flow.start('deposit');
  const erc20 = addrBytes(erc20Hex);
  const userEvm = depositAddress(env, identity);
  const nonce = await evmNonce(env, userEvm);
  log(`Deposit sender ${userEvm} (evm nonce ${nonce})`);

  const before = await readVaultLedger(providers, env);
  if (!before.initialized) throw new Error('vault not initialized');
  const rid = predictRequestId(
    env,
    before,
    identity.commitment,
    nonce,
    erc20,
    before.vaultEvmAddress,
    amount,
  );
  log(`Predicted requestId 0x${rid}`);

  flow.set('proving');
  log('Submitting startDeposit() on Midnight...');
  await vault.callTx.startDeposit(
    nonce,
    GAS_LIMIT,
    MAX_FEE,
    PRIORITY_FEE,
    SIGNET_DEFAULT_KEY_VERSION,
    {
      erc20Address: erc20,
      amount,
    },
  );
  await assertDepositRequestOnLedger(providers, env, rid);
  onRecord?.(rid);

  const outcome = await settleViaMpc(
    providers,
    env,
    rid,
    userEvm,
    log,
    VAULT_DEPOSIT_REQUESTS_PATH,
  );
  onRecord?.(rid, outcome.evmTxHash);
  if (!outcome.succeeded)
    throw new Error(`MPC attested deposit ${rid} as FAILED`);

  flow.set('claim-proving');
  log('Submitting completeDeposit() to mint shielded token...');
  const selfRecipient = {
    is_some: false,
    value: {
      is_left: true,
      left: { bytes: new Uint8Array(32) },
      right: { bytes: new Uint8Array(32) },
    },
  };
  await vault.callTx.completeDeposit(
    requestIdBytes(rid),
    outcome.event,
    outcome.serializedOutput,
    rand32(),
    selfRecipient,
  );
  flow.set('done');
  log('Deposit complete — shielded token minted.');
}

// startWithdraw() -> MPC round trip -> completeWithdraw() (or refundWithdraw on failure).
export async function runWithdraw(
  providers: any,
  vault: any,
  env: Env,
  identity: Identity,
  erc20Hex: string,
  amount: bigint,
  destHex: string,
  log: (m: string) => void,
  ensureGas?: () => Promise<void>,
  onRecord?: (rid: RequestIdHex, evmTxHash?: string) => void,
) {
  flow.start('withdraw');
  const erc20 = addrBytes(erc20Hex);
  const dest = addrBytes(destHex);
  const vaultEvm = vaultAddress(env);
  const nonce = await evmNonce(env, vaultEvm);
  log(`Withdraw sender (vault) ${vaultEvm} (evm nonce ${nonce})`);

  const before = await readVaultLedger(providers, env);
  if (!before.initialized) throw new Error('vault not initialized');
  const rid = predictRequestId(
    env,
    before,
    VAULT_PATH,
    nonce,
    erc20,
    dest,
    amount,
  );

  const coin = {
    nonce: rand32(),
    color: hexToBytes(vaultTokenType(erc20Hex, env.contractAddress)),
    value: amount,
  };

  flow.set('proving');
  log('Submitting startWithdraw() (surrendering the vault coin)...');
  await vault.callTx.startWithdraw(
    nonce,
    SIGNET_DEFAULT_KEY_VERSION,
    { erc20Address: erc20, amount, destEvmAddress: dest },
    coin,
  );
  await assertRequestOnLedger(providers, env, rid, 'withdraw');
  onRecord?.(rid);

  const outcome = await settleViaMpc(
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_REQUESTS_PATH,
    RESULT_SCHEMA,
    RESULT_SCHEMA,
    ensureGas,
  );
  onRecord?.(rid, outcome.evmTxHash);

  if (outcome.matchedFailureOutput) {
    flow.set('refunding');
    log('EVM transfer never executed — refunding...');
    await vault.callTx.refundWithdraw(
      requestIdBytes(rid),
      outcome.event,
      outcome.serializedOutput,
      rand32(),
    );
    flow.finishRefunded();
    log('Withdraw settled (refunded).');
    return;
  }
  flow.set('claim-proving');
  log('Settling completeWithdraw...');
  await vault.callTx.completeWithdraw(
    requestIdBytes(rid),
    outcome.event,
    outcome.serializedOutput,
    rand32(),
  );
  flow.set('done');
  log('Withdraw finalized (success).');
}

async function evmNonce(env: Env, address: string): Promise<bigint> {
  return BigInt(
    await evmProvider(env.evmRpcUrl).getTransactionCount(address),
  );
}

// Ensure the vault account has approved the router for `erc20Hex`: read the live allowance,
// and if zero run the approve leg (approveRouter -> MPC sign (field 0) -> broadcast; NO
// settle). Idempotent and global (one pooled vault account), so a nonzero allowance
// short-circuits and the first swapper readies a token for everyone.
async function ensureRouterApproved(
  providers: any,
  vault: any,
  env: Env,
  erc20Hex: string,
  log: (m: string) => void,
) {
  const vaultEvm = vaultAddress(env);
  const allowance = await routerAllowance(env.evmRpcUrl, erc20Hex, vaultEvm);
  if (allowance > 0n) return;

  log('Approving Uniswap router for this token (one-time)...');
  const erc20 = addrBytes(erc20Hex);
  const nonce = await evmNonce(env, vaultEvm);
  const before = await readVaultLedger(providers, env);
  if (!before.initialized) throw new Error('vault not initialized');
  const rid = predictCallRequestId(
    env,
    before,
    VAULT_PATH,
    nonce,
    erc20,
    MPC_ROUTING,
    GAS_LIMIT,
    MAX_FEE,
    PRIORITY_FEE,
    APPROVE_SELECTOR,
    [
      evmAddressAbiWord(addrBytes(UNISWAP_SWAP_ROUTER_02)),
      numericAbiWord(MAX_APPROVE),
    ],
  );
  await vault.callTx.approveRouter(erc20, nonce, SIGNET_DEFAULT_KEY_VERSION);
  await assertRequestOnLedger(providers, env, rid, 'approveRouter');

  // Sign-only: the vault account signs the approve, the client broadcasts it, done.
  const signed = await pollSignatureResponse(
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_REQUESTS_PATH,
    3 * MINUTE,
  );
  await broadcastEvm(env, signed);
  log('Router approved.');
}

// approveRouter (once) -> quote -> startSwap() (burns tokenIn coin, records in swapEventMap) ->
// MPC round trip (field 11) -> completeSwap() mints shielded tokenOut (or refund on EVM
// failure). The vault account holds the pooled funds and both signs + pays for the swap.
// `fee` is the Uniswap V3 pool tier the UI discovered for this pair (default 0.05%).
export async function runSwap(
  providers: any,
  vault: any,
  env: Env,
  identity: Identity,
  tokenInHex: string,
  tokenOutHex: string,
  amountInMaximum: bigint,
  log: (m: string) => void,
  fee = 500n,
  slippageBps = 100n,
  ensureGas?: () => Promise<void>,
  onRecord?: (rid: RequestIdHex, evmTxHash?: string) => void,
) {
  flow.start('swap');
  const tokenIn = addrBytes(tokenInHex);
  const tokenOut = addrBytes(tokenOutHex);
  const vaultEvm = vaultAddress(env);

  // 1. Ready the router allowance for tokenIn (idempotent, global).
  flow.set('preparing');
  await ensureRouterApproved(providers, vault, env, tokenInHex, log);

  // 2. Normal-swap UX, exactOutput on-chain: the user picked the SPEND (amountInMaximum). Quote
  // exactInput to see what it buys, then target amountOut = expected * (1 - slippage) as the
  // guaranteed receive. The swap spends up to amountInMaximum for that output and refunds change.
  const { amountOut: expectedOut } = await quoteExactInputSingle(
    env.evmRpcUrl,
    tokenInHex,
    tokenOutHex,
    fee,
    amountInMaximum,
  );
  const amountOut = (expectedOut * (10_000n - slippageBps)) / 10_000n;
  if (amountOut <= 0n) throw new Error('swap amount too small to quote an output');
  log(
    `Quote: ${amountInMaximum} in -> ~${expectedOut} out (min ${amountOut}, fee ${fee})`,
  );

  // 3. startSwap(): surrender (burn) amountInMaximum of the tokenIn vault coin, record the
  // exactOutputSingle request. completeSwap returns the unspent remainder as change.
  const nonce = await evmNonce(env, vaultEvm);
  const before = await readVaultLedger(providers, env);
  if (!before.initialized) throw new Error('vault not initialized');
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

  flow.set('proving');
  log('Submitting startSwap() (surrendering the tokenIn vault coin)...');
  await vault.callTx.startSwap(
    nonce,
    SIGNET_DEFAULT_KEY_VERSION,
    { tokenIn, tokenOut, fee, amountOut, amountInMaximum },
    coin,
  );
  await assertSwapRequestOnLedger(providers, env, rid);
  onRecord?.(rid);

  // 4. MPC signs the swap with the vault account, broadcasts, attests (field 11 + swap schemas:
  // decode the uint256 amountIn, verify against the uint64-packed respond output).
  const outcome = await settleViaMpc(
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_SWAP_REQUESTS_PATH,
    SWAP_OUTPUT_SCHEMA,
    SWAP_RESPOND_SCHEMA,
    ensureGas,
  );
  onRecord?.(rid, outcome.evmTxHash);

  // 5. Settle: completeSwap mints the exact amountOut of tokenOut plus the unspent tokenIn as
  // change, or refund re-mints amountInMaximum if the EVM swap never executed.
  if (outcome.matchedFailureOutput) {
    flow.set('refunding');
    log('Swap did not execute on EVM — refunding tokenIn...');
    await vault.callTx.refundSwap(
      requestIdBytes(rid),
      outcome.event,
      outcome.serializedOutput,
      rand32(),
    );
    flow.finishRefunded();
    log('Swap refunded (did not execute).');
    return;
  }
  flow.set('claim-proving');
  log('Settling completeSwap (minting shielded tokenOut + change)...');
  // Two coins are minted (the swapped output and the unspent change), each under its own
  // random nonce. A derived second nonce would leave the change coin no entropy of its own.
  await vault.callTx.completeSwap(
    requestIdBytes(rid),
    outcome.event,
    outcome.serializedOutput,
    rand32(),
    rand32(),
  );
  flow.set('done');
  log(
    `Swap complete — minted ${amountOut} tokenOut (spent ~${outcome.decoded?.amountIn ?? '?'} tokenIn).`,
  );
}

// ===================== Aave lending (supply / redeem) =====================

// The USDC allowance the vault granted the stataToken wrapper (owner = vault, spender = stataToken).
async function stataAllowance(env: Env, vaultEvm: string): Promise<bigint> {
  const token = new EthersContract(
    AAVE_USDC,
    ['function allowance(address,address) view returns (uint256)'],
    evmProvider(env.evmRpcUrl),
  );
  return BigInt(await token.getFunction('allowance')(vaultEvm, STATA_USDC));
}

async function assertSupplyRequestOnLedger(providers: any, env: Env, rid: RequestIdHex) {
  const after = await readVaultLedger(providers, env);
  if (!toSignBidirectionalEventIndex(after.supplyEventMap).has(rid)) {
    throw new Error(`supply request ${rid} not on the ledger after startSupply()`);
  }
}

async function assertRedeemRequestOnLedger(providers: any, env: Env, rid: RequestIdHex) {
  const after = await readVaultLedger(providers, env);
  if (!toSignBidirectionalEventIndex(after.redeemEventMap).has(rid)) {
    throw new Error(`redeem request ${rid} not on the ledger after startRedeem()`);
  }
}

// Ensure the vault has approved the stataToken wrapper to pull its USDC (approveStata grants the
// wrapper an allowance on the underlying). Idempotent and global, like ensureRouterApproved.
async function ensureStataApproved(
  providers: any,
  vault: any,
  env: Env,
  log: (m: string) => void,
) {
  const vaultEvm = vaultAddress(env);
  const allowance = await stataAllowance(env, vaultEvm);
  if (allowance > 0n) return;

  log('Approving the Aave stataUSDC wrapper for USDC (one-time)...');
  const nonce = await evmNonce(env, vaultEvm);
  const before = await readVaultLedger(providers, env);
  if (!before.initialized) throw new Error('vault not initialized');
  const rid = predictCallRequestId(
    env,
    before,
    VAULT_PATH,
    nonce,
    addrBytes(AAVE_USDC),
    MPC_ROUTING,
    GAS_LIMIT,
    MAX_FEE,
    PRIORITY_FEE,
    STATA_APPROVE_SELECTOR,
    [evmAddressAbiWord(addrBytes(STATA_USDC)), numericAbiWord(STATA_MAX_APPROVE)],
  );
  await vault.callTx.approveStata(nonce, SIGNET_DEFAULT_KEY_VERSION);
  await assertRequestOnLedger(providers, env, rid, 'approveStata');

  // Sign-only: the vault account signs the approve, the client broadcasts it.
  const signed = await pollSignatureResponse(
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_REQUESTS_PATH,
    3 * MINUTE,
  );
  await broadcastEvm(env, signed);
  log('stataUSDC wrapper approved.');
}

// approveStata (once) -> startSupply() burns the USDC coin, records in supplyEventMap -> MPC round trip
// (supply path + supply schemas) -> completeSupply mints shielded stataUSDC (or refund on EVM
// failure). The vault account holds the pooled funds and both signs + pays for the deposit.
export async function runSupply(
  providers: any,
  vault: any,
  env: Env,
  identity: Identity,
  amount: bigint,
  log: (m: string) => void,
  ensureGas?: () => Promise<void>,
  onRecord?: (rid: RequestIdHex, evmTxHash?: string) => void,
) {
  void identity;
  flow.start('supply');
  const vaultEvm = vaultAddress(env);

  flow.set('preparing');
  await ensureStataApproved(providers, vault, env, log);

  const nonce = await evmNonce(env, vaultEvm);
  const before = await readVaultLedger(providers, env);
  if (!before.initialized) throw new Error('vault not initialized');
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

  flow.set('proving');
  log('Submitting startSupply() (surrendering USDC to lend)...');
  await vault.callTx.startSupply(nonce, SIGNET_DEFAULT_KEY_VERSION, amount, coin);
  await assertSupplyRequestOnLedger(providers, env, rid);
  onRecord?.(rid);

  const outcome = await settleViaMpc(
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_SUPPLY_REQUESTS_PATH,
    SUPPLY_OUTPUT_SCHEMA,
    SUPPLY_RESPOND_SCHEMA,
    ensureGas,
  );
  onRecord?.(rid, outcome.evmTxHash);

  if (outcome.matchedFailureOutput) {
    flow.set('refunding');
    log('Supply did not execute on EVM — refunding USDC...');
    await vault.callTx.refundSupply(
      requestIdBytes(rid),
      outcome.event,
      outcome.serializedOutput,
      rand32(),
    );
    flow.finishRefunded();
    log('Supply refunded (did not execute).');
    return;
  }
  flow.set('claim-proving');
  log('Settling completeSupply (minting shielded stataUSDC)...');
  await vault.callTx.completeSupply(
    requestIdBytes(rid),
    outcome.event,
    outcome.serializedOutput,
    rand32(),
  );
  flow.set('done');
  log(`Supply complete — minted ${outcome.decoded?.shares ?? '?'} stataUSDC shares.`);
  return (outcome.decoded?.shares ?? null) as bigint | null;
}

// startRedeem() burns the stataUSDC coin, records in redeemEventMap -> MPC round trip (redeem path +
// redeem schemas) -> completeRedeem mints shielded USDC (or refund on EVM failure). No approve:
// the vault redeems its OWN shares (owner = vault).
export async function runRedeem(
  providers: any,
  vault: any,
  env: Env,
  identity: Identity,
  shares: bigint,
  log: (m: string) => void,
  ensureGas?: () => Promise<void>,
  onRecord?: (rid: RequestIdHex, evmTxHash?: string) => void,
) {
  void identity;
  flow.start('redeem');
  const vaultEvm = vaultAddress(env);

  flow.set('proving');
  const nonce = await evmNonce(env, vaultEvm);
  const before = await readVaultLedger(providers, env);
  if (!before.initialized) throw new Error('vault not initialized');
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

  log('Submitting startRedeem() (surrendering stataUSDC shares)...');
  await vault.callTx.startRedeem(nonce, SIGNET_DEFAULT_KEY_VERSION, shares, coin);
  await assertRedeemRequestOnLedger(providers, env, rid);
  onRecord?.(rid);

  const outcome = await settleViaMpc(
    providers,
    env,
    rid,
    vaultEvm,
    log,
    VAULT_REDEEM_REQUESTS_PATH,
    REDEEM_OUTPUT_SCHEMA,
    REDEEM_RESPOND_SCHEMA,
    ensureGas,
  );
  onRecord?.(rid, outcome.evmTxHash);

  if (outcome.matchedFailureOutput) {
    flow.set('refunding');
    log('Redeem did not execute on EVM — refunding stataUSDC...');
    await vault.callTx.refundRedeem(
      requestIdBytes(rid),
      outcome.event,
      outcome.serializedOutput,
      rand32(),
    );
    flow.finishRefunded();
    log('Redeem refunded (did not execute).');
    return;
  }
  flow.set('claim-proving');
  log('Settling completeRedeem (minting shielded USDC)...');
  await vault.callTx.completeRedeem(
    requestIdBytes(rid),
    outcome.event,
    outcome.serializedOutput,
    rand32(),
  );
  flow.set('done');
  log(`Redeem complete — minted ${outcome.decoded?.assets ?? '?'} USDC.`);
  return (outcome.decoded?.assets ?? null) as bigint | null;
}
