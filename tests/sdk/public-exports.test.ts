import fs from "node:fs";
import path from "node:path";

import { getMpcRootPublicKey, getSignetContractAddress, MidnightNetwork } from "@sig-net/midnight";
import { getVaultContractAddress } from "@sig-net/midnight-examples-erc20-vault-contract";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const probeSource = `
import type {
  DeployedVaultContract,
  VaultCircuitId,
  VaultPrivateState,
  VaultPrivateStateId,
  VaultProviders,
} from "@sig-net/midnight-examples-erc20-vault-contract";
import type {
  MidnightProvider,
  PrivateStateProvider,
  PublicDataProvider,
  WalletProvider,
  ZKConfigProvider,
} from "@midnight-ntwrk/midnight-js/types";
import type {
  Account,
  Address,
  Chain,
  EIP1193Provider,
  Transport,
  WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import {
  MidnightNetwork,
  getMpcRootPublicKey,
  getSignetContractAddress,
} from "@sig-net/midnight";
import { getVaultContractAddress } from "@sig-net/midnight-examples-erc20-vault-contract";

export type Surface = [
  VaultCircuitId,
  VaultProviders,
  VaultPrivateStateId,
  VaultPrivateState,
  DeployedVaultContract,
  WalletProvider,
  MidnightProvider,
  PrivateStateProvider,
  ZKConfigProvider<VaultCircuitId>,
  PublicDataProvider,
  Address,
  WalletClient<Transport, Chain, Account>,
  EIP1193Provider,
];

export const values = [
  sepolia,
  MidnightNetwork,
  getMpcRootPublicKey,
  getSignetContractAddress,
  getVaultContractAddress,
];
`;

function diagnosticsFor(probePath: string, source: string): readonly ts.Diagnostic[] {
  fs.writeFileSync(probePath, source);
  const program = ts.createProgram([probePath], {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  return ts.getPreEmitDiagnostics(program);
}

describe("published SDK exports", () => {
  it("type checks the public surface and rejects a missing export", () => {
    const directory = path.resolve(".quality-tools/task12-probe");
    const probePath = path.join(directory, "exports.ts");
    fs.mkdirSync(directory, { recursive: true });

    try {
      const validDiagnostics = diagnosticsFor(probePath, probeSource);
      expect(validDiagnostics).toHaveLength(0);

      const missingDiagnostics = diagnosticsFor(
        probePath,
        `${probeSource}\nimport type { Task12MissingExport } from "viem";`,
      );
      expect(missingDiagnostics.length).toBeGreaterThan(0);
      expect(
        missingDiagnostics.some((diagnostic) =>
          ts
            .flattenDiagnosticMessageText(diagnostic.messageText, " ")
            .includes("Task12MissingExport"),
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("exposes published values only for the networks with package data", () => {
    const stagenetVaultAddress = getVaultContractAddress(MidnightNetwork.Stagenet);
    const stagenetSignetAddress = getSignetContractAddress(MidnightNetwork.Stagenet);
    const stagenetMpcKey = getMpcRootPublicKey(MidnightNetwork.Stagenet);

    expect(stagenetVaultAddress).toHaveLength(64);
    expect(stagenetSignetAddress).toHaveLength(64);
    expect(stagenetMpcKey).toHaveLength(132);
    expect(stagenetVaultAddress).toMatch(/^[0-9a-f]{64}$/i);
    expect(stagenetSignetAddress).toMatch(/^[0-9a-f]{64}$/i);
    expect(stagenetMpcKey).toMatch(/^0x[0-9a-f]{130}$/i);

    const unpublishedNetworks = [
      MidnightNetwork.Preview,
      MidnightNetwork.Preprod,
      MidnightNetwork.Mainnet,
    ] as const;
    for (const network of unpublishedNetworks) {
      expect(() => getVaultContractAddress(network)).toThrow(/published/i);
      expect(() => getSignetContractAddress(network)).toThrow(/published/i);
      expect(() => getMpcRootPublicKey(network)).toThrow(/published/i);
    }
  });
});
