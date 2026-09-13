import type { JsonRpcProvider } from "ethers";
import { expect, it, vi } from "vitest";

import { withEthersProvider } from "@/lib/evm/ethers-provider";

vi.mock("@/lib/midnight/vault", () => {
  throw new Error("EVM read helpers must load independently of the vault runner");
});

it("keeps concurrent provider lifetimes independent and destroys each after success or failure", async () => {
  const first = Promise.withResolvers<number>();
  const second = Promise.withResolvers<number>();
  const providers: JsonRpcProvider[] = [];
  const pendingFirst = withEthersProvider("https://first.example.invalid", (provider) => {
    providers.push(provider);
    expect(provider._getConnection().timeout).toBe(120000);
    expect(provider._getConnection().url).toBe("https://first.example.invalid");
    return first.promise;
  });
  const pendingSecond = withEthersProvider("https://second.example.invalid", (provider) => {
    providers.push(provider);
    return second.promise;
  });
  const failed = pendingSecond.catch((error: unknown) => error);
  expect(providers).toHaveLength(2);
  expect(providers[0]).not.toBe(providers[1]);
  expect(providers.map((provider) => provider.destroyed)).toEqual([false, false]);
  first.resolve(7);
  await expect(pendingFirst).resolves.toBe(7);
  expect(providers.map((provider) => provider.destroyed)).toEqual([true, false]);
  const error = new Error("RPC read failed");
  second.reject(error);
  await expect(failed).resolves.toBe(error);
  expect(providers.every((provider) => provider.destroyed)).toBe(true);
  for (let index = 0; index < 20; index++) {
    await withEthersProvider(`https://rpc${index.toString()}.example.invalid`, (provider) => {
      providers.push(provider);
      return Promise.resolve();
    });
  }
  expect(providers).toHaveLength(22);
  expect(providers.every((provider) => provider.destroyed)).toBe(true);
});

it("loads lending and swap reads without importing the vault runner", async () => {
  const [lending, swap] = await Promise.all([
    import("@/lib/midnight/evm-stata"),
    import("@/lib/midnight/evm-swap"),
  ]);
  expect(typeof lending.stataAvailable).toBe("function");
  expect(typeof swap.discoverSwappablePairs).toBe("function");
});

it("aborts response-body reads at the deadline and destroys the provider", async () => {
  const body = Promise.withResolvers<ArrayBuffer>();
  let aborted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => {
      const response = new Response();
      vi.spyOn(response, "arrayBuffer").mockReturnValue(body.promise);
      init.signal?.addEventListener("abort", () => {
        aborted = true;
        body.reject(init.signal?.reason);
      });
      return Promise.resolve(response);
    }),
  );
  let captured: JsonRpcProvider | undefined;
  await expect(
    withEthersProvider(
      "http://localhost:8545",
      (provider) => {
        captured = provider;
        return provider._getConnection().send();
      },
      { timeoutMs: 20 },
    ),
  ).rejects.toThrow("timed out");
  expect(aborted).toBe(true);
  expect(captured?.destroyed).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("cancels obsolete reads and destroys the provider even before their callback completes", async () => {
  const controller = new AbortController();
  const pending = Promise.withResolvers<undefined>();
  let captured: JsonRpcProvider | undefined;
  const result = withEthersProvider(
    "http://localhost:8545",
    (provider) => {
      captured = provider;
      return pending.promise;
    },
    { timeoutMs: 1000, signal: controller.signal },
  );
  controller.abort(new Error("obsolete quote"));
  await expect(result).rejects.toThrow("obsolete quote");
  expect(captured?.destroyed).toBe(true);
  pending.resolve(undefined);
});
