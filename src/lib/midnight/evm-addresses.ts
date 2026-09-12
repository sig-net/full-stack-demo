import { deriveEvmAddress, hexToBytes } from '@sig-net/midnight';
import { VAULT_PATH_HEX } from '@sig-net/midnight-examples-erc20-vault-contract';
import type { Hex } from 'viem';
import type { Env } from './vault';

export type PathRendering = 'utf8' | 'hex';

export function derivePathAddress(
  env: Pick<Env, 'mpcSecpPub' | 'contractAddress'>,
  pathHex: string,
  rendering: PathRendering,
): Hex {
  const path =
    rendering === 'hex'
      ? pathHex
      : new TextDecoder('utf-8').decode(hexToBytes(pathHex)).replace(/\0/g, '');
  return deriveEvmAddress(env.mpcSecpPub, env.contractAddress, path) as Hex;
}

export function resolvePathRendering(
  env: Pick<Env, 'mpcSecpPub' | 'contractAddress'>,
  onChainVaultEvm: string,
): PathRendering {
  const normalise = (address: string) =>
    address.toLowerCase().replace(/^0x/, '');
  for (const rendering of ['hex', 'utf8'] as const) {
    if (
      normalise(derivePathAddress(env, VAULT_PATH_HEX, rendering)) ===
      normalise(onChainVaultEvm)
    ) {
      return rendering;
    }
  }
  throw new Error(
    'Configured vault contract and MPC public key do not match the deployed vault EVM address',
  );
}
