import {
  createPublicClient,
  encodeAbiParameters,
  type Hex,
  http,
  isHex,
  keccak256,
  toHex,
} from "viem";
import { beforeEach, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/local-funding/evm/route";
import { getEvmChainConfig } from "@/lib/config/evm";
import * as local from "@/lib/config/local-demo";
import { getMidnightChainConfig } from "@/lib/config/midnight";
import * as tokens from "@/lib/constants/token-metadata";
import * as rpc from "@/lib/rpc";
import { LOCAL_EVM_ETH_TARGET } from "@/lib/wallet-funding";

import { configureLocalDemo } from "../config/local-demo-fixture";
import { attestedRequest } from "./request-fixture";

beforeEach(configureLocalDemo);

it("funds chain-decimal deficits once, serialises repeats and refuses ineligible mutations", async () => {
  const address: Hex = `0x${"12".repeat(20)}`;
  const slot = keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [address, 2n]),
  );
  const storage = new Map<Hex, Hex>();
  const controls = { eligible: true, eth: 1n, token: 0n };
  const mutate = vi
    .fn<Awaited<ReturnType<typeof local.requireLocalDemo>>["rpc"]>()
    .mockImplementation((method, params = []) => {
      if (!controls.eligible) throw new Error("Unexpected ineligible mutation");
      const first = params[1];
      if (!first) throw new Error("Missing mutation argument");
      if (method === "anvil_setBalance") controls.eth = BigInt(first);
      else if (method === "anvil_setStorageAt") {
        const value = params[2];
        if (!value || !isHex(first) || !isHex(value)) throw new Error("Invalid storage mutation");
        storage.set(first, value);
        if (first === slot) controls.token = BigInt(value);
      } else throw new Error(`Unexpected RPC ${method}`);
      return Promise.resolve(null);
    });
  vi.spyOn(local, "requireLocalDemo").mockImplementation(() => {
    if (!controls.eligible) return Promise.reject(new Error("not eligible"));
    return Promise.resolve({
      evm: getEvmChainConfig(),
      midnight: getMidnightChainConfig(),
      rpc: mutate,
    });
  });
  const client = createPublicClient({ transport: http("http://127.0.0.1:8545") });
  vi.spyOn(rpc, "getEthereumProvider").mockReturnValue(client);
  vi.spyOn(tokens, "fetchErc20Decimals").mockResolvedValue(8);
  vi.spyOn(client, "getBalance").mockImplementation(() => Promise.resolve(controls.eth));
  vi.spyOn(client, "readContract").mockImplementation(() => Promise.resolve(controls.token));
  vi.spyOn(client, "getStorageAt").mockImplementation(({ slot }) =>
    Promise.resolve(storage.get(slot) ?? toHex(0n, { size: 32 })),
  );
  const request = (): Parameters<typeof POST>[0] =>
    attestedRequest("/api/local-funding/evm", JSON.stringify({ address }));
  expect((await POST(request())).status).toBe(200);
  expect(controls.eth).toBe(LOCAL_EVM_ETH_TARGET);
  expect(controls.token).toBe(100n * 10n ** 8n);
  const writes = mutate.mock.calls.length;
  expect(writes).toBeGreaterThan(0);
  const repeated = await Promise.all([POST(request()), POST(request())]);
  expect(repeated.map((response) => response.status)).toStrictEqual([200, 200]);
  expect(mutate).toHaveBeenCalledTimes(writes);
  controls.eth *= 2n;
  controls.token *= 2n;
  expect((await POST(request())).status).toBe(200);
  expect(mutate).toHaveBeenCalledTimes(writes);
  controls.eligible = false;
  expect((await POST(request())).status).toBe(403);
  expect(mutate).toHaveBeenCalledTimes(writes);
  expect(
    (
      await POST(
        attestedRequest("/api/local-funding/evm", JSON.stringify({ address, seed: "reject" })),
      )
    ).status,
  ).toBe(400);
  await expect((await GET()).json()).resolves.toStrictEqual({ eligible: false });
  controls.eligible = true;
  await expect((await GET()).json()).resolves.toStrictEqual({ eligible: true });
});
