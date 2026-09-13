import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import * as ledger from "@midnightntwrk/ledger-v9";
import { expect, it, vi } from "vitest";

const root = createRequire(new URL("../../package.json", import.meta.url));
const consumers = [
  "@midnight-ntwrk/compact-js",
  "@midnight-ntwrk/midnight-js-protocol/ledger",
  "@midnightntwrk/wallet-sdk-address-format",
  "@midnightntwrk/wallet-sdk-capabilities",
  "@midnightntwrk/wallet-sdk-dust-wallet",
  "@midnightntwrk/wallet-sdk-facade",
  "@midnightntwrk/wallet-sdk-prover-client",
  "@midnightntwrk/wallet-sdk-shielded",
  "@midnightntwrk/wallet-sdk-unshielded-wallet",
  "@sig-net/midnight-contract-deploy",
];

it("checks a non-empty SDK consumer inventory", () => {
  expect(consumers.length).toBeGreaterThan(0);
});

it.each(consumers)(
  "shares ledger constructors and parameter instances with %s",
  async (consumer) => {
    const rootPath = root.resolve("@midnightntwrk/ledger-v9");
    const requireConsumer = createRequire(import.meta.resolve(consumer));
    const resolved = requireConsumer.resolve("@midnightntwrk/ledger-v9");
    expect(resolved).toBe(rootPath);
    const consumerLedger = await vi.importActual<typeof ledger>(pathToFileURL(resolved).href);
    expect(consumerLedger.LedgerParameters).toBe(ledger.LedgerParameters);
    expect(
      consumerLedger.partitionTranscripts([], ledger.LedgerParameters.initialParameters()),
    ).toHaveLength(0);
  },
);
