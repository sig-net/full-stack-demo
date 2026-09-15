import { secp256k1 } from "@noble/curves/secp256k1";
import { getMpcRootPublicKey, getSignetContractAddress, MidnightNetwork } from "@sig-net/midnight";
import { getVaultContractAddress } from "@sig-net/midnight-examples-erc20-vault-contract";
import { type Hex, keccak256, toBytes } from "viem";
import { z } from "zod";

import type { Env } from "../midnight/vault";
import {
  EVM_NETWORKS,
  type EvmChainConfig,
  evmNetworkForMidnight,
  getEvmNetworkDefaults,
  requiresRpcChainVerification,
  type ResolvedEvmChainConfig,
  resolveEvmChain,
  selectEvmChain,
  sepolia,
} from "./evm";
import { isLoopbackEndpoint } from "./loopback-endpoint";
import { deriveIndexerWsUrl, type MidnightNodeConfig, type NetworkId } from "./midnight";

/** The shared endpoint contract retains one definition in midnight.ts. */
export type MidnightChainConfig = MidnightNodeConfig;
export type { EvmChainConfig } from "./evm";
/** Deployment identities are independent of wallet credentials. */
export interface ERC20VaultConfig {
  readonly contractAddress: string;
  readonly signetContractAddress: string;
  readonly mpcPubkey: string;
}
/** One transaction captures all three configuration sections. */
export interface RuntimeConfig {
  readonly midnight: MidnightChainConfig;
  readonly evm: EvmChainConfig;
  readonly vault: ERC20VaultConfig;
}
/** Incomplete input remains editable without constructing SDK resources. */
export type ConfigurationReadiness<T> =
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "unavailable"; readonly reasons: readonly string[] };
/** Owners invalidated by changes to operational configuration. */
export type RuntimeScope = keyof RuntimeConfig;

// Stagenet literals mirror midnight-integration/packages/signet-contract-deploy/src/plumbing/midnight-node-config.ts.
// Replace this intentional duplication when an equivalent stable shared export is available and its adoption is authorised.
const midnightEndpoints: Record<NetworkId, readonly [string, string, string]> = {
  undeployed: [
     "http://127.0.0.1:8088/api/v3/graphql",
     "ws://127.0.0.1:8088/api/v3/graphql/ws",
     "http://127.0.0.1:9944"
  ],
  stagenet: [
    "https://indexer.stagenet.shielded.tools/api/v4/graphql",
    "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
    "https://rpc.stagenet.shielded.tools",
  ],
  preview: [
    "https://indexer.preview.midnight.network/api/v4/graphql",
    "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
    "https://rpc.preview.midnight.network",
  ],
  preprod: [
    "https://indexer.preprod.midnight.network/api/v4/graphql",
    "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
    "https://rpc.preprod.midnight.network",
  ],
  mainnet: [
    "https://indexer.mainnet.midnight.network/api/v4/graphql",
    "wss://indexer.mainnet.midnight.network/api/v4/graphql/ws",
    "https://rpc.mainnet.midnight.network",
  ],
};

/**
 * @param networkId - Selected network, defaulting only from its public startup selector.
 * @returns Independently resolved deployment publications and network endpoint defaults.
 */
export function getRuntimeDefaults(
  networkId: NetworkId = z
    .enum(MidnightNetwork)
    .parse(process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID ?? "undeployed"),
): RuntimeConfig {
  const [indexerUrl, indexerWsUrl, nodeUrl] = midnightEndpoints[networkId];
  const optional = (lookup: () => string): string => {
    try {
      return lookup();
    } catch {
      return "";
    }
  };
  const network = z.enum(MidnightNetwork).parse(networkId);
  return validateRuntimeConfig({
    midnight: {
      networkId,
      indexerUrl,
      indexerWsUrl,
      nodeUrl,
      proofServerUrl: "http://127.0.0.1:6300",
    },
    evm: getEvmNetworkDefaults(evmNetworkForMidnight(networkId)),
    vault:
      network === MidnightNetwork.Undeployed
        ? { contractAddress: "", signetContractAddress: "", mpcPubkey: "" }
        : {
            contractAddress: optional(() => getVaultContractAddress(network)),
            signetContractAddress: optional(() => getSignetContractAddress(network)),
            mpcPubkey: optional(() => getMpcRootPublicKey(network)),
          },
  });
}

