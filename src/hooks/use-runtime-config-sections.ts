"use client";

import { MidnightNetwork } from "@sig-net/midnight";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createPublicClient, http } from "viem";
import { z } from "zod";

import { EVM_NETWORKS, type EvmNetwork, selectEvmChain } from "@/lib/config/evm";
import { deriveIndexerWsUrl } from "@/lib/config/midnight";
import {
  getRuntimeDefaults,
  type RuntimeConfig,
  type RuntimeScope,
  type RuntimeSnapshot,
  updateEvmConfig,
  validateRuntimeConfig,
} from "@/lib/config/runtime";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { useRuntimeConfiguration } from "@/providers/runtime-config-context";

type Draft = Omit<RuntimeConfig, "evm"> & {
  evm: Omit<RuntimeConfig["evm"], "chainId"> & { chainId: string };
};
type FieldKey =
  keyof RuntimeConfig["midnight"] | keyof RuntimeConfig["evm"] | keyof RuntimeConfig["vault"];
interface FieldDefinition {
  key: FieldKey;
  section: RuntimeScope;
  label: string;
  help: string;
}
const definitions: readonly FieldDefinition[] = [
  {
    key: "mpcPubkey",
    section: "vault",
    label: "MPC public key",
    help: "Compressed or uncompressed secp256k1 public key, with an optional 0x prefix.",
  },
  {
    key: "contractAddress",
    section: "vault",
    label: "Contract address",
    help: "The 32-byte Midnight vault address.",
  },
  {
    key: "signetContractAddress",
    section: "vault",
    label: "Signet contract address",
    help: "The 32-byte Signet address paired with this vault.",
  },
  {
    key: "networkId",
    section: "midnight",
    label: "Network",
    help: "Selecting a network prepares all three sections with its defaults. Apply commits the whole draft.",
  },
  {
    key: "indexerUrl",
    section: "midnight",
    label: "Indexer URL",
    help: "HTTP(S) GraphQL endpoint. Editing it also derives the WebSocket URL.",
  },
  {
    key: "indexerWsUrl",
    section: "midnight",
    label: "Indexer WebSocket URL",
    help: "WS(S) GraphQL subscription endpoint.",
  },
  {
    key: "nodeUrl",
    section: "midnight",
    label: "Node URL",
    help: "HTTP(S) or WS(S) Midnight node endpoint.",
  },
  {
    key: "proofServerUrl",
    section: "midnight",
    label: "Proof server URL",
    help: "HTTP(S) proof endpoint. It receives private witness data.",
  },
  {
    key: "network",
    section: "evm",
    label: "EVM network",
    help: "Prepares local, Sepolia or mainnet defaults and a compatible Midnight network. Subsequent endpoint edits remain independent.",
  },
  {
    key: "chainId",
    section: "evm",
    label: "Chain",
    help: "Positive EVM chain ID, or empty for unset. Network selection supplies public defaults. Chain overrides preserve explicit endpoints. Vault assets require Sepolia (11155111).",
  },
  {
    key: "rpcUrl",
    section: "evm",
    label: "RPC URL",
    help: "HTTP(S) EVM endpoint for application reads and seed submissions.",
  },
  {
    key: "explorerUrl",
    section: "evm",
    label: "Explorer URL",
    help: "Optional HTTP(S) explorer. Local receipts require a local explorer. Empty disables links.",
  },
];
function draftOf(config: RuntimeConfig): Draft {
  return {
    midnight: { ...config.midnight },
    evm: { ...config.evm, chainId: config.evm.chainId?.toString() ?? "" },
    vault: { ...config.vault },
  };
}
function chainOf(value: string): bigint | null {
  if (!value) return null;
  if (!/^[1-9][0-9]*$/.test(value))
    throw new Error("Enter a positive integral chain ID, or clear it.");
  return BigInt(value);
}
function valueOf(draft: Draft, key: FieldKey): string {
  switch (key) {
    case "contractAddress":
    case "signetContractAddress":
    case "mpcPubkey":
      return draft.vault[key];
    case "network":
    case "chainId":
    case "rpcUrl":
    case "explorerUrl":
      return draft.evm[key];
    default:
      return draft.midnight[key];
  }
}
interface ConfigurationSections {
  applied: RuntimeSnapshot;
  edit: (key: FieldKey, value: string) => void;
  apply: () => boolean;
  discard: () => void;
  reset: () => void;
  pending: boolean;
  failure: string | null;
  walletError: string | null;
  sections: {
    title: string;
    fields: (FieldDefinition & {
      value: string;
      appliedValue: string;
      error: string | undefined;
      difference: { message: string; walletValue: string } | undefined;
      options: { value: string; label: string }[] | undefined;
    })[];
  }[];
}
/**
 * @returns One local editor draft with atomic Apply and superseded-revision protection.
 */
