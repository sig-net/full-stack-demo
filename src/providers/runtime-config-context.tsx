"use client";

import {
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import type { EvmNetwork } from "@/lib/config/evm";
import type { NetworkId } from "@/lib/config/midnight";
import {
  createRuntimeConfiguration,
  type ERC20VaultConfig,
  type EvmChainConfig,
  type MidnightChainConfig,
  type RuntimeConfig,
  type RuntimeConfiguration,
  type RuntimeSnapshot,
} from "@/lib/config/runtime";

/** Immediate setters share the composed configuration transaction owner. */
export interface MidnightChainConfigContextValue {
  readonly config: MidnightChainConfig;
  readonly setNetworkId: (networkId: NetworkId) => void;
  readonly setIndexerUrl: (indexerUrl: string) => void;
  readonly setIndexerWsUrl: (indexerWsUrl: string) => void;
  readonly setNodeUrl: (nodeUrl: string) => void;
  readonly setProofServerUrl: (proofServerUrl: string) => void;
}
/** Generic wallet configuration remains independent of vault deployment. */
export interface EVMChainConfigContextValue {
  readonly config: EvmChainConfig;
  readonly caip2Id: string | null;
  readonly setNetwork: (network: EvmNetwork) => void;
  readonly setChainId: (chainId: bigint | null) => void;
  readonly setRpcUrl: (rpcUrl: string) => void;
  readonly setExplorerUrl: (explorerUrl: string) => void;
}
/** Deployment edits preserve the independent caller identity. */
export interface ERC20VaultConfigContextValue {
  readonly config: ERC20VaultConfig;
  readonly setContractAddress: (address: string) => void;
  readonly setSignetContractAddress: (address: string) => void;
  readonly setMpcPubkey: (pubkeyHex: string) => void;
}
interface RuntimeConfigurationContextValue {
  owner: RuntimeConfiguration;
  applied: RuntimeSnapshot;
}
const RuntimeConfigContext = createContext<RuntimeConfigurationContextValue | null>(null);

/**
 * @param root0 - Provider content and optional injected configuration.
 * @param root0.children - Consumers sharing one transaction owner.
 * @param root0.initialConfiguration - Explicit configuration for an isolated provider lifetime.
 * @returns Context backed by immutable external-store snapshots.
 */
export function RuntimeConfigProvider({
  children,
  initialConfiguration,
}: {
  children: ReactNode;
  initialConfiguration?: RuntimeConfig;
}): JSX.Element {
  const [owner] = useState(() => createRuntimeConfiguration(initialConfiguration));
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot);
  return (
    <RuntimeConfigContext.Provider value={{ owner, ...state }}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}
/**
 * @returns The shared owner and currently applied snapshot.
 * @throws {Error} If the configuration provider is absent.
 */
export function useRuntimeConfiguration(): RuntimeConfigurationContextValue {
  const context = useContext(RuntimeConfigContext);
  if (!context) throw new Error("useRuntimeConfiguration requires RuntimeConfigProvider.");
  return context;
}
function applyWithFeedback(action: () => void): void {
  try {
    action();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Invalid configuration.");
  }
}
/**
 * @returns Applied Midnight values and immediate atomic setters with shared feedback.
 */
export function useMidnightChainConfig(): MidnightChainConfigContextValue {
  const { applied, owner } = useRuntimeConfiguration();
  return {
    config: applied.midnight,
    setNetworkId: (value) => {
      applyWithFeedback(() => {
        owner.setMidnight("networkId", value);
      });
    },
    setIndexerUrl: (value) => {
      applyWithFeedback(() => {
        owner.setMidnight("indexerUrl", value);
      });
    },
    setIndexerWsUrl: (value) => {
      applyWithFeedback(() => {
        owner.setMidnight("indexerWsUrl", value);
      });
    },
    setNodeUrl: (value) => {
      applyWithFeedback(() => {
        owner.setMidnight("nodeUrl", value);
      });
    },
    setProofServerUrl: (value) => {
      applyWithFeedback(() => {
        owner.setMidnight("proofServerUrl", value);
      });
    },
  };
}
/**
 * @returns Applied EVM values, nullable CAIP-2 identity and immediate setters.
 */
export function useEVMChainConfig(): EVMChainConfigContextValue {
  const { applied, owner } = useRuntimeConfiguration();
  return {
    config: applied.evm,
    caip2Id: applied.evm.chainId === null ? null : `eip155:${applied.evm.chainId.toString()}`,
    setNetwork: (value) => {
      applyWithFeedback(() => {
        owner.setEvm("network", value);
      });
    },
    setChainId: (value) => {
      applyWithFeedback(() => {
        owner.setEvm("chainId", value);
      });
    },
    setRpcUrl: (value) => {
      applyWithFeedback(() => {
        owner.setEvm("rpcUrl", value);
      });
    },
    setExplorerUrl: (value) => {
      applyWithFeedback(() => {
        owner.setEvm("explorerUrl", value);
      });
    },
  };
}
/**
 * @returns Applied vault deployment values and immediate binding-invalidating setters.
 */
export function useERC20VaultConfig(): ERC20VaultConfigContextValue {
  const { applied, owner } = useRuntimeConfiguration();
  return {
    config: applied.vault,
    setContractAddress: (value) => {
      applyWithFeedback(() => {
        owner.setVault("contractAddress", value);
      });
    },
    setSignetContractAddress: (value) => {
      applyWithFeedback(() => {
        owner.setVault("signetContractAddress", value);
      });
    },
    setMpcPubkey: (value) => {
      applyWithFeedback(() => {
        owner.setVault("mpcPubkey", value);
      });
    },
  };
}
