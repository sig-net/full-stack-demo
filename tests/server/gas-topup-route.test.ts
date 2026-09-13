import { spawnSync } from "node:child_process";

import * as indexer from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { hexToBytes } from "@sig-net/midnight";
import * as contract from "@sig-net/midnight-examples-erc20-vault-contract";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { POST } from "@/app/api/midnight/gas-topup/route";
import { getEvmChainConfig } from "@/lib/config/evm";
import { getMidnightChainConfig, midnightIndexerConfig } from "@/lib/config/midnight";
import * as funding from "@/lib/evm/gas-topup";
import { createVaultEnvironment } from "@/lib/midnight/env";
import { derivePathAddress } from "@/lib/midnight/evm-addresses";

import { createVaultCircuitFixture } from "../sdk/vault-circuit-fixture";
import { attestedRequest } from "./request-fixture";

vi.mock("@midnight-ntwrk/midnight-js-indexer-public-data-provider", { spy: true });
vi.mock("@sig-net/midnight-examples-erc20-vault-contract", { spy: true });

let fixture: Awaited<ReturnType<typeof createVaultCircuitFixture>>;

beforeEach(async () => {
  vi.mocked(indexer).indexerPublicDataProvider.mockReset();
  vi.mocked(contract.readVaultLedger).mockReset();
  fixture = await createVaultCircuitFixture();
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_NETWORK_ID", "stagenet");
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_NODE_URL", "wss://example.invalid");
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_INDEXER_URL", "https://example.invalid/api/v4/graphql");
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", fixture.binding.environment.contractAddress);
  vi.stubEnv(
    "NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS",
    fixture.binding.environment.signetContractAddress,
  );
  vi.stubEnv("NEXT_PUBLIC_MPC_SECP256K1_PUBKEY", fixture.binding.environment.mpcSecpPub);
  vi.stubEnv("NEXT_PUBLIC_SEPOLIA_RPC_URL", "https://example.invalid");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  fixture.binding.providers.privateStateProvider.dispose();
  await fixture.binding.providers.publicDataProvider.dispose();
  await fixture.binding.wallet.disconnect();
});

function request(body: string): NextRequest {
  return attestedRequest("/api/midnight/gas-topup", body);
}

function environment(): ReturnType<typeof createVaultEnvironment> {
  return createVaultEnvironment(getMidnightChainConfig(), getEvmChainConfig());
}

it("imports the actual server route and rejects invalid JSON before ledger reads", async () => {
  const read = vi.mocked(contract.readVaultLedger);
  const valid = { operation: "withdraw", recipient: { kind: "vault" } };
  const path = "ff008061".repeat(8);
  for (const body of [
    null,
    [],
    {},
    { ...valid, operation: "transfer" },
    { ...valid, fromAddress: "0x123" },
    { ...valid, gasLimit: "9999999999" },
    { ...valid, recipient: { kind: "vault", path } },
    { operation: "deposit", recipient: { kind: "deposit", path: "ab" } },
    { operation: "deposit", recipient: { kind: "deposit", path: path.toUpperCase() } },
    { ...valid, secretKey: path },
  ]) {
    expect((await POST(request(JSON.stringify(body)))).status).toBe(400);
  }
  expect((await POST(request("{"))).status).toBe(400);
  expect(read).not.toHaveBeenCalled();
});