const httpEndpoint = z.union([z.literal(""), z.url({ protocol: /^https?$/ })]);
const wsEndpoint = z.union([z.literal(""), z.url({ protocol: /^wss?$/ })]);
const nodeEndpoint = z.union([z.literal(""), z.url({ protocol: /^(https?|wss?)$/ })]);
const address = z
  .string()
  .refine(
    (value) => value === "" || /^(?:0x)?[a-fA-F0-9]{64}$/.test(value),
    "Enter a 32-byte hexadecimal contract address.",
  )
  .transform((value) => value.replace(/^0x/, "").toLowerCase());
const pubkey = z.string().transform((value, context) => {
  if (!value) return "";
  try {
    return `0x${secp256k1.Point.fromHex(value.replace(/^0x/, "")).toHex(true)}`;
  } catch {
    context.addIssue({ code: "custom", message: "Enter a valid secp256k1 public key." });
    return z.NEVER;
  }
});
const midnightSchema = z.object({
  networkId: z.enum(MidnightNetwork),
  indexerUrl: httpEndpoint,
  indexerWsUrl: wsEndpoint,
  nodeUrl: nodeEndpoint,
  proofServerUrl: httpEndpoint,
});
const evmSchema = z.object({
  network: z.enum(EVM_NETWORKS),
  chainId: z.bigint().positive().nullable(),
  rpcUrl: httpEndpoint,
  explorerUrl: httpEndpoint,
});
const vaultSchema = z.object({
  contractAddress: address,
  signetContractAddress: address,
  mpcPubkey: pubkey,
});
const runtimeSchema = z
  .object({ midnight: midnightSchema, evm: evmSchema, vault: vaultSchema })
  .superRefine((config, context) => {
    if (
      config.evm.explorerUrl &&
      isLoopbackEndpoint(config.evm.rpcUrl) &&
      !isLoopbackEndpoint(config.evm.explorerUrl)
    )
      context.addIssue({
        code: "custom",
        path: ["evm", "explorerUrl"],
        message: "Use a local explorer for local fork receipts, or leave this empty.",
      });
  });
/** Validates canonical public wire values before they enter application configuration. */
export const runtimeConfigurationSchema = z
  .object({
    midnight: midnightSchema,
    evm: evmSchema.extend({
      chainId: z
        .string()
        .regex(/^[1-9][0-9]*$/)
        .transform(BigInt)
        .nullable(),
    }),
    vault: vaultSchema,
  })
  .pipe(runtimeSchema);

/**
 * @param config - Applied public configuration.
 * @returns Nested wire values with canonical decimal chain IDs.
 */
export function createRuntimeConfigDto(config: RuntimeConfig): {
  midnight: MidnightChainConfig;
  evm: Omit<EvmChainConfig, "chainId"> & { chainId: string | null };
  vault: ERC20VaultConfig;
} {
  return {
    midnight: config.midnight,
    evm: { ...config.evm, chainId: config.evm.chainId?.toString() ?? null },
    vault: config.vault,
  };
}
/**
 * @param config - Candidate applied configuration.
 * @returns Normalised values, retaining explicitly empty fields.
 */
export function validateRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
  return runtimeSchema.parse(config);
}
/**
 * @param config - Syntactically validated endpoint record.
 * @returns Complete wallet inputs or concrete missing-field reasons.
 */
export function resolveMidnightConfiguration(
  config: MidnightChainConfig,
): ConfigurationReadiness<MidnightNodeConfig> {
  const reasons = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => `Configure Midnight ${key}.`);
  return reasons.length ? { status: "unavailable", reasons } : { status: "ready", value: config };
}
/**
 * @param config - Applied chain and endpoint record.
 * @returns Number-safe wallet inputs or a configuration reason.
 */
export function resolveEvmConfiguration(
  config: EvmChainConfig,
): ConfigurationReadiness<ResolvedEvmChainConfig> {
  try {
    return { status: "ready", value: resolveEvmChain(config) };
  } catch (error) {
    return {
      status: "unavailable",
      reasons: [error instanceof Error ? error.message : "EVM configuration is unavailable."],
    };
  }
}
/**
 * @param config - Syntactically validated composed configuration.
 * @returns Complete SDK environment inputs or missing/capability reasons.
 */
