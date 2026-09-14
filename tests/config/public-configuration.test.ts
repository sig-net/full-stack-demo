import { getSignetContractAddress, MidnightNetwork } from "@sig-net/midnight";
import { getVaultContractAddress } from "@sig-net/midnight-examples-erc20-vault-contract";
import { expect, it, vi } from "vitest";

import { createEvmChainConfig, getEvmChainConfig, sepolia } from "@/lib/config/evm";
import {
  createMidnightChainConfig,
  getMidnightChainConfig,
  getZkConfigOrigin,
  midnightIndexerConfig,
} from "@/lib/config/midnight";
import { createVaultEnvironment } from "@/lib/midnight/env";
import { getEthereumProvider } from "@/lib/rpc";

it("preserves endpoint validation, deployment identity and immutable snapshots", () => {
  const evm = createEvmChainConfig("https://rpc.example.invalid");
  expect(evm.chainId).toBe(BigInt(sepolia.id));
  expect(evm.explorerUrl).toBe(sepolia.blockExplorers.default.url);
  const firstClient = getEthereumProvider(evm);
  const secondClient = getEthereumProvider({ ...evm });
  expect(firstClient).not.toBe(secondClient);
  expect(firstClient.chain?.id).toBe(Number(evm.chainId));
  expect(firstClient.transport.url).toBe(evm.rpcUrl);
  expect(secondClient.transport.url).toBe(evm.rpcUrl);
  expect(
    getEthereumProvider(createEvmChainConfig("https://other.example.invalid")).transport.url,
  ).toBe("https://other.example.invalid");
  for (const invalid of ["", "relative", "ws://example.invalid", "file:///etc/passwd"])
    expect(() => createEvmChainConfig(invalid)).toThrow(/URL/i);
  expect(createEvmChainConfig(undefined).rpcUrl).toBe("http://127.0.0.1:8545");
  for (const rpc of [
    undefined,
    "http://127.0.0.1:8545",
    "http://localhost:8545",
    "http://[::1]:8545",
  ])
    expect(createEvmChainConfig(rpc).explorerUrl).toBe("");
  const local = createMidnightChainConfig({});
  expect(local.networkId).toBe("undeployed");
  expect(local.indexerWsUrl).toBe("ws://127.0.0.1:8088/api/v3/graphql/ws");
  for (const protocol of ["http:", "https:"]) {
    const config = createMidnightChainConfig({
      indexerUrl: `${protocol}//example.invalid/api/v4/graphql/?token=test`,
    });
    expect(config.indexerWsUrl).toBe(
      `${protocol === "https:" ? "wss:" : "ws:"}//example.invalid/api/v4/graphql/ws?token=test`,
    );
  }
  const supplied = {
    networkId: "stagenet",
    nodeUrl: "wss://node.example.invalid",
    indexerUrl: "https://indexer.example.invalid/api/v4/graphql",
    indexerWsUrl: "wss://subscriptions.example.invalid/custom",
    proofServerUrl: "http://localhost:6300",
  };
  const stagenet = createMidnightChainConfig(supplied);
  expect(stagenet.indexerWsUrl).toBe(supplied.indexerWsUrl);
  expect(midnightIndexerConfig(stagenet).queryURL).toBe(supplied.indexerUrl);
  expect(midnightIndexerConfig(stagenet).subscriptionURL).toBe(supplied.indexerWsUrl);
  expect(stagenet.nodeUrl).toBe(supplied.nodeUrl);
  const invalidInputs: [Parameters<typeof createMidnightChainConfig>[0], RegExp][] = [
    [{ networkId: "typo" }, /NEXT_PUBLIC_MIDNIGHT_NETWORK_ID/],
    [{ nodeUrl: "file:///tmp/node" }, /NEXT_PUBLIC_MIDNIGHT_NODE_URL/],
    [{ indexerUrl: "wss://example.invalid" }, /NEXT_PUBLIC_MIDNIGHT_INDEXER_URL/],
    [{ indexerWsUrl: "https://example.invalid" }, /NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URL/],
    [{ proofServerUrl: "relative" }, /NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER_URL/],
  ];
  expect(invalidInputs.length > 0).toBeTruthy();
  for (const [input, error] of invalidInputs)
    expect(() => createMidnightChainConfig(input)).toThrow(error);
  for (const networkId of Object.values(MidnightNetwork).filter(
    (network) => network !== MidnightNetwork.Undeployed,
  ))
    expect(() => createMidnightChainConfig({ networkId })).toThrow(
      /NEXT_PUBLIC_MIDNIGHT_INDEXER_URL/,
    );
  const key = "0x024eef776e4f257d68983e45b340c2e9546c5df95447900b6aadfec68fb46fdee2";
  const inputs = { contractAddress: undefined, signetContractAddress: undefined, mpcSecpPub: key };
  const published = createVaultEnvironment(stagenet, evm, inputs);
  expect(published.contractAddress).toBe(getVaultContractAddress(MidnightNetwork.Stagenet));
  expect(published.signetContractAddress).toBe(getSignetContractAddress(MidnightNetwork.Stagenet));
  expect(published.mpcSecpPub).toBe(key);
  expect(() => createVaultEnvironment(local, evm, inputs)).toThrow(/Configure vault/);
  const override = createVaultEnvironment(local, evm, {
    ...inputs,
    contractAddress: "ab".repeat(32),
    signetContractAddress: "cd".repeat(32),
  });
  expect(override.contractAddress).toBe("ab".repeat(32));
  expect(override.signetContractAddress).toBe("cd".repeat(32));
  for (const contractAddress of ["", "bad", "aa".repeat(31)])
    expect(
      () => createVaultEnvironment(local, evm, { ...inputs, contractAddress }).contractAddress,
    ).toThrow(/contractAddress|contract address/);
  for (const mpcSecpPub of ["", "0x02" + "00".repeat(32), "nothex"])
    expect(() => createVaultEnvironment(local, evm, { ...inputs, mpcSecpPub }).mpcSecpPub).toThrow(
      /mpcPubkey|public key|Configure vault/,
    );
  inputs.mpcSecpPub = "invalid";
  expect(published.mpcSecpPub).toBe(key);
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_NETWORK_ID", "undeployed");
  vi.stubEnv("NEXT_PUBLIC_SEPOLIA_RPC_URL", evm.rpcUrl);
  process.env.NEXT_PUBLIC_MPC_SECP256K1_PUBKEY = key;
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS", "ab".repeat(32));
  vi.stubEnv("NEXT_PUBLIC_MIDNIGHT_SIGNET_CONTRACT_ADDRESS", "cd".repeat(32));
  const snapshot = createVaultEnvironment(getMidnightChainConfig(), getEvmChainConfig());
  process.env.NEXT_PUBLIC_MPC_SECP256K1_PUBKEY = "invalid";
  expect(snapshot.mpcSecpPub).toBe(key);
  vi.stubEnv("NEXT_PUBLIC_ZK_CONFIG_ORIGIN", undefined);
  expect(getZkConfigOrigin("https://app.example.invalid")).toBe("https://app.example.invalid/zk");
  vi.stubEnv("NEXT_PUBLIC_ZK_CONFIG_ORIGIN", "https://assets.example.invalid/zk/");
  expect(getZkConfigOrigin("https://app.example.invalid")).toBe(
    "https://assets.example.invalid/zk",
  );
  vi.stubEnv("NEXT_PUBLIC_ZK_CONFIG_ORIGIN", "invalid");
  expect(() => getZkConfigOrigin("https://app.example.invalid")).toThrow(
    /NEXT_PUBLIC_ZK_CONFIG_ORIGIN/,
  );
});
