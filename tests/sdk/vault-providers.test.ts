import * as compiledContract from "@midnight-ntwrk/compact-js/effect/CompiledContract";
import * as contracts from "@midnight-ntwrk/midnight-js/contracts";
import * as network from "@midnight-ntwrk/midnight-js/network-id";
import { createProverKey } from "@midnight-ntwrk/midnight-js/types";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import * as indexer from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { expect, it, vi } from "vitest";

import { deriveIndexerWsUrl, type MidnightNodeConfig } from "@/lib/config/runtime";
import * as seedlib from "@/lib/midnight/seedlib";
import { SeedWallet } from "@/lib/midnight/wallet/SeedWallet";
import {
  SIGNET_ZK_MANIFEST_SHA256,
  VAULT_ZK_MANIFEST_SHA256,
} from "@/lib/midnight/zk-manifest-hashes";

vi.mock(import("@midnight-ntwrk/midnight-js/network-id"), { spy: true });
vi.mock(import("@midnight-ntwrk/compact-js/effect/CompiledContract"), { spy: true });
vi.mock(import("@midnight-ntwrk/midnight-js/contracts"), { spy: true });
vi.mock(import("@midnight-ntwrk/midnight-js-indexer-public-data-provider"), { spy: true });
vi.mock(import("@midnight-ntwrk/midnight-js-fetch-zk-config-provider"), { spy: true });
vi.mock(import("@/lib/midnight/seedlib"), { spy: true });

it("captures provider origins and shares or evicts the bounded prover-key request", async () => {
  vi.stubGlobal("window", globalThis);
  const networkWrite = vi.mocked(network.setNetworkId);
  const compiledAssets = vi.mocked(compiledContract.withCompiledFileAssets);
  const proof = vi.mocked(seedlib.createCrossContractProofServerProvider);
  const key = createProverKey(new Uint8Array([1]));
  const keyRead = vi.spyOn(FetchZkConfigProvider.prototype, "getProverKey").mockResolvedValue(key);
  const { buildVaultProviders, joinVault } = await import("@/lib/midnight/vault-providers");
  expect(networkWrite).not.toHaveBeenCalled();
  expect(compiledAssets).not.toHaveBeenCalled();
  const indexerUrl = "https://indexer.example.invalid/api/v4/graphql";
  const configuration: MidnightNodeConfig = {
    networkId: "stagenet",
    indexerUrl,
    indexerWsUrl: deriveIndexerWsUrl(indexerUrl),
    nodeUrl: "wss://node.example.invalid",
    proofServerUrl: "https://proof.example.invalid",
  };
  const wallet = new SeedWallet(configuration, "07".repeat(32));
  const providers = buildVaultProviders(wallet, configuration, "https://zk.example.invalid/root");
  try {
    expect(proof).toHaveBeenCalledTimes(1);
    const proofCall = proof.mock.calls[0];
    expect(proofCall?.[0]).toBe(configuration.proofServerUrl);
    const roots = proofCall?.[1];
    expect(roots).toHaveLength(2);
    expect(roots?.[0]).toBe(providers.zkConfigProvider);
    expect(FetchZkConfigProvider).toHaveBeenCalledTimes(2);
    const origins = vi.mocked(FetchZkConfigProvider).mock.calls;
    expect(origins[0]?.[0]).toBe("https://zk.example.invalid/root");
    expect(origins[1]?.[0]).toBe("https://zk.example.invalid/root/signet");
    expect(origins[0]?.[1]?.expectedManifestHash).toBe(VAULT_ZK_MANIFEST_SHA256);
    expect(origins[1]?.[1]?.expectedManifestHash).toBe(SIGNET_ZK_MANIFEST_SHA256);
    expect(origins.map((call) => call[1]?.verify)).toEqual(["require", "require"]);
    expect(vi.mocked(indexer).indexerPublicDataProvider.mock.calls).toEqual([
      [{ queryURL: configuration.indexerUrl, subscriptionURL: configuration.indexerWsUrl }],
    ]);
    const first = providers.zkConfigProvider.getProverKey("startDeposit");
    expect(providers.zkConfigProvider.getProverKey("startDeposit")).toBe(first);
    await first;
    expect(keyRead).toHaveBeenCalledTimes(1);
    keyRead.mockRejectedValueOnce(new Error("fixture key failure"));
    await expect(providers.zkConfigProvider.getProverKey("startWithdraw")).rejects.toThrow(
      "fixture key failure",
    );
    await providers.zkConfigProvider.getProverKey("startWithdraw");
    expect(keyRead).toHaveBeenCalledTimes(3);
    const binding = vi
      .mocked(contracts.findDeployedContract)
      .mockRejectedValue(new Error("binding intercepted"));
    await expect(
      joinVault(providers, "ab".repeat(32), new Uint8Array(32), "https://zk.example.invalid/root"),
    ).rejects.toThrow("binding intercepted");
    expect(binding).toHaveBeenCalledTimes(1);
    expect(compiledAssets).toHaveBeenCalledWith("https://zk.example.invalid/root");
    expect(VAULT_ZK_MANIFEST_SHA256).toMatch(/^[a-f0-9]{64}$/);
    expect(SIGNET_ZK_MANIFEST_SHA256).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    providers.privateStateProvider.dispose();
    await providers.publicDataProvider.dispose();
  }
});
