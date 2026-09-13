import { act, cleanup, renderHook } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";

import { MidnightWalletProvider, useMidnightConnection } from "@/providers/midnight-wallet-context";

vi.mock(import("@/lib/midnight/wallet/SeedWallet"), { spy: true });
afterEach(cleanup);

it("renders without EVM configuration and rejects invalid Midnight settings before wallet assembly", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubEnv("NEXT_PUBLIC_SEPOLIA_RPC_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_NETWORK_ID", "stagenet");
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_INDEXER_URL", undefined);
  const { result } = renderHook(useMidnightConnection, {
    wrapper: ({ children }) => <MidnightWalletProvider>{children}</MidnightWalletProvider>,
  });
  expect(result.current.wallet).toBeNull();
  await act(async () => {
    await expect(result.current.installSeedWallet("07".repeat(32))).rejects.toThrow(
      "NEXT_PUBLIC_MIDNIGHT_INDEXER_URL",
    );
  });
  expect(result.current.wallet).toBeNull();
  expect(result.current.connecting).toBe(false);
  const { SeedWallet } = await import("@/lib/midnight/wallet/SeedWallet");
  expect(SeedWallet).not.toHaveBeenCalled();
});
