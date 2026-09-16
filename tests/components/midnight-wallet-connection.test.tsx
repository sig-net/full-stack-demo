// @vitest-environment node
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { JSDOM } from "jsdom";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { MidnightWalletButton } from "@/components/midnight-wallet-button";
import { WalletMenu } from "@/components/wallet-menu";
import { getRuntimeDefaults, NETWORK_DEFAULTS } from "@/lib/config/runtime";
import * as seedlib from "@/lib/midnight/seedlib";
import { SeedWallet } from "@/lib/midnight/wallet/SeedWallet";
import type { Wallet, WalletAddressSnapshot } from "@/lib/midnight/wallet/Wallet";
import { MINIMUM_MIDNIGHT_DUST } from "@/lib/wallet-funding";
import { ConfigurationProvider } from "@/providers/configuration-context";
import {
  MidnightReadinessProvider,
  useMidnightReadiness,
} from "@/providers/midnight-readiness-context";
import { MidnightWalletProvider, useMidnightConnection } from "@/providers/midnight-wallet-context";
import * as vault from "@/providers/vault-context";

import { testRuntimeConfiguration } from "../config/runtime-server-fixture";
import { createSeedWalletFixture } from "../sdk/seed-wallet-fixture";

vi.mock(import("@/lib/midnight/wallet/SeedWallet"), { spy: true });
vi.mock(import("@/lib/midnight/seedlib"), { spy: true });
vi.mock(import("@/components/wallet-menu"), { spy: true });

let dom: JSDOM;
beforeEach(() => {
  vi.mocked(SeedWallet.prototype).initialise.mockReset();
  vi.mocked(seedlib.initialiseWalletFacade).mockReset();
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  cleanup();
  dom.window.close();
});

it.each(["synced", "funded", "failed"] as const)(
  "publishes addresses before SDK startup while readiness stays unavailable until %s",
  async (settlement) => {
    const fixture = await createSeedWalletFixture();
    const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(
      () => ({ connection: useMidnightConnection(), readiness: useMidnightReadiness() }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={query}>
            <ConfigurationProvider initialConfiguration={getRuntimeDefaults("undeployed")}>
              <MidnightWalletProvider>
                <MidnightReadinessProvider>{children}</MidnightReadinessProvider>
              </MidnightWalletProvider>
            </ConfigurationProvider>
          </QueryClientProvider>
        ),
      },
    );
    let pending: Promise<Wallet | null> | undefined;
    act(() => {
      pending = result.current.connection.installSeedWallet("07".repeat(32)).catch(() => null);
    });
    await waitFor(() => {
      expect(result.current.connection.addresses?.dustAddress).toBeTruthy();
    });
    const addresses = result.current.connection.addresses;
    expect(addresses?.shieldedAddress).toBeTruthy();
    expect(addresses?.unshieldedAddress).toBeTruthy();
    expect(result.current.connection.wallet).toBeNull();
    expect(result.current.readiness.ready).toBe(false);
    expect(result.current.readiness.balances.fetchStatus).toBe("idle");
    const dustRead = vi.spyOn(SeedWallet.prototype, "getDustBalance");
    if (settlement === "funded") dustRead.mockResolvedValue(MINIMUM_MIDNIGHT_DUST);
    else dustRead.mockRejectedValue(new Error("balance unavailable"));
    await act(async () => {
      fixture.construction.resolve(fixture.facade);
      await fixture.startEntered.promise;
      fixture.starting.resolve(undefined);
      await fixture.subscribed.promise;
    });
    expect(result.current.connection.addresses).toEqual(addresses);
    expect(result.current.connection.wallet).toBeNull();
    expect(dustRead).not.toHaveBeenCalled();
    await act(async () => {
      if (settlement === "failed") fixture.states.error(new Error("sync failed"));
      else {
        vi.spyOn(fixture.state, "isSynced", "get").mockReturnValue(true);
        fixture.states.next(fixture.state);
      }
      await pending;
    });
    const failed = settlement === "failed";
    expect(result.current.connection.addresses).toEqual(failed ? null : addresses);
    expect(result.current.connection.wallet === null).toBe(failed);
    expect(result.current.connection.error).toBe(failed ? "sync failed" : null);
    await waitFor(() => {
      expect(result.current.readiness.balances.isError).toBe(settlement === "synced");
      expect(result.current.readiness.balances.isSuccess).toBe(settlement === "funded");
    });
    expect(result.current.readiness.ready).toBe(settlement === "funded");
    unmount();
    query.clear();
    await waitFor(() => {
      expect(fixture.stop).toHaveBeenCalledTimes(1);
    });
  },
);