export function resolveVaultConfiguration(config: RuntimeConfig): ConfigurationReadiness<Env> {
  const reasons = Object.entries(config.vault)
    .filter(([, value]) => !value)
    .map(([key]) => `Configure vault ${key}.`);
  const midnight = resolveMidnightConfiguration(config.midnight);
  const evm = resolveEvmConfiguration(config.evm);
  if (midnight.status === "unavailable") reasons.push(...midnight.reasons);
  if (evm.status === "unavailable") reasons.push(...evm.reasons);
  if (config.evm.chainId !== BigInt(sepolia.id))
    reasons.push("Vault asset routing requires Sepolia (11155111).");
  return reasons.length
    ? { status: "unavailable", reasons }
    : {
        status: "ready",
        value: Object.freeze({
          contractAddress: config.vault.contractAddress,
          signetContractAddress: config.vault.signetContractAddress,
          mpcSecpPub: config.vault.mpcPubkey,
          evmRpcUrl: config.evm.rpcUrl,
          verifyRpcChain: requiresRpcChainVerification(config.evm),
        }),
      };
}
/**
 * @param config - Normalised composed configuration.
 * @returns Versioned operational hash excluding explorer presentation.
 */
export function runtimeFingerprint(config: RuntimeConfig): Hex {
  const { midnight: m, evm: e, vault: v } = config;
  return keccak256(
    toBytes(
      JSON.stringify([
        "vault-runtime-v3",
        m.networkId,
        m.indexerUrl,
        m.indexerWsUrl,
        m.nodeUrl,
        m.proofServerUrl,
        e.network,
        e.chainId?.toString() ?? null,
        e.rpcUrl,
        v.contractAddress,
        v.signetContractAddress,
        v.mpcPubkey,
      ]),
    ),
  );
}
/**
 * @param config - Current composed configuration.
 * @param key - Selected Midnight property.
 * @param value - Replacement value before full-record validation.
 * @returns Candidate preserving atomic network resets and HTTP/WebSocket pairing.
 */
export function updateMidnightConfig<K extends keyof MidnightChainConfig>(
  config: RuntimeConfig,
  key: K,
  value: MidnightChainConfig[K],
): RuntimeConfig {
  if (key === "networkId") {
    const network = z.enum(MidnightNetwork).parse(value);
    return network === z.enum(MidnightNetwork).parse(config.midnight.networkId)
      ? config
      : getRuntimeDefaults(network);
  }
  return {
    ...config,
    midnight: {
      ...config.midnight,
      [key]: value,
      ...(key === "indexerUrl" ? { indexerWsUrl: deriveIndexerWsUrl(value) } : {}),
    },
  };
}
/**
 * @param config - Current composed configuration.
 * @param key - Selected EVM property.
 * @param value - Replacement value before full-record validation.
 * @returns Candidate with chain-dependent endpoint defaults.
 * @throws {Error} If a supplied chain ID is invalid.
 */
