import {
  type ChargedState,
  type CircuitContext,
  createCircuitContext,
  createConstructorContext,
} from "@midnight-ntwrk/compact-runtime";
import {
  type RequestIdHex,
  SIGNET_DEFAULT_KEY_VERSION,
  type SignetRequestResponseReader,
  toSignBidirectionalEventIndex,
} from "@sig-net/midnight";
import { secp256k1PublicKeyOf } from "@sig-net/midnight/testing";
import { Contract as SignetContract } from "@sig-net/midnight-contract";
import { ledger } from "@sig-net/midnight-examples-erc20-vault-contract";
import {
  Contract,
  type VaultCircuitId,
  type VaultPrivateState,
  witnesses,
} from "@sig-net/midnight-examples-erc20-vault-contract";

import {
  ERC20_TRANSFER_GAS_LIMIT,
  ERC20_TRANSFER_MAX_FEE_PER_GAS,
  ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
} from "@/lib/midnight/evm-envelope";

import { createVaultFixture } from "./vault-fixture";

type CircuitState = Parameters<typeof createCircuitContext<VaultPrivateState>>[3];

/** Executes generated circuits against an initialised, controlled deployment state. */
export interface VaultCircuitFixture {
  binding: Awaited<ReturnType<typeof createVaultFixture>>;
  generatedContract: Contract<VaultPrivateState>;
  readyState: ChargedState;
  responseSecret: Uint8Array;
  context: (circuit: VaultCircuitId, state?: CircuitState) => CircuitContext<VaultPrivateState>;
}

/**
 * @returns Generated vault and Signet state with a controlled response key for circuit and recovery tests.
 */
export async function createVaultCircuitFixture(): Promise<VaultCircuitFixture> {
  const binding = await createVaultFixture();
  const coinPublicKey = "00".repeat(32);
  const generatedContract = new Contract<VaultPrivateState>(witnesses);
  const signetState = await new SignetContract({}).initialState(
    createConstructorContext(undefined, coinPublicKey),
  );
  const context = (
    circuit: VaultCircuitId,
    state: CircuitState,
  ): CircuitContext<VaultPrivateState> =>
    createCircuitContext(
      circuit,
      binding.environment.contractAddress,
      coinPublicKey,
      state,
      binding.contract.deployTxData.private.initialPrivateState,
      { getContractState: () => Promise.resolve(signetState.currentContractState) },
      undefined,
      undefined,
      undefined,
      coinPublicKey,
    );
  const responseSecret = new Uint8Array(32).fill(42);
  const initialised = await generatedContract.circuits.initialise(
    context("initialise", binding.contract.deployTxData.public.initialContractState),
    new Uint8Array(20).fill(0xee),
    new Uint8Array(20).fill(0xdd),
    new Uint8Array(20).fill(0xcc),
    new Uint8Array(20).fill(0xbb),
    11155111n,
    secp256k1PublicKeyOf(responseSecret),
  );
  const readyState = initialised.context.callContext.currentQueryContext.state;
  return {
    binding,
    generatedContract,
    readyState,
    responseSecret,
    context: (circuit, state = readyState) => context(circuit, state),
  };
}

/**
 * @param fixture - Generated deployment context whose deposit request is initialised.
 * @param token - ERC-20 address bytes used by the circuit.
 * @param amount - Deposit quantity in token base units.
 * @returns The generated pending state and its SDK-decoded request identity.
 * @throws {Error} If the generated circuit does not produce a deposit request.
 */
export async function createPendingDeposit(
  fixture: VaultCircuitFixture,
  token: Uint8Array,
  amount: bigint,
): Promise<{
  pendingState: ChargedState;
  requestId: RequestIdHex;
  request: Awaited<ReturnType<SignetRequestResponseReader["getSignatureRequest"]>>;
}> {
  const deposit = await fixture.generatedContract.circuits.startDeposit(
    fixture.context("startDeposit"),
    0n,
    ERC20_TRANSFER_GAS_LIMIT,
    ERC20_TRANSFER_MAX_FEE_PER_GAS,
    ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS,
    SIGNET_DEFAULT_KEY_VERSION,
    { erc20Address: token, amount },
  );
  const pendingState = deposit.context.callContext.currentQueryContext.state;
  const events = toSignBidirectionalEventIndex(ledger(pendingState).depositEventMap);
  const entry = events.entries().next().value;
  if (!entry) throw new Error("Expected generated pending request");
  const [requestId, request] = entry;
  return { pendingState, requestId, request };
}
