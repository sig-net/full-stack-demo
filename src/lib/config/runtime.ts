import { type Hex, keccak256, toBytes } from "viem";
import { z } from "zod";

import { createVaultEnvironment } from "../midnight/env";
import { createEvmChainConfig, type EvmChainConfig, getEvmChainConfig } from "./evm";
import { isLoopbackEndpoint } from "./loopback-endpoint";
import {
  createMidnightChainConfig,
  getMidnightChainConfig,
  type MidnightNodeConfig,
} from "./midnight";

/** Text values shared by the editable draft and server deployment attestation. */
export interface RuntimeFields {
  readonly contractAddress: string;
  readonly mpcSecpPub: string;
  readonly networkId: string;
  readonly indexerUrl: string;
  readonly indexerWsUrl: string;
  readonly nodeUrl: string;
  readonly proofServerUrl: string;
  readonly chainId: string;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
}
/** Keys accepted by configuration edits and field-level validation errors. */
export type RuntimeField = keyof RuntimeFields;
/** Resource owners invalidated when a captured configuration changes. */
export type RuntimeScope = "evm" | "midnight" | "vault";
/** Presentation and invalidation policy for one editable deployment field. */
export interface RuntimeFieldDefinition {
  readonly key: RuntimeField;
  readonly label: string;
  readonly help: string;
  readonly section: "Vault" | "Midnight" | "EVM";
  readonly scope: RuntimeScope | null;
}
/** Ordered fields used by both the editor and deployment fingerprint. Null scopes are presentation-only. */
export const runtimeFields: readonly RuntimeFieldDefinition[] = [
  {
    key: "mpcSecpPub",
    label: "MPC public key",
    section: "Vault",
    scope: "vault",
    help: "A 0x-prefixed secp256k1 public key. Applying it rebinds the vault and changes derived EVM destinations.",
  },
  {
    key: "contractAddress",
    label: "Contract address",
    section: "Vault",
    scope: "vault",
    help: "The 32-byte Midnight vault address. Applying it rebinds the vault using your independent caller identity.",
  },
  {
    key: "networkId",
    label: "Network",
    section: "Midnight",
    scope: "midnight",
    help: "This deployment supports the startup Midnight network. Apply endpoints and deployment fields together.",
  },
  {
    key: "indexerUrl",
    label: "Indexer URL",
    section: "Midnight",
    scope: "midnight",
    help: "Absolute HTTP(S) GraphQL URL. Edit its WebSocket endpoint in the same draft when changing indexers.",
  },
  {
    key: "indexerWsUrl",
    label: "Indexer WebSocket URL",
    section: "Midnight",
    scope: "midnight",
    help: "Absolute WS(S) GraphQL subscription URL. Applying endpoints requires explicit Midnight reconnection.",
  },
  {
    key: "nodeUrl",
    label: "Node URL",
    section: "Midnight",
    scope: "midnight",
    help: "Absolute HTTP(S) or WS(S) node endpoint. Applying it requires explicit Midnight reconnection.",
  },
  {
    key: "proofServerUrl",
    label: "Proof server URL",
    section: "Midnight",
    scope: "midnight",
    help: "Absolute HTTP(S) proof endpoint. It receives private witness data. Applying it requires explicit Midnight reconnection.",
  },
  {
    key: "chainId",
    label: "Chain",
    section: "EVM",
    scope: "evm",
    help: "Sepolia (11155111), including the verified local fork. The vault routing and token contracts use this chain.",
  },
  {
    key: "rpcUrl",
    label: "RPC URL",
    section: "EVM",
    scope: "evm",
    help: "Absolute HTTP(S) endpoint for app reads and seed submissions. Browser wallets use their own RPC, which MetaMask does not report.",
  },
  {
    key: "explorerUrl",
    label: "Explorer URL",
    section: "EVM",
    scope: null,
    help: "Optional HTTP(S) transaction explorer. Empty disables links. Local fork receipts require a local explorer. Signing sessions remain connected.",
  },
];

/** Startup values shared by browser configuration and server attestation. */
export interface RuntimeDefaults {
  readonly fields: RuntimeFields & MidnightNodeConfig;
  readonly signetContractAddress: string;
}

