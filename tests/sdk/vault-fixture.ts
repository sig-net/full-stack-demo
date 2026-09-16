import * as CompiledContract from "@midnight-ntwrk/compact-js/effect/CompiledContract";
import { createConstructorContext } from "@midnight-ntwrk/compact-runtime";
import {
  createCircuitCallTxInterface,
  createCircuitMaintenanceTxInterfaces,
  createContractMaintenanceTxInterface,
} from "@midnight-ntwrk/midnight-js/contracts";
import { type FinalizedTxData, SucceedEntirely } from "@midnight-ntwrk/midnight-js/types";
import { signingKeyFromBip340, Transaction } from "@midnightntwrk/ledger-v9";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  Contract,
  createVaultPrivateState,
  type DeployedVaultContract,
  VAULT_PRIVATE_STATE_ID,
  type VaultPrivateState,
  witnesses,
} from "@sig-net/midnight-examples-erc20-vault-contract";
import { vi } from "vitest";

import { NETWORK_DEFAULTS } from "@/lib/config/runtime";
import { depositAddress, deriveIdentity, vaultAddress } from "@/lib/midnight/vault";
import { buildVaultProviders } from "@/lib/midnight/vault-providers";
import type { VaultBinding } from "@/lib/midnight/vault-session";
import { SeedWallet } from "@/lib/midnight/wallet/SeedWallet";

/**
 * Builds real SDK call capabilities around a controlled constructor state for ownership tests.
 *
 * @returns A complete binding whose network methods can be spied on with authoritative SDK types.
 */
export async function createVaultFixture(): Promise<
  VaultBinding & { contract: DeployedVaultContract }
> {
  if (typeof window === "undefined") vi.stubGlobal("window", globalThis);
  const configuration = NETWORK_DEFAULTS.midnight.undeployed;
  const wallet = new SeedWallet(configuration, "07".repeat(32));
  const providers = buildVaultProviders(wallet, configuration, "https://zk.example.invalid");
  const identity = deriveIdentity(new Uint8Array(32).fill(7));
  const environment = {
    contractAddress: "ab".repeat(32),
    signetContractAddress: "cd".repeat(32),
    mpcSecpPub: `0x${Buffer.from(secp256k1.getPublicKey(new Uint8Array(32).fill(42))).toString("hex")}`,
    evmRpcUrl: "https://rpc.example.invalid",
    pathRendering: "utf8" as const,
    assertActive: vi.fn<() => void>(),
  };
  const privateState = createVaultPrivateState(identity.secretKey);
  const generated = new Contract<VaultPrivateState>(witnesses);
  const initial = await generated.initialState(
    createConstructorContext(privateState, "00".repeat(32)),
    identity.commitment,
    { bytes: new Uint8Array(32).fill(0xcd) },
  );
  const compiled = CompiledContract.make<Contract<VaultPrivateState>>("erc20-vault", Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets("https://zk.example.invalid"),
  );
  const finalised: FinalizedTxData = {
    tx: Transaction.fromParts("undeployed").mockProve(),
    status: SucceedEntirely,
    txId: "12".repeat(32),
    identifiers: ["12".repeat(32)],
    txHash: "34".repeat(32),
    blockHash: "56".repeat(32),
    blockHeight: 1,
    blockTimestamp: 1,
    blockAuthor: null,
    indexerId: 1,
    protocolVersion: 9,
    fees: { paidFees: "0", estimatedFees: "0" },
    segmentStatusMap: undefined,
    unshielded: { created: [], spent: [] },
  };
  const contract: DeployedVaultContract = {
    deployTxData: {
      public: {
        ...finalised,
        contractAddress: environment.contractAddress,
        initialContractState: initial.currentContractState,
      },
      private: {
        signingKey: signingKeyFromBip340(new Uint8Array(32).fill(1)),
        initialPrivateState: privateState,
      },
    },
    callTx: createCircuitCallTxInterface(
      providers,
      compiled,
      environment.contractAddress,
      VAULT_PRIVATE_STATE_ID,
    ),
    circuitMaintenanceTx: createCircuitMaintenanceTxInterfaces(
      providers,
      compiled,
      environment.contractAddress,
    ),
    contractMaintenanceTx: createContractMaintenanceTxInterface(
      providers,
      compiled,
      environment.contractAddress,
    ),
  };
  providers.privateStateProvider.setContractAddress(environment.contractAddress);
  await providers.privateStateProvider.set(VAULT_PRIVATE_STATE_ID, privateState);
  return {
    sessionId: crypto.randomUUID(),
    providers,
    contract,
    identity,
    environment,
    wallet,
    depositAddress: depositAddress(environment, identity),
    vaultAddress: vaultAddress(environment),
    assertActive: environment.assertActive,
  };
}
