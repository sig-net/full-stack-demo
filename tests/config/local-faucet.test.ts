import { afterEach, expect, it, vi } from "vitest";

import { isExactLocalFaucetConfiguration } from "@/lib/config/local-faucet";
import {
  getLocalFaucetConfiguration,
  requireLocalEvmFaucetConfiguration,
  requireLocalMidnightFaucetConfiguration,
} from "@/lib/config/local-faucet-server";
import { validateRuntimeConfig } from "@/lib/config/runtime";

import { LOCAL_FAUCET_DESCRIPTOR_FIXTURE } from "./local-faucet-fixture";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function localRuntime() {
  return validateRuntimeConfig({
    midnight: LOCAL_FAUCET_DESCRIPTOR_FIXTURE.midnight,
    evm: {
      network: "local",
      chainId: 11155111n,
      rpcUrl: LOCAL_FAUCET_DESCRIPTOR_FIXTURE.evm.rpcUrl,
      explorerUrl: "",
    },
    vault: { contractAddress: "", signetContractAddress: "", mpcPubkey: "" },
  });
}

it("uses fixed local network identities and accepts server endpoint overrides", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("LOCAL_FAUCET_EVM_RPC_URL", "http://localhost:9545");
  vi.stubEnv("LOCAL_FAUCET_MIDNIGHT_NODE_URL", "http://localhost:9944");
  const configuration = getLocalFaucetConfiguration();
  expect(configuration.descriptor).toMatchObject({
    available: true,
    midnight: { networkId: "undeployed", nodeUrl: "http://localhost:9944" },
    evm: { chainId: "11155111", rpcUrl: "http://localhost:9545" },
  });
});

it("rejects non-loopback server endpoint overrides", () => {
  vi.stubEnv("LOCAL_FAUCET_EVM_RPC_URL", "https://rpc.example.invalid");
  expect(() => getLocalFaucetConfiguration()).toThrow(/loopback/);
});

it("requires exact local client endpoints while ignoring vault presentation inputs", () => {
  const runtime = localRuntime();
  expect(isExactLocalFaucetConfiguration(runtime, LOCAL_FAUCET_DESCRIPTOR_FIXTURE)).toBe(true);
  expect(
    isExactLocalFaucetConfiguration(
      { ...runtime, evm: { ...runtime.evm, rpcUrl: "http://localhost:8545" } },
      LOCAL_FAUCET_DESCRIPTOR_FIXTURE,
    ),
  ).toBe(false);
  expect(
    isExactLocalFaucetConfiguration(
      {
        ...runtime,
        vault: { contractAddress: "aa".repeat(32), signetContractAddress: "", mpcPubkey: "" },
      },
      LOCAL_FAUCET_DESCRIPTOR_FIXTURE,
    ),
  ).toBe(true);
});

it("rejects production, a public chain response and a non-local Midnight chain", async () => {
  vi.stubEnv("NODE_ENV", "production");
  await expect(requireLocalEvmFaucetConfiguration()).rejects.toThrow(/development server/);
  vi.stubEnv("NODE_ENV", "development");
  let evmRequests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => {
      const body = evmRequests++ === 0 ? { result: "0xaa36a7" } : { result: {} };
      return Promise.resolve(Response.json(body));
    }),
  );
  await expect(requireLocalEvmFaucetConfiguration()).rejects.toThrow();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(Response.json({ result: "preview" })),
  );
  await expect(requireLocalMidnightFaucetConfiguration()).rejects.toThrow(/undeployed Midnight/);
});
