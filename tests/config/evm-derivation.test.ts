import { readFileSync } from "node:fs";

import { deriveEvmAddress, hexToBytes } from "@sig-net/midnight";
import { VAULT_PATH_HEX } from "@sig-net/midnight-examples-erc20-vault-contract";
import { expect, it, vi } from "vitest";

import { createEvmChainConfig } from "@/lib/config/evm";
import { createMidnightChainConfig } from "@/lib/config/midnight";
import { createVaultEnvironment } from "@/lib/midnight/env";
import { derivePathAddress, resolvePathRendering } from "@/lib/midnight/evm-addresses";
import { getRelayerEthAccount } from "@/lib/utils/relayer-setup";

it("derives both deployment renderings including binary paths and rejects a mismatched vault", () => {
  const environment = createVaultEnvironment(
    createMidnightChainConfig({}),
    createEvmChainConfig("https://rpc.example.invalid"),
    {
      contractAddress: "ab".repeat(32),
      signetContractAddress: "cd".repeat(32),
      mpcSecpPub: "0x024eef776e4f257d68983e45b340c2e9546c5df95447900b6aadfec68fb46fdee2",
    },
  );
  const path = "ff008061".repeat(8);
  for (const rendering of ["utf8", "hex"] as const) {
    const vault = derivePathAddress(environment, VAULT_PATH_HEX, rendering);
    expect(resolvePathRendering(environment, vault)).toBe(rendering);
    const rendered =
      rendering === "hex" ? path : new TextDecoder().decode(hexToBytes(path)).replace(/\0/g, "");
    expect(derivePathAddress(environment, path, rendering)).toBe(
      deriveEvmAddress(environment.mpcSecpPub, environment.contractAddress, rendered),
    );
  }
  expect(() => resolvePathRendering(environment, "00".repeat(20))).toThrow("do not match");
});

it("accepts the plain relayer key and rejects malformed or zero private keys", async () => {
  vi.stubEnv("RELAYER_PRIVATE_KEY", `0x${"01".repeat(32)}`);
  expect(getRelayerEthAccount().address).toBe("0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1");
  for (const key of ["[1,2,3]", "01".repeat(32), "0x12", `0x${"00".repeat(32)}`]) {
    vi.stubEnv("RELAYER_PRIVATE_KEY", key);
    vi.resetModules();
    const fresh = await import("@/lib/utils/relayer-setup");
    expect(() => fresh.getRelayerEthAccount()).toThrow();
  }
});

it("keeps all nine funding callers and the signed operation allowance envelopes", () => {
  const source = readFileSync("src/providers/vault-operations-context.tsx", "utf8");
  const calls = [...source.matchAll(/topUpGas\(\{\s*operation:\s*["']([^"']+)["']/g)];
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.map((match) => match[1])).toStrictEqual([
    "deposit",
    "withdraw",
    "withdraw",
    "swap",
    "swap",
    "supply",
    "supply",
    "redeem",
    "redeem",
  ]);
  const vault = readFileSync("src/lib/midnight/vault.ts", "utf8");
  for (const [routing, prefix] of [
    ["SWAP", "SWAP"],
    ["SUPPLY", "STATA"],
    ["REDEEM", "STATA"],
  ] as const)
    expect(vault).toMatch(
      new RegExp(
        `${routing}_MPC_ROUTING,\\s*${prefix}_GAS_LIMIT,\\s*${prefix}_MAX_FEE_PER_GAS,\\s*${prefix}_MAX_PRIORITY_FEE_PER_GAS,`,
      ),
    );
});
