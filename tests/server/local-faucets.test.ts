import { addressFromKey, signatureVerifyingKey } from "@midnightntwrk/ledger-v9";
import { MidnightBech32m, UnshieldedAddress } from "@midnightntwrk/wallet-sdk-address-format";
import type * as MidnightContractDeploy from "@sig-net/midnight-contract-deploy";
import * as deployment from "@sig-net/midnight-contract-deploy";
import { NextRequest } from "next/server";
import { createPublicClient, encodeAbiParameters, type Hex, http, keccak256, toHex } from "viem";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";

import { POST as fundErc20 } from "@/app/api/evm/erc20-faucet/route";
import { POST as fundEth } from "@/app/api/evm/eth-faucet/route";
import { POST as fundNight } from "@/app/api/midnight/night-faucet/route";
import * as localFaucet from "@/lib/config/local-faucet-server";
import { createMidnightChainConfig } from "@/lib/config/midnight";
import * as tokens from "@/lib/constants/token-metadata";
import * as rpc from "@/lib/rpc";
import { LOCAL_EVM_ETH_TARGET, LOCAL_NIGHT_GRANT } from "@/lib/wallet-funding";

const deploymentControls = vi.hoisted(() => ({
  assertRootFunded: vi.fn(),
  close: vi.fn(),
  transferNight: vi.fn(),
  wallet: vi.fn(),
}));

vi.mock("@sig-net/midnight-contract-deploy", async (importOriginal) => ({
  ...(await importOriginal<typeof MidnightContractDeploy>()),
  WalletRegistry: class {
    close = deploymentControls.close;
    wallet = deploymentControls.wallet;
  },
  assertRootFunded: deploymentControls.assertRootFunded,
  transferNight: deploymentControls.transferNight,
}));

const recipient: Hex = `0x${"12".repeat(20)}`;
const token: Hex = `0x${"34".repeat(20)}`;

function request(pathname: string, body: object): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") throw new Error("Faucet request body must be JSON text.");
  return JSON.parse(init.body) as unknown;
}

function configuration(): ReturnType<typeof localFaucet.getLocalFaucetConfiguration> {
  vi.stubEnv("NODE_ENV", "development");
  return localFaucet.getLocalFaucetConfiguration();
}

