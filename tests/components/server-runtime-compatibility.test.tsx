import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useServerRuntimeCompatibility } from "@/hooks/use-server-runtime-compatibility";
import {
  createRuntimeConfigDto,
  getRuntimeDefaults,
  runtimeFingerprint,
} from "@/lib/config/runtime";

const state = vi.hoisted((): { current: unknown; snapshot: ReturnType<typeof vi.fn> } => ({
  current: {},
  snapshot: vi.fn(),
}));
vi.mock("@/providers/runtime-config-context", () => ({
  useRuntimeConfiguration: () => state.current,
}));

beforeEach(() => {
  const config = getRuntimeDefaults("stagenet");
  const applied = { ...config, fingerprint: runtimeFingerprint(config) };
  state.snapshot.mockReturnValue({ applied });
  state.current = { applied, owner: { getSnapshot: state.snapshot } };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        config: createRuntimeConfigDto(config),
        fingerprint: applied.fingerprint,
      }),
    ),
  );
});
afterEach(cleanup);

function renderCompatibility() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const hook = renderHook(useServerRuntimeCompatibility, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { client, ...hook };
}

it("allows a matching configuration and rejects a captured header action after owner replacement", async () => {
  const { result } = renderCompatibility();
  await waitFor(() => {
    expect(result.current.serverUnavailable).toBeNull();
  });
  const headerAction = result.current.requireServerHeaders;
  expect(headerAction()).toHaveProperty("x-vault-configuration");
  const config = getRuntimeDefaults("undeployed");
  state.snapshot.mockReturnValue({
    applied: { ...config, fingerprint: runtimeFingerprint(config) },
  });
  expect(() => headerAction()).toThrow(/changed/);
});

it("rejects a captured header action after a failed refetch despite retained cached data", async () => {
  const { result } = renderCompatibility();
  await waitFor(() => {
    expect(result.current.serverUnavailable).toBeNull();
  });
  const headerAction = result.current.requireServerHeaders;
  vi.mocked(fetch).mockRejectedValue(new Error("Server unavailable"));
  await act(async () => {
    await result.current.server.refetch();
  });
  expect(result.current.server.data).toBeDefined();
  expect(() => headerAction()).toThrow(/unavailable/i);
});

it("reports Signet mismatch but excludes explorer presentation changes", async () => {
  const config = getRuntimeDefaults("stagenet");
  const changed = {
    ...config,
    evm: { ...config.evm, explorerUrl: "https://explorer.example.invalid" },
  };
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({
      config: createRuntimeConfigDto(changed),
      fingerprint: runtimeFingerprint(changed),
    }),
  );
  const { result } = renderCompatibility();
  await waitFor(() => {
    expect(result.current.serverUnavailable).toBeNull();
  });
  const different = {
    ...changed,
    vault: { ...changed.vault, signetContractAddress: "ef".repeat(32) },
  };
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({
      config: createRuntimeConfigDto(different),
      fingerprint: runtimeFingerprint(different),
    }),
  );
  await act(async () => {
    await result.current.server.refetch();
  });
  await waitFor(() => {
    expect(result.current.differences).toEqual(["Signet contract address"]);
  });
  expect(() => result.current.requireServerHeaders()).toThrow(/differ/);
});
