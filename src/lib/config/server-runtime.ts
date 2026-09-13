import { getRuntimeDefaults, type RuntimeDefaults, runtimeFingerprint } from "./runtime";

type ServerRuntimeConfiguration = RuntimeDefaults & {
  fingerprint: ReturnType<typeof runtimeFingerprint>;
};

/**
 * Captures complete deployment inputs for server-assisted actions.
 *
 * @returns Startup defaults with their operational fingerprint.
 * @throws {Error} If any required deployment identity is absent.
 */
export function serverRuntimeConfiguration(): ServerRuntimeConfiguration {
  const defaults = getRuntimeDefaults();
  if (
    !defaults.fields.contractAddress ||
    !defaults.fields.mpcSecpPub ||
    !defaults.signetContractAddress
  )
    throw new Error("Server deployment configuration is unavailable.");
  return {
    ...defaults,
    fingerprint: runtimeFingerprint(defaults.fields, defaults.signetContractAddress),
  };
}

/**
 * Requires a browser attestation matching the server's captured deployment inputs.
 *
 * @param request - Request carrying the configuration fingerprint header.
 * @returns The matching server configuration.
 * @throws {Error} If the deployment is incomplete or the browser attestation differs.
 */
export function requireServerConfiguration(request: Request): ServerRuntimeConfiguration {
  const expected = serverRuntimeConfiguration();
  if (request.headers.get("x-vault-configuration") !== expected.fingerprint)
    throw new Error(
      "Browser configuration differs from the server deployment. Reset configuration or use independent wallet actions.",
    );
  return expected;
}
