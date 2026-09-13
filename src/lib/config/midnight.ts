import type { IndexerProviderConfig } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { MidnightNetwork } from "@sig-net/midnight";
import { z } from "zod";

/** String values accepted by the protocol network enum and browser wallet configuration. */
export type NetworkId = `${MidnightNetwork}`;

/** Immutable public endpoints captured by wallet sessions and server-side indexer clients. */
export interface MidnightNodeConfig {
  readonly networkId: NetworkId;
  readonly indexerUrl: string;
  readonly indexerWsUrl: string;
  readonly nodeUrl: string;
  readonly proofServerUrl: string;
}

const networkSchema = z.enum(MidnightNetwork);
const endpointSchema = z.url({ protocol: /^https?$/ });

/**
 * Resolves local defaults and derives the subscription endpoint from the query URL when omitted.
 *
 * @param input - Explicit public overrides, with missing values eligible for network defaults.
 * @param input.networkId - Protocol network value, defaulting to undeployed.
 * @param input.indexerUrl - HTTP(S) GraphQL URL, required outside the local network.
 * @param input.indexerWsUrl - WebSocket subscription URL, derived from indexerUrl when omitted.
 * @param input.nodeUrl - HTTP(S) or WebSocket node URL, required outside the local network.
 * @param input.proofServerUrl - HTTP(S) proof endpoint, defaulting to the local proof server.
 * @returns Validated endpoints bound to one Midnight network.
 * @throws {Error} If a network or endpoint is invalid, or a non-local required endpoint is missing.
 */
export function createMidnightChainConfig(input: {
  networkId?: string;
  indexerUrl?: string;
  indexerWsUrl?: string;
  nodeUrl?: string;
  proofServerUrl?: string;
}): MidnightNodeConfig {
  const network = networkSchema.safeParse(input.networkId ?? MidnightNetwork.Undeployed);
  if (!network.success)
    throw new Error(
      "NEXT_PUBLIC_MIDNIGHT_NETWORK_ID must be one of " + Object.values(MidnightNetwork).join(", "),
    );
  const local = network.data === MidnightNetwork.Undeployed;
  const validateUrl = (
    value: string | undefined,
    variable: string,
    protocol = /^https?$/,
  ): string => {
    const result = z.url({ protocol }).safeParse(value);
    if (!result.success)
      throw new Error(`${variable} must be an absolute URL with protocol ${protocol.source}`);
    return result.data;
  };
  const indexerUrl = validateUrl(
    input.indexerUrl ?? (local ? "http://127.0.0.1:8088/api/v3/graphql" : undefined),
    "NEXT_PUBLIC_MIDNIGHT_INDEXER_URL",
  );
  const subscription = new URL(indexerUrl);
  subscription.protocol = subscription.protocol === "https:" ? "wss:" : "ws:";
  subscription.pathname = `${subscription.pathname.replace(/\/$/, "")}/ws`;
  return Object.freeze({
    networkId: network.data,
    indexerUrl,
    indexerWsUrl: validateUrl(
      input.indexerWsUrl ?? subscription.toString(),
      "NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URL",
      /^wss?$/,
    ),
    nodeUrl: validateUrl(
      input.nodeUrl ?? (local ? "http://127.0.0.1:9944" : undefined),
      "NEXT_PUBLIC_MIDNIGHT_NODE_URL",
      /^(https?|wss?)$/,
    ),
    proofServerUrl: validateUrl(
      input.proofServerUrl ?? "http://127.0.0.1:6300",
      "NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER_URL",
    ),
  });
}

/**
 * Captures the statically exposed Next.js environment values for a new configuration owner.
 *
 * @returns The validated startup Midnight configuration.
 * @throws {Error} If the startup network or its endpoints are invalid.
 */
export function getMidnightChainConfig(): MidnightNodeConfig {
  return createMidnightChainConfig({
    networkId: process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID,
    indexerUrl: process.env.NEXT_PUBLIC_MIDNIGHT_INDEXER_URL,
    indexerWsUrl: process.env.NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URL,
    nodeUrl: process.env.NEXT_PUBLIC_MIDNIGHT_NODE_URL,
    proofServerUrl: process.env.NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER_URL,
  });
}

/**
 * Selects the captured query and subscription endpoints for the SDK provider.
 *
 * @param config - The configuration owned by the current operation or wallet session.
 * @returns SDK connection inputs that leave its optional transport and polling defaults intact.
 */
export function midnightIndexerConfig(
  config: MidnightNodeConfig,
): Pick<IndexerProviderConfig, "queryURL" | "subscriptionURL"> {
  return { queryURL: config.indexerUrl, subscriptionURL: config.indexerWsUrl };
}

/**
 * Resolves the proving-asset root, treating an empty override as the app's own public asset tree.
 *
 * @param browserOrigin - The app origin used when the override is absent or empty.
 * @returns An absolute HTTP(S) asset root with its final slash removed.
 * @throws {Error} If the selected root is not an absolute HTTP(S) URL.
 */
export function getZkConfigOrigin(browserOrigin: string): string {
  const override = process.env.NEXT_PUBLIC_ZK_CONFIG_ORIGIN;
  const value = override === undefined || override === "" ? `${browserOrigin}/zk` : override;
  if (!endpointSchema.safeParse(value).success)
    throw new Error("NEXT_PUBLIC_ZK_CONFIG_ORIGIN must be an absolute HTTP(S) URL");
  return value.replace(/\/$/, "");
}
