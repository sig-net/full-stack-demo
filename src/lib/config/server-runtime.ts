import { getRuntimeDefaults, runtimeFingerprint } from './runtime';

export function serverRuntimeConfiguration() {
  const defaults = getRuntimeDefaults();
  if (
    !defaults.fields.contractAddress ||
    !defaults.fields.mpcSecpPub ||
    !defaults.signetContractAddress
  )
    throw new Error('Server deployment configuration is unavailable.');
  return {
    ...defaults,
    fingerprint: runtimeFingerprint(
      defaults.fields,
      defaults.signetContractAddress,
    ),
  };
}

export function requireServerConfiguration(request: Request) {
  const expected = serverRuntimeConfiguration();
  if (request.headers.get('x-vault-configuration') !== expected.fingerprint)
    throw new Error(
      'Browser configuration differs from the server deployment. Reset configuration or use independent wallet actions.',
    );
  return expected;
}