it.each(["resolve", "reject"] as const)(
  "keeps the current wallet after an obsolete connection's late %s",
  async (settlement) => {
    const configuration = NETWORK_DEFAULTS.midnight.undeployed;
    const builds: {
      wallet: SeedWallet;
      ready: PromiseWithResolvers<undefined>;
      progress: ((status: string) => void) | undefined;
      addresses: ((snapshot: WalletAddressSnapshot) => void) | undefined;
    }[] = [];
    vi.spyOn(SeedWallet.prototype, "initialise").mockImplementation(function (
      this: SeedWallet,
      progress,
      addresses,
    ) {
      const ready = Promise.withResolvers<undefined>();
      builds.push({ wallet: this, ready, progress, addresses });
      return ready.promise;
    });
    const stops = vi.spyOn(SeedWallet.prototype, "disconnect");
    const deletion = vi.spyOn(indexedDB, "deleteDatabase");
    const { result, unmount } = renderHook(useMidnightConnection, {
      wrapper: ({ children }) => (
        <ConfigurationProvider initialConfiguration={getRuntimeDefaults("undeployed")}>
          <MidnightWalletProvider>{children}</MidnightWalletProvider>
        </ConfigurationProvider>
      ),
    });
    const begin = (seed: string): Promise<Wallet> => {
      let promise: Promise<Wallet> | undefined;
      act(() => {
        promise = result.current.installSeedWallet(seed);
      });
      if (!promise) throw new Error("Connection did not return a promise");
      return promise;
    };
    expect(result.current.wallet).toBeNull();
    expect(result.current.connecting).toBe(false);
    expect(builds).toHaveLength(0);
    expect(deletion).toHaveBeenCalledWith("midnight-wallet-cache");
    const initial = result.current.getGeneration();
    const first = begin("07".repeat(32));
    const obsolete = first.catch(() => null);
    expect(result.current.getGeneration()).toBeGreaterThan(initial);
    const firstGeneration = result.current.getGeneration();
    expect(begin(`0x${"07".repeat(32)}`)).toBe(first);
    await waitFor(() => {
      expect(builds).toHaveLength(1);
    });
    act(() => {
      builds[0]?.addresses?.({ networkId: configuration.networkId, shieldedAddress: "first" });
    });
    expect(result.current.addresses?.shieldedAddress).toBe("first");
    expect(result.current.wallet).toBeNull();
    expect(result.current.connecting).toBe(true);
    const second = begin("08".repeat(32));
    expect(result.current.addresses).toBeNull();
    expect(result.current.getGeneration()).toBeGreaterThan(firstGeneration);
    await waitFor(() => {
      expect(builds).toHaveLength(2);
    });
    const previous = builds[0];
    const current = builds[1];
    if (!previous || !current) throw new Error("Expected both connection generations");
    expect(stops.mock.contexts).toContain(previous.wallet);
    await act(async () => {
      current.addresses?.({ networkId: configuration.networkId, shieldedAddress: "current" });
      current.ready.resolve(undefined);
      await second;
    });
    await act(async () => {
      if (settlement === "resolve") previous.ready.resolve(undefined);
      else previous.ready.reject(new Error("late connection failure"));
      await obsolete;
    });
    expect(result.current.wallet).toBe(current.wallet);
    expect(result.current.connecting).toBe(false);
    act(() => {
      previous.progress?.("obsolete");
      previous.addresses?.({ networkId: configuration.networkId, shieldedAddress: "obsolete" });
    });
    expect(result.current.syncStatus).not.toBe("obsolete");
    expect(result.current.addresses?.shieldedAddress).toBe("current");
    let rebuilding: Promise<Wallet> | undefined;
    act(() => {
      rebuilding = result.current.rebuild();
    });
    if (!rebuilding) throw new Error("Expected recovery promise");
    const rebuilt = rebuilding.catch(() => null);
    await waitFor(() => {
      expect(builds).toHaveLength(3);
    });
    const recovery = builds[2];
    if (!recovery) throw new Error("Expected recovery wallet");
    expect(vi.mocked(SeedWallet).mock.calls[2]?.[1]).toBe("08".repeat(32));
    expect(stops.mock.contexts).toContain(current.wallet);
    expect(result.current.addresses).toBeNull();
    act(() => {
      recovery.addresses?.({ networkId: configuration.networkId, shieldedAddress: "recovery" });
      current.addresses?.({
        networkId: configuration.networkId,
        shieldedAddress: "obsolete same seed",
      });
    });
    expect(result.current.addresses?.shieldedAddress).toBe("recovery");
    const recoveryGeneration = result.current.getGeneration();
    act(() => {
      result.current.disconnect();
    });
    expect(result.current.getGeneration()).toBeGreaterThan(recoveryGeneration);
    await act(async () => {
      recovery.ready.resolve(undefined);
      await rebuilt;
    });
    await expect(rebuilding).rejects.toThrow("superseded");
    expect(result.current.wallet).toBeNull();
    expect(result.current.addresses).toBeNull();
    await expect(result.current.rebuild()).rejects.toThrow("Connect");
    unmount();
    const fresh = renderHook(useMidnightConnection, {
      wrapper: ({ children }) => (
        <ConfigurationProvider initialConfiguration={getRuntimeDefaults("undeployed")}>
          <MidnightWalletProvider>{children}</MidnightWalletProvider>
        </ConfigurationProvider>
      ),
    });
    expect(fresh.result.current.wallet).toBeNull();
    act(() => {
      recovery.addresses?.({ networkId: configuration.networkId, shieldedAddress: "late" });
    });
    expect(fresh.result.current.addresses).toBeNull();
    const before = builds.length;
    await act(async () => {
      await expect(fresh.result.current.installSeedWallet("not a seed")).rejects.toThrow(
        "hexadecimal",
      );
    });
    expect(builds).toHaveLength(before);
  },
);

