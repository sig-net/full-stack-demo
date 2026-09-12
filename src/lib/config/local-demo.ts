import { isLoopbackEndpoint } from './loopback-endpoint';
import { getEvmChainConfig } from './evm';
import { getMidnightChainConfig } from './midnight';

export async function requireLocalDemo() {
  if (typeof window !== 'undefined' || process.env.NODE_ENV !== 'development')
    throw new Error('Local funding requires the development server.');
  const midnight = getMidnightChainConfig();
  const evm = getEvmChainConfig();
  if (
    midnight.networkId !== 'undeployed' ||
    ![
      evm.rpcUrl,
      midnight.indexerUrl,
      midnight.indexerWsUrl,
      midnight.nodeUrl,
      midnight.proofServerUrl,
    ].every(isLoopbackEndpoint)
  )
    throw new Error(
      'Local funding requires loopback Anvil and Midnight endpoints.',
    );
  const instance = process.env.LOCAL_ANVIL_INSTANCE_ID;
  const address = process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_ADDRESS;
  const code = process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE;
  if (
    !instance ||
    !/^0x[0-9a-fA-F]{40}$/.test(address ?? '') ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(code ?? '')
  )
    throw new Error('Run local setup to generate this stack’s fork identity.');
  const rpc = async (
    method: string,
    params: unknown[] = [],
  ): Promise<unknown> => {
    const response = await fetch(evm.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json();
    if (!response.ok || body.error)
      throw new Error(`Local Anvil ${method} failed.`);
    return body.result;
  };
  const info = (await rpc('anvil_metadata')) as { instanceId?: string };
  const marker = await rpc('eth_getCode', [address, 'latest']);
  if (
    info.instanceId !== instance ||
    typeof marker !== 'string' ||
    marker.toLowerCase() !== code!.toLowerCase()
  )
    throw new Error(
      'Local stack identity changed. Run setup again and restart Next.js.',
    );
  return { midnight, evm, rpc };
}
