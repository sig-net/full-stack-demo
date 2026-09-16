import { act, cleanup, renderHook } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";

import { getRuntimeDefaults, NETWORK_DEFAULTS } from "@/lib/config/runtime";
import { ConfigurationProvider } from "@/providers/configuration-context";
import { MidnightWalletProvider, useMidnightConnection } from "@/providers/midnight-wallet-context";

vi.mock(import("@/lib/midnight/wallet/SeedWallet"), { spy: true });
afterEach(cleanup);

it("rejects incomplete Midnight settings before wallet assembly", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const configuration = {
    ...getRuntimeDefaults("stagenet"),
    midnight: { ...NETWORK_DEFAULTS.midnight.stagenet, indexerUrl: "" },
  };
  const { result } = renderHook(useMidnightConnection, {
    wrapper: ({ children }) => (
      <ConfigurationProvider initialConfiguration={configuration}>
        <MidnightWalletProvider>{children}</MidnightWalletProvider>
      </ConfigurationProvider>
    ),
  });
  expect(result.current.wallet).toBeNull();
  await act(async () => {
    await expect(result.current.installSeedWallet("07".repeat(32))).rejects.toThrow(
      "Configure Midnight indexerUrl.",
    );
  });
  expect(result.current.wallet).toBeNull();
  expect(result.current.connecting).toBe(false);
  const { SeedWallet } = await import("@/lib/midnight/wallet/SeedWallet");
  expect(SeedWallet).not.toHaveBeenCalled();
});