it.each(["construction", "start", "sync"] as const)(
  "replaces an actual SeedWallet during %s without publishing its late state",
  async (phase) => {
    const previous = await createSeedWalletFixture("07".repeat(32));
    const current = await createSeedWalletFixture("08".repeat(32));
    vi.spyOn(current.state, "isSynced", "get").mockReturnValue(true);
    const { result } = renderHook(useMidnightConnection, {
      wrapper: ({ children }) => (
        <ConfigurationProvider initialConfiguration={getRuntimeDefaults("undeployed")}>
          <MidnightWalletProvider>{children}</MidnightWalletProvider>
        </ConfigurationProvider>
      ),
    });
    let obsolete: Promise<Wallet | null> | undefined;
    act(() => {
      obsolete = result.current.installSeedWallet("07".repeat(32)).catch(() => null);
    });
    await waitFor(() => {
      expect({
        calls: vi.mocked(seedlib.initialiseWalletFacade).mock.calls.length,
        error: result.current.error,
      }).toStrictEqual({ calls: 1, error: null });
    });
    if (phase !== "construction") {
      previous.construction.resolve(previous.facade);
      await previous.startEntered.promise;
    }
    if (phase === "sync") {
      previous.starting.resolve(undefined);
      await previous.subscribed.promise;
    }
    let pending: Promise<Wallet> | undefined;
    act(() => {
      pending = result.current.installSeedWallet("08".repeat(32));
    });
    await act(async () => {
      current.construction.resolve(current.facade);
      await current.startEntered.promise;
      current.starting.resolve(undefined);
      await current.subscribed.promise;
      current.states.next(current.state);
      await pending;
    });
    const published = result.current.wallet;
    expect(published).not.toBeNull();
    await act(async () => {
      previous.construction.resolve(previous.facade);
      previous.starting.resolve(undefined);
      await obsolete;
    });
    expect(result.current.wallet).toBe(published);
    expect(previous.stop).toHaveBeenCalledTimes(1);
    expect(previous.states.observed).toBe(false);
    await act(async () => {
      result.current.disconnect();
      await published?.disconnect();
    });
    expect(current.stop).toHaveBeenCalledTimes(1);
    expect(current.states.observed).toBe(false);
  },
);

it("unmounts a pending wallet button without reporting its delayed rejection as a toast", async () => {
  vi.spyOn(vault, "useVault").mockReturnValue({
    status: "disconnected",
    error: null,
    binding: null,
    requireBinding: () => {
      throw new Error("fixture has no binding");
    },
    retry: () => undefined,
    rebuild: () => Promise.reject(new Error("fixture has no binding")),
    disconnect: () => undefined,
  });
  vi.mocked(WalletMenu).mockImplementation(({ installSeed }) => (
    <button
      onClick={() => {
        installSeed("07".repeat(32));
      }}
    >
      Install seed
    </button>
  ));
  const ready = Promise.withResolvers<undefined>();
  const initialise = vi.spyOn(SeedWallet.prototype, "initialise").mockReturnValue(ready.promise);
  const error = vi.spyOn(toast, "error");
  const view = render(
    <ConfigurationProvider initialConfiguration={testRuntimeConfiguration()}>
      <MidnightWalletProvider>
        <MidnightWalletButton />
      </MidnightWalletProvider>
    </ConfigurationProvider>,
  );
  fireEvent.click(view.getByRole("button", { name: "Install seed" }));
  await waitFor(() => {
    expect(initialise).toHaveBeenCalledTimes(1);
  });
  view.unmount();
  await act(async () => {
    ready.reject(new Error("cancelled"));
    await ready.promise.catch(() => undefined);
  });
  expect(error).not.toHaveBeenCalled();
});
