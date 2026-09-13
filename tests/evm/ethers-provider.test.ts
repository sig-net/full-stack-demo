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
