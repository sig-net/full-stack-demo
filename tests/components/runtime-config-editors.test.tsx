import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";

import { useRuntimeConfigSections } from "@/hooks/use-runtime-config-sections";
import { MidnightWalletProvider } from "@/providers/midnight-wallet-context";
import { RuntimeConfigProvider, useRuntimeConfiguration } from "@/providers/runtime-config-context";

import {
  mockMatchingRuntimeServer,
  testRuntimeConfiguration,
} from "../config/runtime-server-fixture";

afterEach(cleanup);
function fixture() {
  vi.stubGlobal("indexedDB", new IDBFactory());
  mockMatchingRuntimeServer();
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hook = renderHook(
    () => ({
      first: useRuntimeConfigSections(),
      second: useRuntimeConfigSections(),
      runtime: useRuntimeConfiguration(),
    }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={query}>
          <RuntimeConfigProvider initialConfiguration={testRuntimeConfiguration()}>
            <MidnightWalletProvider>{children}</MidnightWalletProvider>
          </RuntimeConfigProvider>
        </QueryClientProvider>
      ),
    },
  );
  return {
    ...hook,
    query,
    close: (): void => {
      hook.unmount();
      query.clear();
    },
  };
}
it("keeps two drafts independent and rejects an Apply superseded by the other editor", () => {
  const hook = fixture();
  try {
    act(() => {
      hook.result.current.first.edit("nodeUrl", "http://localhost:7777");
    });
    act(() => {
      hook.result.current.second.edit("rpcUrl", "http://localhost:9999");
    });
    act(() => {
      hook.result.current.second.edit("chainId", "11155111");
    });
    act(() => {
      expect(hook.result.current.second.apply()).toBe(true);
    });
    act(() => {
      expect(hook.result.current.first.apply()).toBe(false);
    });
    expect(hook.result.current.first.failure).toMatch(/changed while editing/);
    expect(
      hook.result.current.first.sections
        .flatMap((section) => section.fields)
        .find((field) => field.key === "nodeUrl")?.value,
    ).toBe("http://localhost:7777");
    expect(hook.result.current.runtime.applied.midnight.nodeUrl).not.toBe("http://localhost:7777");
    act(() => {
      hook.result.current.first.discard();
    });
    expect(hook.result.current.first.pending).toBe(false);
    expect(
      hook.result.current.first.sections
        .flatMap((section) => section.fields)
        .find((field) => field.key === "rpcUrl")?.value,
    ).toBe("http://localhost:9999");
  } finally {
    hook.close();
  }
});
it("applies direct owner setters independently and retains drafts across direct-setter supersession", () => {
  const hook = fixture();
  try {
    act(() => {
      hook.result.current.first.edit("contractAddress", "ef".repeat(32));
    });
    act(() => {
      hook.result.current.runtime.owner.setMidnight(
        "indexerUrl",
        "http://localhost:7070/api/v4/graphql",
      );
    });
    expect(hook.result.current.runtime.applied.midnight.indexerWsUrl).toBe(
      "ws://localhost:7070/api/v4/graphql/ws",
    );
    act(() => {
      expect(hook.result.current.first.apply()).toBe(false);
    });
    act(() => {
      hook.result.current.runtime.owner.setEvm("chainId", null);
    });
    expect(hook.result.current.runtime.applied.evm.chainId).toBeNull();
    expect(hook.result.current.runtime.applied.evm.rpcUrl).toBe("");
    act(() => {
      hook.result.current.runtime.owner.setVault("signetContractAddress", "ee".repeat(32));
    });
    expect(hook.result.current.runtime.applied.vault.signetContractAddress).toBe("ee".repeat(32));
  } finally {
    hook.close();
  }
});

it("discovers local chain IDs and discards discovery from a replaced RPC", async () => {
  const hook = fixture();
  const pending = Promise.withResolvers<Response>();
  let pendingStarted = false;
  const rpc = vi.fn<typeof fetch>((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.replace(/\/$/, "") === "http://localhost:9998") {
      pendingStarted = true;
      return pending.promise;
    }
    return Promise.resolve(Response.json({ jsonrpc: "2.0", id: 1, result: "0x7a69" }));
  });
  vi.stubGlobal("fetch", rpc);
  try {
    act(() => {
      hook.result.current.first.edit("rpcUrl", "http://localhost:9998");
    });
    await waitFor(() => {
      expect(pendingStarted).toBe(true);
    });
    act(() => {
      hook.result.current.first.edit("rpcUrl", "http://localhost:9997");
    });
    await waitFor(() => {
      expect(
        hook.result.current.first.sections
          .flatMap((section) => section.fields)
          .find((field) => field.key === "chainId")?.value,
      ).toBe("31337");
    });
    pending.resolve(Response.json({ jsonrpc: "2.0", id: 1, result: "0xaa36a7" }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      expect(hook.result.current.first.apply()).toBe(true);
    });
    expect(hook.result.current.runtime.applied.evm.chainId).toBe(31337n);
    expect(hook.result.current.runtime.applied.evm.rpcUrl).toBe("http://localhost:9997");
  } finally {
    hook.close();
  }
});

it("applies an independent Midnight edit when local chain discovery fails", async () => {
  const hook = fixture();
  try {
    act(() => {
      hook.result.current.first.edit("rpcUrl", "http://localhost:9996");
    });
    await waitFor(() => {
      expect(
        hook.result.current.first.sections
          .flatMap((section) => section.fields)
          .find((field) => field.key === "chainId")?.error,
      ).toMatch(/discovery failed/);
    });
    act(() => {
      hook.result.current.first.edit("nodeUrl", "http://localhost:7777");
    });
    act(() => {
      expect(hook.result.current.first.apply()).toBe(true);
    });
    expect(hook.result.current.runtime.applied.midnight.nodeUrl).toBe("http://localhost:7777");
    expect(hook.result.current.runtime.applied.readiness.evm.status).toBe("unavailable");
  } finally {
    hook.close();
  }
});
