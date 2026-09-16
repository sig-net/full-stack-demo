import { secp256k1 } from "@noble/curves/secp256k1";
import { getMpcRootPublicKey, getSignetContractAddress, MidnightNetwork } from "@sig-net/midnight";
import { getVaultContractAddress } from "@sig-net/midnight-examples-erc20-vault-contract";
import { type Chain, defineChain, type Hex, keccak256, toBytes } from "viem";
import * as chains from "viem/chains";
import { mainnet, sepolia } from "viem/chains";
import { z } from "zod";

import type { Env } from "../midnight/vault";

/** String values accepted by the protocol network enum and browser wallet configuration. */
export type NetworkId = `${MidnightNetwork}`;
/** Immutable public endpoints captured by wallet sessions and server-side indexer clients. */
export interface MidnightNodeConfig {
  readonly networkId: NetworkId;
  readonly indexerUrl: string;
  readonly indexerWsUrl: string;
  readonly nodeUrl: string;
  readonly proofServerUrl: string;
}
/** Explicit EVM environments available in the configuration selector. */
export const EVM_NETWORKS = ["local", "sepolia", "mainnet"] as const;
/** Selected default and chain-discovery policy for an EVM configuration. */
export type EvmNetwork = (typeof EVM_NETWORKS)[number];
/** Nullable chain and empty endpoints represent an unapplied connection. */
export interface EvmChainConfig {
  readonly network: EvmNetwork;
  readonly chainId: bigint | null;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
}
/** Connection inputs include a chain representable by number-based wallet APIs. */
export interface ResolvedEvmChainConfig extends EvmChainConfig {
  readonly chainId: bigint;
  readonly chain: Chain;
}
/** Deployment identities are independent of wallet credentials. */
export interface ERC20VaultConfig {
  readonly contractAddress: string;
  readonly signetContractAddress: string;
  readonly mpcPubkey: string;
}
/** One transaction captures all three public configuration sections. */
export interface RuntimeConfig {
  readonly midnight: MidnightNodeConfig;
  readonly evm: EvmChainConfig;
  readonly vault: ERC20VaultConfig;
}
/** The applied vault secret, held in page memory apart from public configuration. */
export interface VaultIdentity {
  readonly secret: string;
}
/** Incomplete input remains editable without constructing SDK resources. */
export type ConfigurationReadiness<T> =
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "unavailable"; readonly reasons: readonly string[] };
/** Owners invalidated by changes to operational configuration or identity. */
export type RuntimeScope = keyof RuntimeConfig | "identity";

/**
 * Recognises literal loopback hosts and rejects embedded URL credentials.
 *
 * @param value - An absolute URL to classify for local endpoint policy.
 * @returns Whether an HTTP(S) or WebSocket endpoint names a supported loopback host.
 * @throws {TypeError} If the value cannot be parsed as an absolute URL.
 */
