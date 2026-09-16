import type { LocalFaucetDescriptor } from "@/lib/config/local-faucet";

/** Local endpoint descriptor supplied to provider tests. */
export const LOCAL_FAUCET_DESCRIPTOR_FIXTURE: LocalFaucetDescriptor = Object.freeze({
  available: true,
  midnight: Object.freeze({
    networkId: "undeployed",
    indexerUrl: "http://127.0.0.1:8088/api/v4/graphql",
    indexerWsUrl: "ws://127.0.0.1:8088/api/v4/graphql/ws",
    nodeUrl: "http://127.0.0.1:9944",
    proofServerUrl: "http://127.0.0.1:6300",
  }),
  evm: Object.freeze({ chainId: "11155111", rpcUrl: "http://127.0.0.1:8545" }),
});