export function updateEvmConfig<K extends keyof EvmChainConfig>(
  config: RuntimeConfig,
  key: K,
  value: EvmChainConfig[K],
): RuntimeConfig {
  if (key === "network") {
    const network = z.enum(EVM_NETWORKS).parse(value);
    if (network === config.evm.network) return config;
    const midnightNetwork =
      network === "local"
        ? "undeployed"
        : network === "mainnet"
          ? "mainnet"
          : config.midnight.networkId === "stagenet" ||
              config.midnight.networkId === "preview" ||
              config.midnight.networkId === "preprod"
            ? config.midnight.networkId
            : "stagenet";
    const base =
      midnightNetwork === config.midnight.networkId ? config : getRuntimeDefaults(midnightNetwork);
    return { ...base, evm: getEvmNetworkDefaults(network) };
  }
  if (key === "chainId") {
    if (typeof value !== "bigint" && value !== null) throw new Error("Invalid chain ID.");
    return { ...config, evm: selectEvmChain(config.evm, value) };
  }
  return { ...config, evm: { ...config.evm, [key]: value } };
}
/** Applied inputs carry their revision and validated construction eligibility. */
export interface RuntimeSnapshot extends RuntimeConfig {
  readonly revision: number;
  readonly fingerprint: Hex;
  readonly readiness: {
    readonly midnight: ConfigurationReadiness<MidnightNodeConfig>;
    readonly evm: ConfigurationReadiness<ResolvedEvmChainConfig>;
    readonly vault: ConfigurationReadiness<Env>;
  };
}
/** Changes invalidate affected owners synchronously before publication. */
export interface RuntimeConfiguration {
  getSnapshot: () => { readonly applied: RuntimeSnapshot };
  subscribe: (listener: () => void) => () => void;
  onInvalidate: (listener: (scopes: ReadonlySet<RuntimeScope>) => void) => () => void;
  applyConfiguration: (config: RuntimeConfig, expectedRevision?: number) => void;
  setMidnight: <K extends keyof MidnightChainConfig>(key: K, value: MidnightChainConfig[K]) => void;
  setEvm: <K extends keyof EvmChainConfig>(key: K, value: EvmChainConfig[K]) => void;
  setVault: <K extends keyof ERC20VaultConfig>(key: K, value: ERC20VaultConfig[K]) => void;
  reset: () => void;
}
function snapshot(config: RuntimeConfig, revision: number): RuntimeSnapshot {
  const frozen = {
    midnight: Object.freeze({ ...config.midnight }),
    evm: Object.freeze({ ...config.evm }),
    vault: Object.freeze({ ...config.vault }),
  };
  return Object.freeze({
    ...frozen,
    revision,
    fingerprint: runtimeFingerprint(config),
    readiness: Object.freeze({
      midnight: resolveMidnightConfiguration(frozen.midnight),
      evm: resolveEvmConfiguration(frozen.evm),
      vault: resolveVaultConfiguration(frozen),
    }),
  });
}
/**
 * @param config - Explicit initial configuration or browser network defaults.
 * @returns An immutable snapshot owner that validates and invalidates before publishing.
 */
export function createRuntimeConfiguration(config = getRuntimeDefaults()): RuntimeConfiguration {
  let state = Object.freeze({ applied: snapshot(validateRuntimeConfig(config), 0) });
  const listeners = new Set<() => void>();
  const invalidators = new Set<(scopes: ReadonlySet<RuntimeScope>) => void>();
  const applyConfiguration = (candidate: RuntimeConfig, expectedRevision?: number): void => {
    const previous = state.applied;
    if (expectedRevision !== undefined && previous.revision !== expectedRevision)
      throw new Error("Configuration changed while editing. Discard to reload applied values.");
    const next = snapshot(validateRuntimeConfig(candidate), previous.revision + 1);
    if (
      next.fingerprint === previous.fingerprint &&
      next.evm.explorerUrl === previous.evm.explorerUrl
    )
      return;
    const scopes = new Set<RuntimeScope>();
    if (next.midnight.networkId !== previous.midnight.networkId) {
      scopes.add("midnight");
      scopes.add("evm");
    }
    if (
      next.midnight.indexerUrl !== previous.midnight.indexerUrl ||
      next.midnight.indexerWsUrl !== previous.midnight.indexerWsUrl ||
      next.midnight.nodeUrl !== previous.midnight.nodeUrl ||
      next.midnight.proofServerUrl !== previous.midnight.proofServerUrl
    )
      scopes.add("midnight");
    if (
      next.evm.network !== previous.evm.network ||
      next.evm.chainId !== previous.evm.chainId ||
      next.evm.rpcUrl !== previous.evm.rpcUrl
    )
      scopes.add("evm");
    if (
      scopes.size ||
      next.vault.contractAddress !== previous.vault.contractAddress ||
      next.vault.signetContractAddress !== previous.vault.signetContractAddress ||
      next.vault.mpcPubkey !== previous.vault.mpcPubkey
    )
      scopes.add("vault");
    for (const invalidate of invalidators) invalidate(scopes);
    state = Object.freeze({ applied: next });
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onInvalidate: (listener) => {
      invalidators.add(listener);
      return () => {
        invalidators.delete(listener);
      };
    },
    applyConfiguration,
    setMidnight: (key, value) => {
      applyConfiguration(updateMidnightConfig(state.applied, key, value));
    },
    setEvm: (key, value) => {
      applyConfiguration(updateEvmConfig(state.applied, key, value));
    },
    setVault: (key, value) => {
      applyConfiguration({ ...state.applied, vault: { ...state.applied.vault, [key]: value } });
    },
    reset: () => {
      applyConfiguration(getRuntimeDefaults(state.applied.midnight.networkId));
    },
  };
}
