import { expect, it, vi } from "vitest";

import { discoverBrowserWallets } from "@/lib/evm/wallet/BrowserWallet";

import { browserWalletFixture } from "../evm/browser-wallet-fixture";

it("discovers late EIP6963 announcements and removes its exact listener", () => {
  const f = browserWalletFixture();
  const publish = vi.fn<Parameters<typeof discoverBrowserWallets>[0]>();
  const added = vi.spyOn(window, "addEventListener");
  const removed = vi.spyOn(window, "removeEventListener");
  const stop = discoverBrowserWallets(publish);
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: { info: { uuid: "a", name: "Fixture" }, provider: f.provider },
    }),
  );
  expect(publish).toHaveBeenLastCalledWith([
    { id: "a", name: "Fixture", iconUrl: undefined, provider: f.provider },
  ]);
  const listener = added.mock.calls.find(([name]) => name === "eip6963:announceProvider");
  expect(listener).toBeDefined();
  stop();
  expect(removed).toHaveBeenCalledWith("eip6963:announceProvider", listener?.[1]);
  publish.mockClear();
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: { info: { uuid: "b", name: "Late" }, provider: f.provider },
    }),
  );
  expect(publish).not.toHaveBeenCalled();
  f.wallet.disconnect();
});
