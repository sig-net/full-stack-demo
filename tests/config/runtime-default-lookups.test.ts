import { MidnightNetwork } from "@sig-net/midnight";
import { afterEach, expect, it, vi } from "vitest";

import { createRuntimeConfiguration, getRuntimeDefaults } from "@/lib/config/runtime";

const lookups = vi.hoisted(() => ({
  vault: vi.fn<(network: string) => string>(),
  signet: vi.fn<(network: string) => string>(),
  key: vi.fn<(network: string) => string>(),
}));
vi.mock(import("@sig-net/midnight"), async (original) => ({
  ...(await original()),
  getSignetContractAddress: lookups.signet,
  getMpcRootPublicKey: lookups.key,
}));
vi.mock(import("@sig-net/midnight-examples-erc20-vault-contract"), async (original) => ({
  ...(await original()),
  getVaultContractAddress: lookups.vault,
}));
afterEach(() => vi.resetAllMocks());
function published(): void {
  lookups.vault.mockReturnValue("ab".repeat(32));
  lookups.signet.mockReturnValue("cd".repeat(32));
  lookups.key.mockReturnValue(
    "0x024eef776e4f257d68983e45b340c2e9546c5df95447900b6aadfec68fb46fdee2",
  );
}
it.each(["vault", "signet", "key"] as const)(
  "retains independent successes when %s lookup throws",
  (failed) => {
    published();
    lookups[failed].mockImplementation(() => {
      throw new Error("unpublished");
    });
    const config = getRuntimeDefaults("preview");
    expect(config.vault.contractAddress).toBe(failed === "vault" ? "" : "ab".repeat(32));
    expect(config.vault.signetContractAddress).toBe(failed === "signet" ? "" : "cd".repeat(32));
    expect(!!config.vault.mpcPubkey).toBe(failed !== "key");
    expect(config.midnight.indexerUrl).toContain("/api/v4/graphql");
  },
);
it("retains endpoints when all deployment lookups throw and detects malformed successful values", () => {
  for (const lookup of Object.values(lookups))
    lookup.mockImplementation(() => {
      throw new Error("missing");
    });
  expect(getRuntimeDefaults("mainnet").vault).toEqual({
    contractAddress: "",
    signetContractAddress: "",
    mpcPubkey: "",
  });
  published();
  lookups.vault.mockReturnValue("invalid");
  expect(() => getRuntimeDefaults("mainnet")).toThrow(/contract address/);
});
it.each(Object.values(MidnightNetwork).filter((network) => network !== MidnightNetwork.Undeployed))(
  "picks up future publication for %s on reset",
  (network) => {
    for (const lookup of Object.values(lookups))
      lookup.mockImplementation(() => {
        throw new Error("missing");
      });
    const owner = createRuntimeConfiguration(getRuntimeDefaults(network));
    published();
    owner.reset();
    expect(owner.getSnapshot().applied.vault.contractAddress).toBe("ab".repeat(32));
    expect(lookups.vault).toHaveBeenLastCalledWith(network);
    expect(lookups.signet).toHaveBeenLastCalledWith(network);
    expect(lookups.key).toHaveBeenLastCalledWith(network);
  },
);