export function useRuntimeConfigSections(): ConfigurationSections {
  const { owner, applied } = useRuntimeConfiguration();
  const connection = useMidnightConnection();
  const [editing, setEditing] = useState<{ draft: Draft; revision: number } | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<RuntimeScope, Partial<Record<FieldKey, string>>>>
  >({});
  const [failure, setFailure] = useState<string | null>(null);
  const current = editing ?? { draft: draftOf(applied), revision: applied.revision };
  const { draft } = current;
  const localChain = useQuery({
    queryKey: ["local-evm-chain", draft.evm.rpcUrl],
    enabled:
      draft.evm.network === "local" &&
      draft.evm.chainId === "" &&
      z.url({ protocol: /^https?$/ }).safeParse(draft.evm.rpcUrl).success,
    queryFn: async ({ signal }): Promise<bigint> => {
      const client = createPublicClient({
        transport: http(draft.evm.rpcUrl, {
          fetchOptions: { signal },
          retryCount: 0,
          timeout: 10000,
        }),
      });
      return BigInt(await client.getChainId());
    },
    retry: false,
  });
  const resolvedDraft =
    draft.evm.network === "local" &&
    draft.evm.chainId === "" &&
    localChain.isSuccess &&
    !localChain.isFetching
      ? { ...draft, evm: { ...draft.evm, chainId: localChain.data.toString() } }
      : draft;
  const edit = (key: FieldKey, value: string): void => {
    setFailure(null);
    let next = draft;
    try {
      switch (key) {
        case "networkId": {
          const network = z.enum(MidnightNetwork).parse(value);
          if (network !== z.enum(MidnightNetwork).parse(draft.midnight.networkId))
            next = draftOf(getRuntimeDefaults(network));
          break;
        }
        case "network": {
          const selected = z.enum(EVM_NETWORKS).parse(value);
          next = draftOf(
            updateEvmConfig(
              { ...draft, evm: { ...draft.evm, chainId: chainOf(draft.evm.chainId) } },
              "network",
              selected,
            ),
          );
          break;
        }
        case "chainId": {
          try {
            next = {
              ...draft,
              evm: {
                ...selectEvmChain(
                  { ...draft.evm, chainId: chainOf(draft.evm.chainId) },
                  chainOf(value),
                ),
                chainId: value,
              },
            };
          } catch {
            next = { ...draft, evm: { ...draft.evm, chainId: value } };
          }
          break;
        }
        case "rpcUrl":
          next = {
            ...draft,
            evm: {
              ...draft.evm,
              rpcUrl: value,
              chainId: draft.evm.network === "local" ? "" : draft.evm.chainId,
            },
          };
          break;
        case "explorerUrl":
          next = { ...draft, evm: { ...draft.evm, [key]: value } };
          break;
        case "contractAddress":
        case "signetContractAddress":
        case "mpcPubkey":
          next = { ...draft, vault: { ...draft.vault, [key]: value } };
          break;
        case "indexerUrl": {
          let ws = "";
          try {
            ws = deriveIndexerWsUrl(value);
          } catch {
            /* Invalid drafts remain editable until Apply. */
          }
          next = { ...draft, midnight: { ...draft.midnight, indexerUrl: value, indexerWsUrl: ws } };
          break;
        }
        default:
          next = { ...draft, midnight: { ...draft.midnight, [key]: value } };
      }
      setEditing({ ...current, draft: next });
      setErrors({});
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Invalid configuration.");
    }
  };
  const apply = (): boolean => {
    try {
      const config = validateRuntimeConfig({
        ...resolvedDraft,
        evm: { ...resolvedDraft.evm, chainId: chainOf(resolvedDraft.evm.chainId) },
      });
      owner.applyConfiguration(config, current.revision);
      setEditing(null);
      setErrors({});
      setFailure(null);
      return true;
    } catch (error) {
      const nextErrors: Partial<Record<RuntimeScope, Partial<Record<FieldKey, string>>>> = {};
      if (error instanceof z.ZodError)
        for (const issue of error.issues) {
          const field = definitions.find(
            (definition) =>
              definition.section === issue.path[0] && definition.key === issue.path[1],
          );
          if (field)
            nextErrors[field.section] = {
              ...nextErrors[field.section],
              [field.key]: issue.message,
            };
        }
      else if (!/^[1-9][0-9]*$/.test(draft.evm.chainId) && draft.evm.chainId)
        nextErrors.evm = { chainId: "Enter a positive integral chain ID." };
      setErrors(nextErrors);
      setFailure(
        error instanceof z.ZodError
          ? "Correct the highlighted configuration fields."
          : error instanceof Error
            ? error.message
            : "Invalid configuration.",
      );
      return false;
    }
  };
  const appliedDraft = draftOf(applied);
  const walletDifference = (
    key: FieldKey,
  ): { message: string; walletValue: string } | undefined => {
    const wallet = connection.wallet;
    if (wallet?.kind !== "browser") return undefined;
    const reported = wallet.configuration;
    const value =
      key === "proofServerUrl"
        ? wallet.reportedProofServerUrl
        : reported &&
            (key === "networkId" ||
              key === "indexerUrl" ||
              key === "indexerWsUrl" ||
              key === "nodeUrl")
          ? reported[key]
          : undefined;
    if (!value || value === valueOf(appliedDraft, key)) return undefined;
    return {
      walletValue: value,
      message:
        key === "networkId"
          ? "The wallet network differs. Reconnect on the configured network."
          : "The wallet reports a different endpoint. App vault reads and proofs use the applied configuration.",
    };
  };
  return {
    applied,
    edit,
    apply,
    discard: (): void => {
      setEditing(null);
      setErrors({});
      setFailure(null);
    },
    reset: (): void => {
      setEditing({ ...current, draft: draftOf(getRuntimeDefaults(draft.midnight.networkId)) });
      setErrors({});
    },
    pending:
      editing !== null || resolvedDraft.evm.chainId !== (applied.evm.chainId?.toString() ?? ""),
    failure,
    walletError: connection.error,
    sections: (["vault", "midnight", "evm"] as const).map((section) => ({
      title: section === "vault" ? "Vault" : section === "midnight" ? "Midnight" : "EVM",
      fields: definitions
        .filter((field) => field.section === section)
        .map((field) => ({
          ...field,
          value: valueOf(resolvedDraft, field.key),
          appliedValue: valueOf(appliedDraft, field.key),
          error:
            errors[section]?.[field.key] ??
            (section === "evm" &&
            field.key === "chainId" &&
            draft.evm.network === "local" &&
            !draft.evm.chainId
              ? localChain.isError
                ? "Local chain discovery failed. Check the RPC URL or enter its chain ID."
                : localChain.isFetching
                  ? "Discovering local chain ID..."
                  : undefined
              : undefined),
          difference: walletDifference(field.key),
          options:
            field.key === "network"
              ? EVM_NETWORKS.map((value: EvmNetwork) => ({
                  value,
                  label:
                    value === "local"
                      ? "Local testnet"
                      : value === "sepolia"
                        ? "Sepolia testnet"
                        : "Mainnet",
                }))
              : field.key === "networkId"
                ? Object.values(MidnightNetwork).map((value) => ({ value, label: value }))
                : undefined,
        })),
    })),
  };
}
