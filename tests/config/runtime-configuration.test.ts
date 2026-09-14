import { MidnightNetwork } from "@sig-net/midnight";
import { describe, expect, it, vi } from "vitest";

import { createEvmChainConfig } from "@/lib/config/evm";
import { createMidnightChainConfig } from "@/lib/config/midnight";
import {
  createRuntimeConfigDto,
  createRuntimeConfiguration,
  getRuntimeDefaults,
  runtimeConfigurationSchema,
  runtimeFingerprint,
  validateRuntimeConfig,
} from "@/lib/config/runtime";

function complete() {
  return {
    midnight: createMidnightChainConfig({}),
    evm: createEvmChainConfig(undefined),
    vault: {
      contractAddress: "ab".repeat(32),
      signetContractAddress: "cd".repeat(32),
      mpcPubkey: "0x024eef776e4f257d68983e45b340c2e9546c5df95447900b6aadfec68fb46fdee2",
    },
  };
}

describe("nested runtime configuration", () => {
  it("starts with local EVM discovery defaults and an unbound Midnight deployment", () => {
    const config = getRuntimeDefaults("undeployed");
    expect(config).toEqual({
      midnight: {
        networkId: "undeployed",
        indexerUrl: "",
        indexerWsUrl: "",
        nodeUrl: "",
        proofServerUrl: "http://127.0.0.1:6300",
      },
      evm: { network: "local", chainId: null, rpcUrl: "http://127.0.0.1:8545", explorerUrl: "" },
      vault: { contractAddress: "", signetContractAddress: "", mpcPubkey: "" },
    });
    expect(createRuntimeConfiguration(config).getSnapshot().applied.readiness.vault.status).toBe(
      "unavailable",
    );
  });
  it.each(Object.values(MidnightNetwork))(
    "resolves every network %s with matching v4 endpoints",
    (network) => {
      const config = getRuntimeDefaults(network);
      expect(config.midnight.networkId).toBe(network);
      expect(config.midnight.proofServerUrl).toBe("http://127.0.0.1:6300");
      expect(config.midnight.indexerUrl.includes("/api/v4/graphql")).toBe(
        network !== MidnightNetwork.Undeployed,
      );
      expect(config.midnight.indexerWsUrl).toBe(
        network === MidnightNetwork.Undeployed
          ? ""
          : config.midnight.indexerUrl.replace("https:", "wss:") + "/ws",
      );
      expect(config.evm.chainId).toBe(
        network === MidnightNetwork.Undeployed
          ? null
          : network === MidnightNetwork.Mainnet
            ? 1n
            : 11155111n,
      );
    },
  );
  it("resets all sections on network changes, restores defaults on return and ignores same-network selection", () => {
    const owner = createRuntimeConfiguration(complete());
    owner.setMidnight("networkId", "stagenet");
    owner.setVault("contractAddress", "aa".repeat(32));
    const selected = owner.getSnapshot();
    owner.setMidnight("networkId", "stagenet");
    expect(owner.getSnapshot()).toBe(selected);
    owner.setMidnight("networkId", "preview");
    owner.setMidnight("networkId", "stagenet");
    expect(owner.getSnapshot().applied.vault).toEqual(getRuntimeDefaults("stagenet").vault);
    owner.setVault("contractAddress", "aa".repeat(32));
    owner.reset();
    expect(owner.getSnapshot().applied.vault).toEqual(getRuntimeDefaults("stagenet").vault);
  });
  it("validates before invalidation and publishes once after affected owners invalidate", () => {
    const owner = createRuntimeConfiguration(complete());
    const initial = owner.getSnapshot();
    const events: string[] = [];
    owner.onInvalidate((scopes) => {
      expect(owner.getSnapshot()).toBe(initial);
      events.push([...scopes].join(","));
    });
    owner.subscribe(() => events.push("published"));
    expect(() => {
      owner.setEvm("rpcUrl", "invalid");
    }).toThrow();
    expect(events).toEqual([]);
    owner.setEvm("rpcUrl", "https://example.invalid");
    expect(events).toEqual(["evm,vault", "published"]);
    expect(Object.isFrozen(owner.getSnapshot().applied.evm)).toBe(true);
  });
  it("keeps explorer changes out of operational fingerprints and preserves no-ops", () => {
    const owner = createRuntimeConfiguration(complete());
    const initial = owner.getSnapshot();
    const invalidated = vi.fn();
    owner.onInvalidate(invalidated);
    owner.setEvm("rpcUrl", initial.applied.evm.rpcUrl);
    expect(owner.getSnapshot()).toBe(initial);
    expect(invalidated).not.toHaveBeenCalled();
    owner.setEvm("explorerUrl", "http://localhost:9999");
    expect(owner.getSnapshot().applied.fingerprint).toBe(initial.applied.fingerprint);
    expect(invalidated.mock.calls[0]?.[0]).toEqual(new Set());
  });
  it("pairs HTTP and WebSocket edits atomically and accepts clearing", () => {
    const owner = createRuntimeConfiguration(complete());
    owner.setMidnight("indexerWsUrl", "wss://override.invalid/ws");
    owner.setMidnight("indexerUrl", "https://replacement.invalid/api/v4/graphql");
    expect(owner.getSnapshot().applied.midnight.indexerWsUrl).toBe(
      "wss://replacement.invalid/api/v4/graphql/ws",
    );
    owner.setMidnight("indexerUrl", "");
    expect(owner.getSnapshot().applied.midnight.indexerWsUrl).toBe("");
    expect(owner.getSnapshot().applied.readiness.midnight.status).toBe("unavailable");
  });
  it("handles known, unknown, unset and unrepresentable chains without activating unsupported vaults", () => {
    const owner = createRuntimeConfiguration(complete());
    owner.setEvm("chainId", 1n);
    expect(owner.getSnapshot().applied.evm.rpcUrl).toContain("http");
    expect(owner.getSnapshot().applied.readiness.vault.status).toBe("unavailable");
    const known = owner.getSnapshot().applied.evm;
    owner.setEvm("chainId", 987654321n);
    expect(owner.getSnapshot().applied.evm.rpcUrl).toBe(known.rpcUrl);
    owner.setEvm("chainId", BigInt(Number.MAX_SAFE_INTEGER) + 1n);
    expect(owner.getSnapshot().applied.readiness.evm.status).toBe("unavailable");
    owner.setEvm("chainId", null);
    expect(owner.getSnapshot().applied.evm).toEqual({
      network: "local",
      chainId: null,
      rpcUrl: "",
      explorerUrl: "",
    });
  });
  it("couples explicit EVM selections once and preserves compatible Midnight testnets", () => {
    const owner = createRuntimeConfiguration(complete());
    owner.setEvm("network", "sepolia");
    expect(owner.getSnapshot().applied.midnight.networkId).toBe("stagenet");
    owner.setMidnight("networkId", "preview");
    owner.setEvm("network", "sepolia");
    expect(owner.getSnapshot().applied.midnight.networkId).toBe("preview");
    owner.setEvm("network", "mainnet");
    expect(owner.getSnapshot().applied.midnight.networkId).toBe("mainnet");
    expect(owner.getSnapshot().applied.evm.chainId).toBe(1n);
    owner.setEvm("rpcUrl", "https://override.invalid");
    expect(owner.getSnapshot().applied.midnight.networkId).toBe("mainnet");
    expect(owner.getSnapshot().applied.evm.rpcUrl).toBe("https://override.invalid");
    owner.setEvm("network", "local");
    expect(owner.getSnapshot().applied.midnight.networkId).toBe("undeployed");
    expect(owner.getSnapshot().applied.evm.chainId).toBeNull();
  });
  it("normalises contract addresses and public keys and protects stale editor revisions", () => {
    const owner = createRuntimeConfiguration(complete());
    const initial = owner.getSnapshot().applied;
    owner.setVault("contractAddress", "0x" + "AB".repeat(32));
    expect(owner.getSnapshot().applied.vault.contractAddress).toBe("ab".repeat(32));
    owner.setVault("mpcPubkey", complete().vault.mpcPubkey.slice(2));
    expect(owner.getSnapshot().applied.fingerprint).toBe(initial.fingerprint);
    owner.setVault("signetContractAddress", "ee".repeat(32));
    expect(() => {
      owner.applyConfiguration(initial, initial.revision);
    }).toThrow(/changed while editing/);
    expect(() => {
      owner.setVault("mpcPubkey", "02" + "00".repeat(32));
    }).toThrow();
  });
  it("round trips canonical bigint DTOs and excludes presentation from attestation", () => {
    const config = validateRuntimeConfig(complete());
    expect(runtimeConfigurationSchema.parse(createRuntimeConfigDto(config))).toEqual(config);
    expect(
      runtimeFingerprint({ ...config, evm: { ...config.evm, explorerUrl: "http://localhost:90" } }),
    ).toBe(runtimeFingerprint(config));
    expect(
      runtimeFingerprint({
        ...config,
        vault: { ...config.vault, signetContractAddress: "aa".repeat(32) },
      }),
    ).not.toBe(runtimeFingerprint(config));
  });
});
