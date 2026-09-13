export function runtimeFixture(overrides = {}) {
  const applied = {
    fingerprint: "fixture-revision",
    evm: { chainId: 11155111, rpcUrl: "http://fixture.invalid" },
    midnight: { networkId: "undeployed" },
    environment: { contractAddress: "fixture-contract" },
    ...overrides,
  };
  const owner = { getSnapshot: () => ({ applied }), onInvalidate: () => () => {} };
  return {
    applied,
    owner,
    serverUnavailable: null,
    requireServerHeaders: () => ({ "x-vault-configuration": "fixture-revision" }),
  };
}
export function runtimeStubs(runtime = runtimeFixture()) {
  const context = { useRuntimeConfig: () => runtime };
  return { "@/providers/runtime-config-context": context, "./runtime-config-context": context };
}