it("restricts all ten operation and recipient pairs to server-derived addresses and fixed allowances", async () => {
  const provider = indexer.indexerPublicDataProvider(
    midnightIndexerConfig(getMidnightChainConfig()),
  );
  const dispose = vi.spyOn(provider, "dispose");
  vi.mocked(indexer).indexerPublicDataProvider.mockReturnValue(provider);
  const env = environment();
  vi.mocked(contract.readVaultLedger).mockResolvedValue({
    ...contract.ledger(fixture.readyState),
    vaultEvmAddress: hexToBytes(derivePathAddress(env, contract.VAULT_PATH_HEX, "utf8").slice(2)),
  });
  const fund = vi
    .spyOn(funding, "ensureGasForTransaction")
    .mockResolvedValue({ topUpTxHash: null, topUpAmount: 0n });
  const path = "ff008061".repeat(8);
  const limits = {
    deposit: 100000n,
    withdraw: 100000n,
    swap: 800000n,
    supply: 600000n,
    redeem: 500000n,
  };
  for (const operation of ["deposit", "withdraw", "swap", "supply", "redeem"] as const) {
    for (const kind of ["deposit", "vault"] as const) {
      const recipient = kind === "deposit" ? { kind, path } : { kind };
      const allowed = (operation === "deposit") === (kind === "deposit");
      const before = fund.mock.calls.length;
      const response = await POST(request(JSON.stringify({ operation, recipient })));
      expect(response.status).toBe(allowed ? 200 : 400);
      expect(fund).toHaveBeenCalledTimes(before + Number(allowed));
    }
  }
  const operations = ["deposit", "withdraw", "swap", "supply", "redeem"] as const;
  expect(fund.mock.calls).toHaveLength(operations.length);
  for (const [index, operation] of operations.entries()) {
    const call = fund.mock.calls[index];
    expect(call?.[2]).toBe(
      derivePathAddress(env, operation === "deposit" ? path : contract.VAULT_PATH_HEX, "utf8"),
    );
    expect(call?.[3]).toBe(limits[operation]);
    expect(call?.[4]).toBe(33000000000n);
  }
  expect(dispose).toHaveBeenCalledTimes(5);
});

it("disposes the ledger provider on failures and derives hexadecimal deployments from ledger state", async () => {
  const provider = indexer.indexerPublicDataProvider(
    midnightIndexerConfig(getMidnightChainConfig()),
  );
  const dispose = vi.spyOn(provider, "dispose");
  vi.mocked(indexer).indexerPublicDataProvider.mockReturnValue(provider);
  const state = contract.ledger(fixture.readyState);
  const read = vi
    .mocked(contract.readVaultLedger)
    .mockResolvedValue({ ...state, vaultEvmAddress: new Uint8Array(20) });
  const fund = vi
    .spyOn(funding, "ensureGasForTransaction")
    .mockResolvedValue({ topUpTxHash: null, topUpAmount: 0n });
  const body = JSON.stringify({ operation: "withdraw", recipient: { kind: "vault" } });
  expect((await POST(request(body))).status).toBe(500);
  expect(fund).not.toHaveBeenCalled();
  read.mockRejectedValueOnce(new Error("Indexer unavailable"));
  expect((await POST(request(body))).status).toBe(500);
  expect(fund).not.toHaveBeenCalled();
  const address = derivePathAddress(environment(), contract.VAULT_PATH_HEX, "hex");
  read.mockResolvedValue({ ...state, vaultEvmAddress: hexToBytes(address.slice(2)) });
  const response = await POST(request(body));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toStrictEqual({
    ok: true,
    topUpTxHash: null,
    topUpAmount: "0",
  });
  expect(fund.mock.lastCall?.[2]).toBe(address);
  fund.mockRejectedValueOnce(new Error("Relayer unavailable"));
  expect((await POST(request(body))).status).toBe(500);
  expect(dispose).toHaveBeenCalledTimes(4);
  expect(read).toHaveBeenCalledTimes(4);
});

it("loads the server dependency graph in a real isolated Node process", () => {
  const result = spawnSync(process.execPath, ["tests/server/gas-topup-node-import.ts"], {
    encoding: "utf8",
    timeout: 30000,
  });
  expect(result.error).toBeUndefined();
  expect({ status: result.status, stderr: result.stderr }).toStrictEqual({ status: 0, stderr: "" });
  expect(result.stdout).toContain("modules with ledger WASM and without browser assembly");
});