export function isLoopbackEndpoint(value: string): boolean {
  const url = new URL(value);
  return (
    ["http:", "https:", "ws:", "wss:"].includes(url.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !url.username &&
    !url.password
  );
}

const LOCAL_PROOF_SERVER_URL = "http://127.0.0.1:6300";
// Stagenet literals mirror midnight-integration/packages/signet-contract-deploy/src/plumbing/midnight-node-config.ts.
// Replace this intentional duplication when an equivalent stable shared export is available and its adoption is authorised.
// Publicnode endpoints passed browser-origin RPC reads. Retire these overrides when dependency defaults pass the same check.
/** Public endpoint defaults for every selectable network. The loopback entries name the local stack. */
export const NETWORK_DEFAULTS: {
  readonly midnight: Readonly<Record<NetworkId, MidnightNodeConfig>>;
  readonly evm: Readonly<Record<EvmNetwork, EvmChainConfig>>;
} = Object.freeze({
  midnight: Object.freeze({
    undeployed: Object.freeze({
      networkId: "undeployed",
      indexerUrl: "http://127.0.0.1:8088/api/v4/graphql",
      indexerWsUrl: "ws://127.0.0.1:8088/api/v4/graphql/ws",
      nodeUrl: "http://127.0.0.1:9944",
      proofServerUrl: LOCAL_PROOF_SERVER_URL,
    }),
    stagenet: Object.freeze({
      networkId: "stagenet",
      indexerUrl: "https://indexer.stagenet.shielded.tools/api/v4/graphql",
      indexerWsUrl: "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
      nodeUrl: "https://rpc.stagenet.shielded.tools",
      proofServerUrl: LOCAL_PROOF_SERVER_URL,
    }),
    preview: Object.freeze({
      networkId: "preview",
      indexerUrl: "https://indexer.preview.midnight.network/api/v4/graphql",
      indexerWsUrl: "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
      nodeUrl: "https://rpc.preview.midnight.network",
      proofServerUrl: LOCAL_PROOF_SERVER_URL,
    }),
    preprod: Object.freeze({
      networkId: "preprod",
      indexerUrl: "https://indexer.preprod.midnight.network/api/v4/graphql",
      indexerWsUrl: "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
      nodeUrl: "https://rpc.preprod.midnight.network",
      proofServerUrl: LOCAL_PROOF_SERVER_URL,
    }),
    mainnet: Object.freeze({
      networkId: "mainnet",
      indexerUrl: "https://indexer.mainnet.midnight.network/api/v4/graphql",
      indexerWsUrl: "wss://indexer.mainnet.midnight.network/api/v4/graphql/ws",
      nodeUrl: "https://rpc.mainnet.midnight.network",
      proofServerUrl: LOCAL_PROOF_SERVER_URL,
    }),
  }),
  evm: Object.freeze({
    local: Object.freeze({
      network: "local",
      chainId: null,
      rpcUrl: "http://127.0.0.1:8545",
      explorerUrl: "",
    }),
    sepolia: Object.freeze({
      network: "sepolia",
      chainId: BigInt(sepolia.id),
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
      explorerUrl: sepolia.blockExplorers.default.url,
    }),
    mainnet: Object.freeze({
      network: "mainnet",
      chainId: BigInt(mainnet.id),
      rpcUrl: "https://ethereum-rpc.publicnode.com",
      explorerUrl: mainnet.blockExplorers.default.url,
    }),
  }),
});

/**
 * @param network - Selected Midnight environment.
 * @returns Its initial EVM environment.
 */
function evmNetworkForMidnight(network: NetworkId): EvmNetwork {
  switch (network) {
    case "undeployed":
      return "local";
    case "mainnet":
      return "mainnet";
    case "stagenet":
    case "preview":
    case "preprod":
      return "sepolia";
  }
}
/**
 * @param chainId - Positive EVM chain identifier.
 * @returns The installed chain definition, if published by viem.
 */
export function knownEvmChain(chainId: bigint): Chain | undefined {
  return Object.values(chains).find((chain) => BigInt(chain.id) === chainId);
}
/**
 * @param config - Current applied values.
 * @param chainId - Selected chain or null to clear all EVM fields.
 * @returns The chain override with captured endpoints preserved, or cleared fields for null.
 * @throws {Error} If the chain ID is not positive.
 */
export function selectEvmChain(config: EvmChainConfig, chainId: bigint | null): EvmChainConfig {
  if (chainId === null) return { ...config, chainId, rpcUrl: "", explorerUrl: "" };
  if (chainId === config.chainId) return config;
  if (chainId <= 0n) throw new Error("Enter a positive chain ID representable by the wallet API.");
  return { ...config, chainId };
}
/**
 * @param config - Candidate wallet connection inputs.
 * @returns A number-safe chain definition paired with its captured RPC.
 * @throws {Error} If chain ID or RPC inputs cannot construct a wallet.
 */
export function resolveEvmChain(config: EvmChainConfig): ResolvedEvmChainConfig {
  if (
    config.chainId === null ||
    config.chainId <= 0n ||
    config.chainId > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new Error("Configure a positive EVM chain ID representable by the wallet API.");
  if (!z.url({ protocol: /^https?$/ }).safeParse(config.rpcUrl).success)
    throw new Error("Configure an absolute HTTP(S) EVM RPC URL.");
  const chain =
    knownEvmChain(config.chainId) ??
    defineChain({
      id: Number(config.chainId),
      name: `EVM ${config.chainId.toString()}`,
      nativeCurrency: { name: "Native currency", symbol: "NATIVE", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });
  return { ...config, chainId: config.chainId, chain };
}
/**
 * @param config - Captured network selection and explicit chain override.
 * @returns Whether the RPC must report its chain before this configuration is used.
 */
export function requiresRpcChainVerification(config: EvmChainConfig): boolean {
  return (
    config.network === "local" || config.chainId !== NETWORK_DEFAULTS.evm[config.network].chainId
  );
}
/**
 * @param rpcUrl - Absolute HTTP(S) endpoint serving Sepolia or a local fork of it.
 * @returns Sepolia chain inputs bound to that endpoint. A loopback endpoint selects the local
 * network, whose chain is verified against the RPC and whose receipts have no explorer.
 * @throws {Error} If the endpoint is not an absolute HTTP(S) URL.
 */
export function sepoliaChainConfig(rpcUrl: string): EvmChainConfig {
  const parsed = z.url({ protocol: /^https?$/ }).parse(rpcUrl);
  return {
    ...NETWORK_DEFAULTS.evm[isLoopbackEndpoint(parsed) ? "local" : "sepolia"],
    chainId: BigInt(sepolia.id),
    rpcUrl: parsed,
  };
}
/**
 * @param indexerUrl - HTTP GraphQL endpoint, or empty to clear its twin.
 * @returns The WS(S) endpoint with a single appended subscription path.
 */
export function deriveIndexerWsUrl(indexerUrl: string): string {
  if (!indexerUrl) return "";
  const subscription = new URL(indexerUrl);
  subscription.protocol = subscription.protocol === "https:" ? "wss:" : "ws:";
  subscription.pathname = `${subscription.pathname.replace(/\/$/, "")}/ws`;
  return subscription.toString();
}
/**
 * Resolves the proving-asset root, treating an empty override as the app's own public asset tree.
 *
 * @param browserOrigin - The app origin used when the override is absent or empty.
 * @returns An absolute HTTP(S) asset root with its final slash removed.
 * @throws {Error} If the selected root is not an absolute HTTP(S) URL.
 */
export function getZkConfigOrigin(browserOrigin: string): string {
  const override = process.env.NEXT_PUBLIC_ZK_CONFIG_ORIGIN;
  const value = override === undefined || override === "" ? `${browserOrigin}/zk` : override;
  if (!z.url({ protocol: /^https?$/ }).safeParse(value).success)
    throw new Error("NEXT_PUBLIC_ZK_CONFIG_ORIGIN must be an absolute HTTP(S) URL");
  return value.replace(/\/$/, "");
}

/**
 * @returns The network selected by the public startup selector, defaulting to undeployed.
 * @throws {Error} If the selector names an unknown network.
 */
function startupNetwork(): MidnightNetwork {
  return z.enum(MidnightNetwork).parse(process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID ?? "undeployed");
}
/**
 * @param networkId - Selected network, defaulting to the startup network.
 * @returns Independently resolved deployment publications and network endpoint defaults. The
 * public vault address, Signet address and MPC key variables describe a deployment on the startup
 * network, so they replace that network's published values and leave every other network's
 * defaults alone.
 * @throws {Error} If a set address variable is not a 32-byte hexadecimal address, or a set key
 * variable is not a secp256k1 public key.
 */
export function getRuntimeDefaults(networkId: NetworkId = startupNetwork()): RuntimeConfig {
  const generated = (value: string | undefined): string | undefined =>
    value === undefined || value === "" ? undefined : value;
  const optional = (lookup: () => string): string => {
    try {
      return lookup();
    } catch {
      return "";
    }
  };
  const network = z.enum(MidnightNetwork).parse(networkId);
  const published =
    network === MidnightNetwork.Undeployed
      ? { contractAddress: "", signetContractAddress: "", mpcPubkey: "" }
      : {
          contractAddress: optional(() => getVaultContractAddress(network)),
          signetContractAddress: optional(() => getSignetContractAddress(network)),
          mpcPubkey: optional(() => getMpcRootPublicKey(network)),
        };
  return validateRuntimeConfig({
    midnight: NETWORK_DEFAULTS.midnight[networkId],
    evm: NETWORK_DEFAULTS.evm[evmNetworkForMidnight(networkId)],
    vault:
      network === startupNetwork()
        ? {
            ...published,
            contractAddress:
              generated(process.env.NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS) ??
              published.contractAddress,
            signetContractAddress:
              generated(process.env.NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS) ??
              published.signetContractAddress,
            mpcPubkey:
              generated(process.env.NEXT_PUBLIC_MPC_SECP256K1_PUBKEY) ?? published.mpcPubkey,
          }
        : published,
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
  midnight: MidnightNodeConfig;
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
  config: MidnightNodeConfig,
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
export function updateMidnightConfig<K extends keyof MidnightNodeConfig>(
  config: RuntimeConfig,
  key: K,
  value: MidnightNodeConfig[K],
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
    return { ...base, evm: NETWORK_DEFAULTS.evm[network] };
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
/** Public configuration and the page-memory identity publish together as one immutable state. */
export interface RuntimeState {
  readonly applied: RuntimeSnapshot;
  readonly identity: VaultIdentity;
}
/** Changes invalidate affected owners synchronously before publication. */
export interface RuntimeConfiguration {
  getSnapshot: () => RuntimeState;
  subscribe: (listener: () => void) => () => void;
  onInvalidate: (listener: (scopes: ReadonlySet<RuntimeScope>) => void) => () => void;
  applyConfiguration: (config: RuntimeConfig, expectedRevision?: number) => void;
  setMidnight: <K extends keyof MidnightNodeConfig>(key: K, value: MidnightNodeConfig[K]) => void;
  setEvm: <K extends keyof EvmChainConfig>(key: K, value: EvmChainConfig[K]) => void;
  setVault: <K extends keyof ERC20VaultConfig>(key: K, value: ERC20VaultConfig[K]) => void;
  reset: () => void;
  /**
   * Applies a normalised 32-byte vault secret. The configuration revision stays unchanged, so an
   * open editor draft survives identity changes.
   *
   * @param input - The user-supplied secret, optionally 0x-prefixed and surrounded by whitespace.
   * @throws {Error} If the input is not 64 hexadecimal characters.
   */
  setIdentity: (input: string) => void;
  clearIdentity: () => void;
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
 * @returns An immutable state owner that validates and invalidates before publishing.
 */
export function createRuntimeConfiguration(config = getRuntimeDefaults()): RuntimeConfiguration {
  let state: RuntimeState = Object.freeze({
    applied: snapshot(validateRuntimeConfig(config), 0),
    identity: Object.freeze({ secret: "" }),
  });
  const listeners = new Set<() => void>();
  const invalidators = new Set<(scopes: ReadonlySet<RuntimeScope>) => void>();
  const publish = (next: RuntimeState, scopes: ReadonlySet<RuntimeScope>): void => {
    for (const invalidate of invalidators) invalidate(scopes);
    state = next;
    for (const listener of listeners) listener();
  };
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
    publish(Object.freeze({ applied: next, identity: state.identity }), scopes);
  };
  const replaceIdentity = (secret: string): void => {
    if (secret === state.identity.secret) return;
    publish(
      Object.freeze({ applied: state.applied, identity: Object.freeze({ secret }) }),
      new Set<RuntimeScope>(["identity", "vault"]),
    );
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
    setIdentity: (input) => {
      const normalised = input.trim().replace(/^0x/i, "").toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(normalised))
        throw new Error("Enter a 32-byte vault secret as 64 hexadecimal characters.");
      replaceIdentity(normalised);
    },
    clearIdentity: () => {
      replaceIdentity("");
    },
  };
}
