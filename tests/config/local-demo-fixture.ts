import { vi } from "vitest";

/** Installs the local setup identity for tests that inspect or attest server configuration. */
export function configureLocalDemo(): void {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_NETWORK_ID", "undeployed");
  vi.stubEnv("NEXT_PUBLIC_SEPOLIA_RPC_URL", "http://127.0.0.1:8545");
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_NODE_URL", "ws://127.0.0.1:9944");
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_INDEXER_URL", "http://127.0.0.1:8088/api/v3/graphql");
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URL", "ws://127.0.0.1:8088/api/v3/graphql/ws");
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER_URL", "http://127.0.0.1:6300");
  vi.stubEnv("LOCAL_ANVIL_INSTANCE_ID", "fixture-instance");
  vi.stubEnv("NEXT_PUBLIC_LOCAL_EVM_MARKER_ADDRESS", `0x${"34".repeat(20)}`);
  vi.stubEnv("NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE", "0x1234");
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", "ab".repeat(32));
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS", "cd".repeat(32));
  vi.stubEnv(
    "NEXT_PUBLIC_MPC_SECP256K1_PUBKEY",
    "0x024eef776e4f257d68983e45b340c2e9546c5df95447900b6aadfec68fb46fdee2",
  );
}