/**
 * Captures startup endpoints, retaining empty deployment fields when they cannot yet resolve.
 *
 * @returns Immutable defaults for a configuration owner.
 * @throws {Error} If public endpoint configuration is invalid.
 */
export function getRuntimeDefaults(): RuntimeDefaults {
  const midnight = getMidnightChainConfig();
  const evm = getEvmChainConfig();
  const environment = createVaultEnvironment(midnight, evm);
  const optional = (read: () => string): string => {
    try {
      return read();
    } catch {
      return "";
    }
  };
  return Object.freeze({
    fields: Object.freeze({
      ...midnight,
      chainId: String(evm.chainId),
      rpcUrl: evm.rpcUrl,
      explorerUrl: evm.explorerUrl ?? "",
      contractAddress: optional(() => environment.contractAddress),
      mpcSecpPub: optional(() => environment.mpcSecpPub),
    }),
    signetContractAddress: optional(() => environment.signetContractAddress),
  });
}
/**
 * Identifies operational configuration while excluding presentation-only fields.
 *
 * @param fields - Applied browser fields or server startup fields.
 * @param signetContractAddress - Protocol deployment paired with the vault.
 * @returns The hash used for server-assisted action attestation.
 */
export function runtimeFingerprint(fields: RuntimeFields, signetContractAddress: string): Hex {
  return keccak256(
    toBytes(
      JSON.stringify([
        ...runtimeFields.filter((field) => field.scope !== null).map((field) => fields[field.key]),
        signetContractAddress,
      ]),
    ),
  );
}
/** Immutable inputs captured together by wallet and vault resource owners. */
export interface RuntimeSnapshot {
  readonly revision: number;
  readonly fields: RuntimeFields;
  readonly evm: EvmChainConfig;
  readonly midnight: MidnightNodeConfig;
  readonly environment: ReturnType<typeof createVaultEnvironment>;
  readonly fingerprint: Hex;
}

function createRuntimeSnapshot(
  fields: RuntimeFields,
  defaults: RuntimeDefaults,
  revision = 0,
): RuntimeSnapshot {
  const evm = Object.freeze({
    ...createEvmChainConfig(fields.rpcUrl),
    explorerUrl: fields.explorerUrl || undefined,
  });
  const midnight = createMidnightChainConfig(fields);
  const environment = createVaultEnvironment(midnight, evm, {
    contractAddress: fields.contractAddress || undefined,
    signetContractAddress: defaults.signetContractAddress || undefined,
    mpcSecpPub: fields.mpcSecpPub || undefined,
  });
  return Object.freeze({
    revision,
    fields: Object.freeze({ ...fields }),
    evm,
    midnight,
    environment,
    fingerprint: runtimeFingerprint(fields, defaults.signetContractAddress),
  });
}
/**
 * Checks an editable deployment against the startup network and supported endpoint protocols.
 *
 * @param fields - Candidate draft values.
 * @param defaults - Captured startup network and Signet deployment.
 * @returns Field-specific errors, empty when the draft can be applied.
 */
