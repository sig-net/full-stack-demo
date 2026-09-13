import { vi } from "vitest";

import { createRuntimeConfiguration, type RuntimeConfiguration } from "@/lib/config/runtime";

/**
 * Answers the runtime attestation endpoint with the actual local configuration snapshot.
 *
 * @returns The owner used to derive the server response and fingerprint.
 */
export function mockMatchingRuntimeServer(): RuntimeConfiguration {
  const owner = createRuntimeConfiguration();
  const snapshot = owner.getSnapshot();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((input) => {
      if (input !== "/api/runtime-config")
        return Promise.reject(new Error("Unexpected fetch outside runtime configuration fixture"));
      return Promise.resolve(
        Response.json({
          fields: snapshot.applied.fields,
          signetContractAddress: owner.defaults.signetContractAddress,
          fingerprint: snapshot.applied.fingerprint,
        }),
      );
    }),
  );
  return owner;
}
