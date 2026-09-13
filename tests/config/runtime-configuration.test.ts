import { describe, expect, it } from "vitest";

import {
  createRuntimeConfiguration,
  type RuntimeDefaults,
  type RuntimeFields,
} from "@/lib/config/runtime";

const defaults: RuntimeDefaults = {
  fields: {
    contractAddress: "ab".repeat(32),
    mpcSecpPub: "0x024eef776e4f257d68983e45b340c2e9546c5df95447900b6aadfec68fb46fdee2",
    networkId: "undeployed",
    indexerUrl: "http://127.0.0.1:8088/api/v3/graphql",
    indexerWsUrl: "ws://127.0.0.1:8088/api/v3/graphql/ws",
    nodeUrl: "http://127.0.0.1:9944",
    proofServerUrl: "http://127.0.0.1:6300",
    chainId: "11155111",
    rpcUrl: "http://127.0.0.1:8545",
    explorerUrl: "",
  },
  signetContractAddress: "cd".repeat(32),
};

function createOwner(): ReturnType<typeof createRuntimeConfiguration> {
  return createRuntimeConfiguration(defaults);
}

describe("runtime configuration ownership", () => {
  it("keeps applied snapshots immutable while draft edits remain unapplied", () => {
    const owner = createOwner();
    const initial = owner.getSnapshot();
    owner.edit("rpcUrl", "https://rpc.example.invalid");

    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.applied)).toBe(true);
    expect(owner.getSnapshot().draft.rpcUrl).toBe("https://rpc.example.invalid");
    expect(owner.getSnapshot().applied.fields.rpcUrl).toBe(defaults.fields.rpcUrl);
  });

  it("rejects invalid drafts and applies valid edits with synchronous scope invalidation", () => {
    const owner = createOwner();
    const invalidations: ReadonlySet<"evm" | "midnight" | "vault">[] = [];
    owner.onInvalidate((scopes) => invalidations.push(scopes));

    owner.edit("rpcUrl", "not a URL");
    expect(owner.apply()).toBe(false);
    expect(owner.getSnapshot().errors.rpcUrl).toMatch(/absolute URL/);
    expect(invalidations).toHaveLength(0);

    owner.edit("rpcUrl", "https://rpc.example.invalid");
    expect(owner.apply()).toBe(true);
    expect(owner.getSnapshot().applied.fields.rpcUrl).toBe("https://rpc.example.invalid");
    expect(invalidations).toHaveLength(1);
    const scopes = invalidations[0];
    expect(scopes).toBeDefined();
    if (scopes === undefined) throw new Error("Expected invalidation scopes");
    expect([...scopes]).toEqual(["evm", "vault"]);
  });

  it("keeps presentation-only explorer edits out of the operational fingerprint and scopes", () => {
    const owner = createOwner();
    const initial = owner.getSnapshot().applied;
    const invalidations: ReadonlySet<"evm" | "midnight" | "vault">[] = [];
    owner.onInvalidate((scopes) => invalidations.push(scopes));

    owner.edit("explorerUrl", "http://localhost:9999");
    expect(owner.apply()).toBe(true);
    expect(owner.getSnapshot().applied.fingerprint).toBe(initial.fingerprint);
    expect(invalidations).toHaveLength(1);
    expect(invalidations[0]?.size).toBe(0);
  });

  it("supports discard and reset without retaining draft values", () => {
    const owner = createOwner();
    owner.edit("rpcUrl", "https://rpc.example.invalid");
    owner.discard();
    expect(owner.getSnapshot().draft.rpcUrl).toBe(defaults.fields.rpcUrl);

    owner.edit("rpcUrl", "https://rpc.example.invalid");
    expect(owner.apply()).toBe(true);
    expect(owner.reset()).toBe(true);
    expect(owner.getSnapshot().applied.fields.rpcUrl).toBe(defaults.fields.rpcUrl);
    expect(owner.getSnapshot().errors).toEqual({});
  });

  it("validates deployment identity and endpoint protocol fields", () => {
    const owner = createOwner();
    const invalid: [keyof RuntimeFields, string][] = [
      ["chainId", "1"],
      ["networkId", "stagenet"],
      ["indexerWsUrl", "https://subscriptions.example.invalid"],
      ["contractAddress", "bad"],
      ["mpcSecpPub", "not hex"],
    ];

    for (const [key, value] of invalid) {
      owner.edit(key, value);
      expect(owner.apply()).toBe(false);
      expect(owner.getSnapshot().errors[key]).toBeTruthy();
      owner.discard();
    }
  });
});
