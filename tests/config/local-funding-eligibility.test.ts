import { formatDust } from "@sig-net/midnight-contract-deploy";
import { beforeEach, expect, it, vi } from "vitest";

import { requireLocalDemo } from "@/lib/config/local-demo";
import { isLoopbackEndpoint } from "@/lib/config/loopback-endpoint";
import {
  hasLocalEvmFunds,
  hasMidnightFees,
  MINIMUM_EVM_ETH,
  MINIMUM_MIDNIGHT_DUST,
} from "@/lib/wallet-funding";

import { configureLocalDemo } from "./local-demo-fixture";

beforeEach(configureLocalDemo);

it("verifies Anvil instance and marker and rejects every ineligible deployment", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ result: { instanceId: "fixture-instance" } }))
    .mockResolvedValueOnce(Response.json({ result: "0x1234" }));
  vi.stubGlobal("fetch", fetch);
  await requireLocalDemo();
  expect(fetch).toHaveBeenCalledTimes(2);
  const rejected = [
    ["NODE_ENV", "production"],
    ["NEXT_PUBLIC_MIDNIGHT_NETWORK_ID", "stagenet"],
    ["NEXT_PUBLIC_SEPOLIA_RPC_URL", "https://example.com"],
    ["NEXT_PUBLIC_MIDNIGHT_NODE_URL", "http://127.0.0.1.example.com"],
    ["LOCAL_ANVIL_INSTANCE_ID", "another-instance"],
    ["NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE", "0x9999"],
  ] as const;
  expect(rejected.length).toBeGreaterThan(0);
  for (const [name, value] of rejected) {
    configureLocalDemo();
    vi.stubEnv(name, value);
    fetch
      .mockReset()
      .mockResolvedValueOnce(Response.json({ result: { instanceId: "fixture-instance" } }))
      .mockResolvedValueOnce(Response.json({ result: "0x1234" }));
    await expect(requireLocalDemo()).rejects.toThrow();
  }
  configureLocalDemo();
  fetch
    .mockReset()
    .mockResolvedValueOnce(Response.json({ result: { instanceId: "fixture-instance" } }))
    .mockResolvedValueOnce(Response.json({ result: "0x1234" }));
  await expect(requireLocalDemo()).resolves.toHaveProperty("evm.rpcUrl", "http://127.0.0.1:8545");
});

it("rejects deceptive loopback URLs and credentials", () => {
  for (const url of ["http://localhost:8545", "ws://127.0.0.1:9944", "http://[::1]:8088"])
    expect(isLoopbackEndpoint(url)).toBe(true);
  for (const url of ["http://localhost.example.com", "http://user@localhost", "file:///tmp/rpc"])
    expect(isLoopbackEndpoint(url)).toBe(false);
});

it("requires known sufficient balances using actual token decimals and DUST units", () => {
  expect(formatDust(1000000000000000n)).toBe("1");
  expect(formatDust(MINIMUM_MIDNIGHT_DUST)).toBe("10");
  expect(MINIMUM_MIDNIGHT_DUST).toBe(10000000000000000n);
  for (const value of [undefined, 0n, 905585091299361n, MINIMUM_MIDNIGHT_DUST - 1n])
    expect(hasMidnightFees(value)).toBe(false);
  expect(hasMidnightFees(MINIMUM_MIDNIGHT_DUST)).toBe(true);
  expect(hasLocalEvmFunds(MINIMUM_EVM_ETH, 10n ** 8n, 8)).toBe(true);
  for (const [eth, token, decimals] of [
    [undefined, 10n ** 8n, 8],
    [MINIMUM_EVM_ETH - 1n, 10n ** 8n, 8],
    [MINIMUM_EVM_ETH, 10n ** 8n - 1n, 8],
  ] as const)
    expect(hasLocalEvmFunds(eth, token, decimals)).toBe(false);
});
