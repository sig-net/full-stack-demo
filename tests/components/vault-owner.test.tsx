import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import * as vault from "@/lib/midnight/vault";
import * as assembly from "@/lib/midnight/vault-providers";
import { SeedWallet } from "@/lib/midnight/wallet/SeedWallet";
import { MidnightWalletProvider, useMidnightConnection } from "@/providers/midnight-wallet-context";
import { RuntimeConfigProvider } from "@/providers/runtime-config-context";
import { useVault, VaultProvider } from "@/providers/vault-context";

import { createVaultFixture } from "../sdk/vault-fixture";

vi.mock(import("@/lib/midnight/vault-providers"), { spy: true });
vi.mock(import("@/lib/midnight/vault"), { spy: true });
afterEach(cleanup);

it("reconciles wallet and identity replacements through the mounted effect event", async () => {
  const fixture = await createVaultFixture();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", fixture.environment.contractAddress);
  vi.stubEnv(
    "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
    fixture.environment.signetContractAddress,
  );
  vi.stubEnv("NEXT_PUBLIC_MPC_SECP256K1_PUBKEY", fixture.environment.mpcSecpPub);
  vi.mocked(assembly.joinVault).mockResolvedValue(fixture.contract);
  vi.mocked(vault.syncPathRendering).mockResolvedValue("utf8");
  vi.spyOn(SeedWallet.prototype, "initialise").mockResolvedValue(undefined);
  const query = new QueryClient();
  const mounted = renderHook(() => ({ vault: useVault(), connection: useMidnightConnection() }), {
    wrapper: ({ children }) => (
      <StrictMode>
        <QueryClientProvider client={query}>
          <RuntimeConfigProvider>
            <MidnightWalletProvider>
              <VaultProvider>{children}</VaultProvider>
            </MidnightWalletProvider>
          </RuntimeConfigProvider>
        </QueryClientProvider>
      </StrictMode>
    ),
  });
  try {
    expect(mounted.result.current.vault.status).toBe("disconnected");
    for (const value of ["", "zz".repeat(32), "01"])
      expect(() => {
        mounted.result.current.vault.setIdentitySecret(value);
      }).toThrow("32-byte");
    act(() => {
      mounted.result.current.vault.setIdentitySecret(` 0X${"06".repeat(32)} `);
    });
    expect(assembly.joinVault).not.toHaveBeenCalled();
    await act(async () => {
      await mounted.result.current.connection.installSeedWallet("07".repeat(32));
    });
    await waitFor(() => {
      expect(mounted.result.current.vault.status).toBe("ready");
    });
    const first = mounted.result.current.vault.requireBinding();
    expect(first.identity.secretKey).toEqual(new Uint8Array(32).fill(6));
    expect(
      JSON.stringify(
        query
          .getQueryCache()
          .getAll()
          .map((entry) => entry.queryKey),
      ),
    ).not.toContain("06".repeat(32));
    const publicDispose = vi.spyOn(first.providers.publicDataProvider, "dispose");
    act(() => {
      mounted.result.current.vault.setIdentitySecret("08".repeat(32));
    });
    expect(first.assertActive).toThrow("superseded");
    expect(mounted.result.current.vault.binding).toBeNull();
    await waitFor(() => {
      expect(mounted.result.current.vault.status).toBe("ready");
    });
    const second = mounted.result.current.vault.requireBinding();
    expect(second).not.toBe(first);
    expect(second.identity.secretKey).toEqual(new Uint8Array(32).fill(8));
    expect(publicDispose).not.toHaveBeenCalled();
    expect(first.identity.secretKey.every((byte) => byte === 0)).toBe(true);
    const previousWallet = mounted.result.current.connection.wallet;
    await act(async () => {
      await mounted.result.current.connection.installSeedWallet("09".repeat(32));
    });
    expect(second.assertActive).toThrow("superseded");
    await waitFor(() => {
      expect(mounted.result.current.vault.status).toBe("ready");
    });
    const third = mounted.result.current.vault.requireBinding();
    expect(third).not.toBe(second);
    expect(third.identity.secretKey).toEqual(new Uint8Array(32).fill(8));
    expect(mounted.result.current.connection.wallet).not.toBe(previousWallet);
    const connected = mounted.result.current.connection.wallet;
    act(() => {
      mounted.result.current.vault.clearIdentity();
    });
    await waitFor(() => {
      expect(mounted.result.current.vault.status).toBe("missing-identity");
    });
    expect(mounted.result.current.connection.wallet).toBe(connected);
    expect(mounted.result.current.vault.binding).toBeNull();
    expect(
      query
        .getQueryCache()
        .findAll({ queryKey: ["vault-binding"] })
        .filter((entry) => entry.queryKey[1] !== "disabled"),
    ).toHaveLength(0);
  } finally {
    mounted.unmount();
    query.clear();
    fixture.providers.privateStateProvider.dispose();
    await fixture.providers.publicDataProvider.dispose();
  }
});