beforeEach(() => {
  vi.restoreAllMocks();
  deploymentControls.assertRootFunded.mockReset();
  deploymentControls.close.mockReset();
  deploymentControls.transferNight.mockReset();
  deploymentControls.wallet.mockReset();
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it("funds an ETH deficit, preserves a richer balance and refuses an unverified endpoint", async () => {
  let balance = 1n;
  const client = createPublicClient({ transport: http("http://127.0.0.1:8545") });
  vi.spyOn(client, "getBalance").mockImplementation(() => Promise.resolve(balance));
  vi.spyOn(rpc, "getEthereumProvider").mockReturnValue(client);
  const setBalance = vi.fn<typeof fetch>((_input, init) => {
    const body = z
      .object({
        method: z.literal("anvil_setBalance"),
        params: z.tuple([z.string(), z.string()]),
      })
      .parse(jsonBody(init));
    balance = BigInt(body.params[1]);
    return Promise.resolve(Response.json({ result: true }));
  });
  vi.stubGlobal("fetch", setBalance);
  vi.spyOn(localFaucet, "requireLocalEvmFaucetConfiguration").mockResolvedValue(configuration());

  expect((await fundEth(request("/api/evm/eth-faucet", { address: recipient }))).status).toBe(200);
  expect(balance).toBe(LOCAL_EVM_ETH_TARGET);
  expect(setBalance).toHaveBeenCalledTimes(1);

  balance = LOCAL_EVM_ETH_TARGET * 2n;
  expect((await fundEth(request("/api/evm/eth-faucet", { address: recipient }))).status).toBe(200);
  expect(balance).toBe(LOCAL_EVM_ETH_TARGET * 2n);
  expect(setBalance).toHaveBeenCalledTimes(1);

  vi.mocked(localFaucet.requireLocalEvmFaucetConfiguration).mockRejectedValueOnce(
    new Error("Local faucet RPC must serve an Anvil instance."),
  );
  expect((await fundEth(request("/api/evm/eth-faucet", { address: recipient }))).status).toBe(403);
  expect(setBalance).toHaveBeenCalledTimes(1);
});

it("uses ERC-20 decimals, restores each probe and serialises concurrent storage writes", async () => {
  const location = keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [recipient, 0n]),
  );
  const storage = new Map<Hex, Hex>();
  const target = 100n * 10n ** 6n;
  const client = createPublicClient({ transport: http("http://127.0.0.1:8545") });
  vi.spyOn(client, "readContract").mockImplementation(() =>
    Promise.resolve(BigInt(storage.get(location) ?? toHex(0n, { size: 32 }))),
  );
  vi.spyOn(client, "getStorageAt").mockImplementation(({ slot }) =>
    Promise.resolve(storage.get(slot) ?? toHex(0n, { size: 32 })),
  );
  vi.spyOn(rpc, "getEthereumProvider").mockReturnValue(client);
  vi.spyOn(tokens, "fetchErc20Decimals").mockResolvedValue(6);
  vi.spyOn(localFaucet, "requireLocalEvmFaucetConfiguration").mockResolvedValue(configuration());
  let concurrentWrites = 0;
  let maximumConcurrentWrites = 0;
  const writes: Hex[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((_input, init) => {
      const body = z
        .object({
          method: z.literal("anvil_setStorageAt"),
          params: z.tuple([z.string(), z.string(), z.string()]),
        })
        .parse(jsonBody(init));
      concurrentWrites++;
      maximumConcurrentWrites = Math.max(maximumConcurrentWrites, concurrentWrites);
      writes.push(body.params[2] as Hex);
      storage.set(body.params[1] as Hex, body.params[2] as Hex);
      return Promise.resolve().then(() => {
        concurrentWrites--;
        return Response.json({ result: true });
      });
    }),
  );

  const responses = await Promise.all([
    fundErc20(request("/api/evm/erc20-faucet", { address: recipient, tokenAddress: token })),
    fundErc20(request("/api/evm/erc20-faucet", { address: recipient, tokenAddress: token })),
  ]);
  expect(responses.map((response) => response.status)).toStrictEqual([200, 200]);
  expect(maximumConcurrentWrites).toBe(1);
  expect(writes).toContain(toHex(target + 1n, { size: 32 }));
  expect(writes).toContain(toHex(0n, { size: 32 }));
  expect(storage.get(location)).toBe(toHex(target, { size: 32 }));
});

it("grants the fixed NIGHT amount through the canonical genesis wallet without registration", async () => {
  const midnight = createMidnightChainConfig({});
  const publicKey = signatureVerifyingKey({ tag: "schnorr", value: "01".repeat(32) });
  const address = MidnightBech32m.encode(
    "undeployed",
    new UnshieldedAddress(Buffer.from(addressFromKey(publicKey), "hex")),
  ).toString();
  const facade = { waitForSyncedState: vi.fn().mockResolvedValue({}) };
  const keys = {};
  deploymentControls.wallet.mockResolvedValue({
    label: "local faucet root",
    keys,
    facade,
  });
  deploymentControls.close.mockResolvedValue(undefined);
  deploymentControls.assertRootFunded.mockResolvedValue({
    addresses: deployment.deriveWalletAddresses(deployment.GENESIS_MINT_WALLET_SEED, midnight),
    night: LOCAL_NIGHT_GRANT,
    dust: 10_000_000_000_000_000n,
  });
  deploymentControls.transferNight.mockResolvedValue("night-transfer");
  vi.spyOn(localFaucet, "requireLocalMidnightFaucetConfiguration").mockResolvedValue(
    configuration(),
  );
  const response = await fundNight(request("/api/midnight/night-faucet", { address }));
  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({
    hash: "night-transfer",
    night: LOCAL_NIGHT_GRANT.toString(),
  });
  expect(deploymentControls.assertRootFunded).toHaveBeenCalledWith(
    expect.any(deployment.WalletRegistry),
    deployment.GENESIS_MINT_WALLET_SEED,
    undefined,
  );
  expect(deploymentControls.wallet).toHaveBeenCalledWith(
    deployment.GENESIS_MINT_WALLET_SEED,
    "local faucet root",
  );
  expect(deploymentControls.transferNight).toHaveBeenCalledWith(
    facade,
    keys,
    expect.anything(),
    address,
    "undeployed",
    LOCAL_NIGHT_GRANT,
  );
  expect(deploymentControls.close).toHaveBeenCalledTimes(1);
});
