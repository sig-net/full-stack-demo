import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

import { createMidnightChainConfig } from "@/lib/config/midnight";
import * as vault from "@/lib/midnight/vault";
import * as assembly from "@/lib/midnight/vault-providers";
import { createVaultSession } from "@/lib/midnight/vault-session";

import { createVaultFixture } from "./vault-fixture";

vi.mock(import("@/lib/midnight/vault-providers"), { spy: true });
vi.mock(import("@/lib/midnight/vault"), { spy: true });

beforeEach(() => {
  vi.mocked(assembly.buildVaultProviders).mockReset();
  vi.mocked(assembly.joinVault).mockReset();
  vi.mocked(vault.syncPathRendering).mockReset();
});

it("guards a complete SDK binding and disposes its raw resources exactly once", async () => {
  const fixture = await createVaultFixture();
  const publicDispose = vi.spyOn(fixture.providers.publicDataProvider, "dispose");
  const privateDispose = vi.spyOn(fixture.providers.privateStateProvider, "dispose");
  vi.mocked(assembly.buildVaultProviders).mockReturnValue(fixture.providers);
  vi.mocked(assembly.joinVault).mockResolvedValue(fixture.contract);
  vi.mocked(vault.syncPathRendering).mockResolvedValue("utf8");
  const query = new QueryClient();
  let current = true;
  const session = createVaultSession({
    wallet: fixture.wallet,
    secret: fixture.identity.secretKey,
    configuration: createMidnightChainConfig({}),
    environment: fixture.environment,
    zkOrigin: "https://zk.example.invalid",
    isCurrent: () => current,
  });
  try {
    const binding = await query.fetchQuery(session.options);
    expect(Object.keys(binding.contract.callTx)).toEqual(Object.keys(fixture.contract.callTx));
    expect(Object.keys(binding.contract.callTx).length).toBeGreaterThan(0);
    expect(binding.sessionId).toBe(session.id);
    expect(binding.providers).not.toBe(fixture.providers);
    expect(binding.identity.secretKey).not.toBe(fixture.identity.secretKey);
    await expect(binding.providers.privateStateProvider.get("erc20-vault")).resolves.not.toBeNull();
    current = false;
    expect(binding.assertActive).toThrow("superseded");
    expect(() => binding.providers.privateStateProvider.get("erc20-vault")).toThrow("superseded");
    session.dispose();
    session.dispose();
    expect(publicDispose).toHaveBeenCalledTimes(1);
    expect(privateDispose).toHaveBeenCalledTimes(1);
    expect(binding.identity.secretKey.every((byte) => byte === 0)).toBe(true);
    expect(fixture.identity.secretKey.some((byte) => byte !== 0)).toBe(true);
  } finally {
    session.dispose();
    query.clear();
  }
});

it("rejects successful reads that finish after session replacement", async () => {
  const fixture = await createVaultFixture();
  vi.mocked(assembly.buildVaultProviders).mockReturnValue(fixture.providers);
  vi.mocked(assembly.joinVault).mockResolvedValue(fixture.contract);
  vi.mocked(vault.syncPathRendering).mockResolvedValue("utf8");
  const query = new QueryClient();
  let current = true;
  const session = createVaultSession({
    wallet: fixture.wallet,
    secret: fixture.identity.secretKey,
    configuration: createMidnightChainConfig({}),
    environment: fixture.environment,
    zkOrigin: "https://zk.example.invalid",
    isCurrent: () => current,
  });
  try {
    const binding = await query.fetchQuery(session.options);
    const read =
      Promise.withResolvers<
        Awaited<ReturnType<typeof fixture.providers.privateStateProvider.get>>
      >();
    const underlying = vi
      .spyOn(fixture.providers.privateStateProvider, "get")
      .mockReturnValue(read.promise);
    const pending = binding.providers.privateStateProvider.get("erc20-vault");
    expect(underlying).toHaveBeenCalledTimes(1);
    current = false;
    read.resolve(null);
    await expect(pending).rejects.toThrow("superseded");
    expect(() => binding.providers.privateStateProvider.get("erc20-vault")).toThrow("superseded");
    expect(underlying).toHaveBeenCalledTimes(1);
  } finally {
    session.dispose();
    query.clear();
  }
});

it("disposes resources while binding construction is pending and rejects the late result", async () => {
  const fixture = await createVaultFixture();
  const publicDispose = vi.spyOn(fixture.providers.publicDataProvider, "dispose");
  const privateDispose = vi.spyOn(fixture.providers.privateStateProvider, "dispose");
  vi.mocked(assembly.buildVaultProviders).mockReturnValue(fixture.providers);
  const joined = Promise.withResolvers<typeof fixture.contract>();
  const entered = Promise.withResolvers<undefined>();
  vi.mocked(assembly.joinVault).mockImplementation(() => {
    entered.resolve(undefined);
    return joined.promise;
  });
  vi.mocked(vault.syncPathRendering).mockResolvedValue("utf8");
  const query = new QueryClient();
  const session = createVaultSession({
    wallet: fixture.wallet,
    secret: fixture.identity.secretKey,
    configuration: createMidnightChainConfig({}),
    environment: fixture.environment,
    zkOrigin: "https://zk.example.invalid",
    isCurrent: () => true,
  });
  try {
    const pending = query.fetchQuery(session.options);
    await entered.promise;
    session.dispose();
    expect(publicDispose).toHaveBeenCalledTimes(1);
    expect(privateDispose).toHaveBeenCalledTimes(1);
    joined.resolve(fixture.contract);
    await expect(pending).rejects.toThrow("Vault loading failed");
    expect(vault.syncPathRendering).not.toHaveBeenCalled();
    expect(publicDispose).toHaveBeenCalledTimes(1);
    expect(privateDispose).toHaveBeenCalledTimes(1);
  } finally {
    session.dispose();
    query.clear();
  }
});
