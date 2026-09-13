// @vitest-environment node
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { JSDOM } from "jsdom";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { MidnightWalletButton } from "@/components/midnight-wallet-button";
import { WalletMenu } from "@/components/wallet-menu";
import { createMidnightChainConfig } from "@/lib/config/midnight";
import * as seedlib from "@/lib/midnight/seedlib";
import { SeedWallet } from "@/lib/midnight/wallet/SeedWallet";
import type { Wallet } from "@/lib/midnight/wallet/Wallet";
import { MidnightWalletProvider, useMidnightConnection } from "@/providers/midnight-wallet-context";
import * as vault from "@/providers/vault-context";

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

it.each(["resolve", "reject"] as const)(
  "keeps the current wallet after an obsolete connection's late %s",
  async (settlement) => {
    const configuration = createMidnightChainConfig({});
    const builds: {
      wallet: SeedWallet;
      ready: PromiseWithResolvers<undefined>;
      progress: ((status: string) => void) | undefined;
    }[] = [];
    vi.spyOn(SeedWallet.prototype, "initialise").mockImplementation(function (
      this: SeedWallet,
      progress,
    ) {
      const ready = Promise.withResolvers<undefined>();
      builds.push({ wallet: this, ready, progress });
      return ready.promise;
    });
    const stops = vi.spyOn(SeedWallet.prototype, "disconnect");
    const deletion = vi.spyOn(indexedDB, "deleteDatabase");
    const { result, unmount } = renderHook(useMidnightConnection, {
      wrapper: ({ children }) => (
        <MidnightWalletProvider configuration={configuration}>{children}</MidnightWalletProvider>
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
    const second = begin("08".repeat(32));
    expect(result.current.getGeneration()).toBeGreaterThan(firstGeneration);
    await waitFor(() => {
      expect(builds).toHaveLength(2);
    });
    const previous = builds[0];
    const current = builds[1];
    if (!previous || !current) throw new Error("Expected both connection generations");
    expect(stops.mock.contexts).toContain(previous.wallet);
    await act(async () => {
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
    });
    expect(result.current.syncStatus).not.toBe("obsolete");
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
    await expect(result.current.rebuild()).rejects.toThrow("Connect");
    unmount();
    const fresh = renderHook(useMidnightConnection, {
      wrapper: ({ children }) => (
        <MidnightWalletProvider configuration={configuration}>{children}</MidnightWalletProvider>
      ),
    });
    expect(fresh.result.current.wallet).toBeNull();
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
    const configuration = createMidnightChainConfig({});
    const { result } = renderHook(useMidnightConnection, {
      wrapper: ({ children }) => (
        <MidnightWalletProvider configuration={configuration}>{children}</MidnightWalletProvider>
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
    <MidnightWalletProvider configuration={createMidnightChainConfig({})}>
      <MidnightWalletButton />
    </MidnightWalletProvider>,
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
