import { deriveEvmAddress, hexToBytes } from "@sig-net/midnight";
import { VAULT_PATH_HEX } from "@sig-net/midnight-examples-erc20-vault-contract";
import { expect, it } from "vitest";

import { NETWORK_DEFAULTS, sepoliaChainConfig } from "@/lib/config/runtime";
import { createVaultEnvironment } from "@/lib/midnight/env";
import { derivePathAddress, resolvePathRendering } from "@/lib/midnight/evm-addresses";

it("derives both deployment renderings including binary paths and rejects a mismatched vault", () => {
  const environment = createVaultEnvironment(
    NETWORK_DEFAULTS.midnight.undeployed,
    sepoliaChainConfig("https://rpc.example.invalid"),
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
