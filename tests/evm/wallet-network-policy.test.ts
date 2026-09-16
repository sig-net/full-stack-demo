import { afterEach, expect, it, vi } from "vitest";

import { type EvmChainConfig, NETWORK_DEFAULTS } from "@/lib/config/runtime";
import { browserWalletConnection, seedWalletConnection } from "@/lib/evm/wallet/connections";

import { browserWalletFixture } from "./browser-wallet-fixture";

afterEach(() => vi.restoreAllMocks());

it.each(["sepolia", "mainnet"] as const)(
  "connects both %s adapters without requesting the app RPC chain ID",
  async (network) => {
    const config = NETWORK_DEFAULTS.evm[network];
    const f = browserWalletFixture();
    f.controls.chain = network === "mainnet" ? "0x1" : "0xaa36a7";
    const browser = browserWalletConnection(f.wallet.choice, config).create(vi.fn());
    const seed = seedWalletConnection("07".repeat(32), config).create(vi.fn());
    for (const wallet of [browser, seed]) {
      const probe = vi
        .spyOn(wallet.publicClient, "getChainId")
        .mockRejectedValue(new Error("HTTP 400"));
      await expect(wallet.connect()).resolves.toBeUndefined();
      await expect(wallet.verify()).resolves.toBeUndefined();
      expect(probe).not.toHaveBeenCalled();
      wallet.disconnect();
    }
    expect(f.calls).toContain("eth_chainId");
    f.wallet.disconnect();
  },
);

it.each(["local", "override"] as const)(
  "rejects a wrong RPC chain for %s connections",
  async (mode) => {
    const config: EvmChainConfig =
      mode === "local"
        ? { ...NETWORK_DEFAULTS.evm.local, chainId: 31337n }
        : { ...NETWORK_DEFAULTS.evm.sepolia, chainId: 31337n };
    const f = browserWalletFixture();
    f.controls.chain = "0x7a69";
    const browser = browserWalletConnection(f.wallet.choice, config).create(vi.fn());
    const seed = seedWalletConnection("07".repeat(32), config).create(vi.fn());
    for (const wallet of [browser, seed]) {
      const probe = vi.spyOn(wallet.publicClient, "getChainId").mockResolvedValue(1);
      await expect(wallet.connect()).rejects.toThrow(/chain/);
      expect(probe).toHaveBeenCalledOnce();
      wallet.disconnect();
    }
    f.wallet.disconnect();
  },
);

it("rejects extension chain mismatch even when public RPC discovery is disabled", async () => {
  const f = browserWalletFixture();
  f.controls.chain = "0x1";
  f.controls.refuseSwitch = true;
  const wallet = browserWalletConnection(f.wallet.choice, NETWORK_DEFAULTS.evm.sepolia).create(
    vi.fn(),
  );
  const probe = vi
    .spyOn(wallet.publicClient, "getChainId")
    .mockRejectedValue(new Error("HTTP 400"));
  await expect(wallet.connect()).rejects.toThrow(/rejected/);
  expect(probe).not.toHaveBeenCalled();
  wallet.disconnect();
  f.wallet.disconnect();
});
