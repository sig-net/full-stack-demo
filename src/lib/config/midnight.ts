import { MidnightNetwork } from '@sig-net/midnight';
import { z } from 'zod';

export type NetworkId = `${MidnightNetwork}`;

export interface MidnightNodeConfig {
  readonly networkId: NetworkId;
  readonly indexerUrl: string;
  readonly indexerWsUrl: string;
  readonly nodeUrl: string;
  readonly proofServerUrl: string;
}

const networkSchema = z.enum(MidnightNetwork);
const endpointSchema = z.url({ protocol: /^https?$/ });

export function createMidnightChainConfig(input: {
  networkId?: string;
  indexerUrl?: string;
  indexerWsUrl?: string;
  nodeUrl?: string;
  proofServerUrl?: string;
}): MidnightNodeConfig {
  const network = networkSchema.safeParse(
    input.networkId ?? MidnightNetwork.Undeployed,
  );
  if (!network.success)
    throw new Error(
      'NEXT_PUBLIC_MIDNIGHT_NETWORK_ID must be one of ' +
        Object.values(MidnightNetwork).join(', '),
    );
  const local = network.data === MidnightNetwork.Undeployed;
  const validateUrl = (
    value: string | undefined,
    variable: string,
    protocol = /^https?$/,
  ) => {
    const result = z.url({ protocol }).safeParse(value);
    if (!result.success)
      throw new Error(
        `${variable} must be an absolute URL with protocol ${protocol.source}`,
      );
    return result.data;
  };
  const indexerUrl = validateUrl(
    input.indexerUrl ??
      (local ? 'http://127.0.0.1:8088/api/v3/graphql' : undefined),
    'NEXT_PUBLIC_MIDNIGHT_INDEXER_URL',
  );
  const subscription = new URL(indexerUrl);
  subscription.protocol = subscription.protocol === 'https:' ? 'wss:' : 'ws:';
  subscription.pathname = `${subscription.pathname.replace(/\/$/, '')}/ws`;
  return Object.freeze({
    networkId: network.data,
    indexerUrl,
    indexerWsUrl: validateUrl(
      input.indexerWsUrl ?? subscription.toString(),
      'NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URL',
      /^wss?$/,
    ),
    nodeUrl: validateUrl(
      input.nodeUrl ?? (local ? 'http://127.0.0.1:9944' : undefined),
      'NEXT_PUBLIC_MIDNIGHT_NODE_URL',
      /^(https?|wss?)$/,
    ),
    proofServerUrl: validateUrl(
      input.proofServerUrl ?? 'http://127.0.0.1:6300',
      'NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER_URL',
    ),
  });
}

export function getMidnightChainConfig(): MidnightNodeConfig {
  return createMidnightChainConfig({
    networkId: process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID,
    indexerUrl: process.env.NEXT_PUBLIC_MIDNIGHT_INDEXER_URL,
    indexerWsUrl: process.env.NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URL,
    nodeUrl: process.env.NEXT_PUBLIC_MIDNIGHT_NODE_URL,
    proofServerUrl: process.env.NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER_URL,
  });
}

export function midnightIndexerConfig(config: MidnightNodeConfig) {
  return { queryURL: config.indexerUrl, subscriptionURL: config.indexerWsUrl };
}

export function getZkConfigOrigin(browserOrigin: string): string {
  const value =
    process.env.NEXT_PUBLIC_ZK_CONFIG_ORIGIN || `${browserOrigin}/zk`;
  if (!endpointSchema.safeParse(value).success)
    throw new Error(
      'NEXT_PUBLIC_ZK_CONFIG_ORIGIN must be an absolute HTTP(S) URL',
    );
  return value.replace(/\/$/, '');
}