export function validateRuntimeFields(
  fields: RuntimeFields,
  defaults: RuntimeDefaults,
): Partial<Record<RuntimeField, string>> {
  const errors: Partial<Record<RuntimeField, string>> = {};
  if (fields.chainId !== defaults.fields.chainId)
    errors.chainId = "Only Sepolia (11155111) is supported by this vault.";
  if (fields.networkId !== defaults.fields.networkId)
    errors.networkId = `Only the startup network ${defaults.fields.networkId} is supported by this deployment.`;
  for (const key of [
    "rpcUrl",
    "indexerUrl",
    "indexerWsUrl",
    "nodeUrl",
    "proofServerUrl",
    "explorerUrl",
  ] as const) {
    if (key === "explorerUrl" && fields[key] === "") continue;
    const protocol =
      key === "indexerWsUrl" ? /^wss?$/ : key === "nodeUrl" ? /^(https?|wss?)$/ : /^https?$/;
    if (!z.url({ protocol }).safeParse(fields[key]).success)
      errors[key] = `Enter an absolute URL with protocol ${protocol.source}.`;
  }
  if (
    !errors.rpcUrl &&
    !errors.explorerUrl &&
    fields.explorerUrl &&
    (fields.networkId === "undeployed" || isLoopbackEndpoint(fields.rpcUrl)) &&
    !isLoopbackEndpoint(fields.explorerUrl)
  )
    errors.explorerUrl = "Use a local explorer for local fork receipts, or leave this empty.";
  if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(fields.contractAddress))
    errors.contractAddress = "Enter a 32-byte hexadecimal vault address.";
  try {
    const environment = createVaultEnvironment(
      createMidnightChainConfig(defaults.fields),
      createEvmChainConfig(defaults.fields.rpcUrl),
      {
        mpcSecpPub: fields.mpcSecpPub,
        contractAddress: fields.contractAddress,
        signetContractAddress: defaults.signetContractAddress,
      },
    );
    void environment.mpcSecpPub;
  } catch {
    errors.mpcSecpPub = "Enter a valid 0x-prefixed secp256k1 public key.";
  }
  return errors;
}

interface RuntimeState {
  readonly applied: RuntimeSnapshot;
  readonly draft: RuntimeFields;
  readonly errors: Partial<Record<RuntimeField, string>>;
}

/** Owns draft edits and invalidates captured resources before publishing an applied revision. */
export interface RuntimeConfiguration {
  defaults: RuntimeDefaults;
  getSnapshot: () => RuntimeState;
  subscribe: (listener: () => void) => () => void;
  onInvalidate: (listener: (scopes: ReadonlySet<RuntimeScope>) => void) => () => void;
  edit: (key: RuntimeField, value: string) => void;
  apply: () => boolean;
  reset: () => boolean;
  discard: () => void;
}

/**
 * Creates an isolated draft owner with synchronous invalidation before each applied revision.
 *
 * @param suppliedDefaults - Startup values retained for reset and deployment attestation.
 * @returns The owner consumed through React's external-store subscription contract.
 */
export function createRuntimeConfiguration(
  suppliedDefaults = getRuntimeDefaults(),
): RuntimeConfiguration {
  const defaults = Object.freeze({
    ...suppliedDefaults,
    fields: Object.freeze({ ...suppliedDefaults.fields }),
  });
  let applied = createRuntimeSnapshot(defaults.fields, defaults);
  let state: RuntimeState = Object.freeze({
    applied,
    draft: applied.fields,
    errors: validateRuntimeFields(defaults.fields, defaults),
  });
  const listeners = new Set<() => void>();
  const invalidators = new Set<(scopes: ReadonlySet<RuntimeScope>) => void>();
  const publish = (): void => {
    for (const listener of listeners) listener();
  };
  const commit = (fields: RuntimeFields, resetting = false): boolean => {
    const errors = validateRuntimeFields(fields, defaults);
    if (!resetting && Object.keys(errors).length) {
      state = Object.freeze({ ...state, errors });
      publish();
      return false;
    }
    const scopes = new Set<RuntimeScope>();
    for (const field of runtimeFields)
      if (field.scope && fields[field.key] !== applied.fields[field.key]) scopes.add(field.scope);
    if (scopes.size) scopes.add("vault");
    const next = createRuntimeSnapshot(fields, defaults, applied.revision + 1);
    for (const invalidate of invalidators) invalidate(scopes);
    applied = next;
    state = Object.freeze({ applied, draft: applied.fields, errors });
    publish();
    return true;
  };
  return {
    defaults,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onInvalidate: (listener: (scopes: ReadonlySet<RuntimeScope>) => void) => {
      invalidators.add(listener);
      return () => {
        invalidators.delete(listener);
      };
    },
    edit: (key: RuntimeField, value: string) => {
      state = Object.freeze({
        ...state,
        draft: Object.freeze({ ...state.draft, [key]: value }),
      });
      publish();
    },
    apply: () => commit(state.draft),
    reset: () => commit(defaults.fields, true),
    discard: () => {
      state = Object.freeze({ applied, draft: applied.fields, errors: {} });
      publish();
    },
  };
}
