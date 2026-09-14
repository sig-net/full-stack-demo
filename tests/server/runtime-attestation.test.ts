import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";

import { GET } from "@/app/api/runtime-config/route";
import { runtimeConfigurationSchema, runtimeFingerprint } from "@/lib/config/runtime";
import {
  requireServerConfiguration,
  serverRuntimeConfiguration,
} from "@/lib/config/server-runtime";

import { configureLocalDemo } from "../config/local-demo-fixture";

beforeEach(configureLocalDemo);

it("publishes a nested public DTO with a canonical decimal chain ID and matching fingerprint", async () => {
  const response = GET();
  expect(response.status).toBe(200);
  const input: unknown = await response.json();
  expect(input).toMatchObject({
    config: { evm: { chainId: "11155111" }, vault: { signetContractAddress: "cd".repeat(32) } },
  });
  const body = z.object({ config: z.unknown(), fingerprint: z.string() }).parse(input);
  expect(body).not.toHaveProperty("fields");
  expect(body.config).not.toHaveProperty("relayerPrivateKey");
  const config = runtimeConfigurationSchema.parse(body.config);
  expect(config.evm.chainId).toBe(11155111n);
  expect(runtimeFingerprint(config)).toBe(body.fingerprint);
});

it("rejects assisted requests after the server deployment changes", () => {
  const fingerprint = serverRuntimeConfiguration().fingerprint;
  const request = new Request("http://localhost/api/local-funding/evm", {
    headers: { "x-vault-configuration": fingerprint },
  });
  expect(requireServerConfiguration(request).fingerprint).toBe(fingerprint);
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS", "ef".repeat(32));
  expect(() => requireServerConfiguration(request)).toThrow(/differs/);
});

it("returns explicit unavailability when a required server deployment value is cleared", () => {
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", "");
  expect(GET().status).toBe(503);
  expect(() => serverRuntimeConfiguration()).toThrow(/unavailable/i);
});

it("rejects noncanonical and unsafe wire chain encodings", () => {
  const config = serverRuntimeConfiguration().config;
  for (const chainId of ["01", "1.0", "-1", "0", 11155111, "1e6"])
    expect(() =>
      runtimeConfigurationSchema.parse({
        ...config,
        evm: { ...config.evm, chainId },
      }),
    ).toThrow();
});
