import { JsonRpcProvider, Network } from "ethers";
import { expect, it, vi } from "vitest";

import { resolveVaultDeployment } from "@/lib/midnight/vault";

import { createVaultFixture } from "./vault-fixture";

it("rejects a mismatching RPC before reading the vault ledger", async () => {
  const fixture = await createVaultFixture();
  vi.spyOn(JsonRpcProvider.prototype, "getNetwork").mockResolvedValue(Network.from(1));
  const ledger = vi.spyOn(fixture.providers.publicDataProvider, "queryContractState");
  try {
    await expect(resolveVaultDeployment(fixture.providers, fixture.environment)).rejects.toThrow(
      /Sepolia RPC/,
    );
    expect(ledger).not.toHaveBeenCalled();
  } finally {
    fixture.providers.privateStateProvider.dispose();
    await fixture.providers.publicDataProvider.dispose();
  }
});
it("cancels a pending deployment RPC read before it can query Midnight state", async () => {
  const fixture = await createVaultFixture();
  const pending = Promise.withResolvers<Network>();
  vi.spyOn(JsonRpcProvider.prototype, "getNetwork").mockReturnValue(pending.promise);
  const ledger = vi.spyOn(fixture.providers.publicDataProvider, "queryContractState");
  const controller = new AbortController();
  try {
    const reading = resolveVaultDeployment(
      fixture.providers,
      fixture.environment,
      controller.signal,
    );
    controller.abort(new Error("Configuration superseded"));
    await expect(reading).rejects.toThrow(/superseded/);
    pending.resolve(Network.from(11155111));
    await Promise.resolve();
    expect(ledger).not.toHaveBeenCalled();
  } finally {
    fixture.providers.privateStateProvider.dispose();
    await fixture.providers.publicDataProvider.dispose();
  }
});

it("uses the captured known public chain without RPC discovery before reading the ledger", async () => {
  const fixture = await createVaultFixture();
  const rpc = vi
    .spyOn(JsonRpcProvider.prototype, "getNetwork")
    .mockRejectedValue(new Error("Discovery unavailable"));
  const ledger = vi
    .spyOn(fixture.providers.publicDataProvider, "queryContractState")
    .mockRejectedValue(new Error("Ledger read reached"));
  try {
    await expect(
      resolveVaultDeployment(fixture.providers, { ...fixture.environment, verifyRpcChain: false }),
    ).rejects.toThrow("Ledger read reached");
    expect(rpc).not.toHaveBeenCalled();
    expect(ledger).toHaveBeenCalled();
  } finally {
    fixture.providers.privateStateProvider.dispose();
    await fixture.providers.publicDataProvider.dispose();
  }
});
