import { SeedWallet } from '@/lib/evm/wallet/SeedWallet';
import { getAddress, type Address } from 'viem';
import { getEvmChainConfig, sepolia } from './evm';
import { getEthereumProvider } from '@/lib/rpc';
import {
  BrowserWallet,
  type BrowserWalletChoice,
} from '@/lib/evm/wallet/BrowserWallet';
import type { WalletConnection } from '@/lib/evm/wallet/Wallet';

function localForkVerification(
  rpcUrl: string,
  readCode: (address: Address) => Promise<string | undefined>,
) {
  const local =
    (process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID ?? 'undeployed') ===
    'undeployed';
  if (!local) return undefined;
  const markerAddress = process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_ADDRESS;
  const markerCode = process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE;
  return async () => {
    if (!markerAddress || !markerCode)
      throw new Error(
        'Run local setup and restart the app to configure the local fork.',
      );
    const observed = await readCode(getAddress(markerAddress));
    if (observed?.toLowerCase() !== markerCode.toLowerCase())
      throw new Error(
        `Use the current local Sepolia RPC ${rpcUrl}, then reconnect. The local fork marker does not match.`,
      );
  };
}

export function browserWalletConnection(
  choice: BrowserWalletChoice,
): WalletConnection {
  return {
    key: choice.provider,
    create: onInvalidated => {
      const config = getEvmChainConfig();
      const verifyNetwork = localForkVerification(config.rpcUrl, address =>
        choice.provider.request({
          method: 'eth_getCode',
          params: [address, 'latest'],
        }),
      );
      return new BrowserWallet(
        sepolia,
        getEthereumProvider(config),
        choice,
        onInvalidated,
        verifyNetwork,
        config.explorerUrl,
      );
    },
  };
}

export function seedWalletConnection(input: string): WalletConnection {
  let seed = input;
  return {
    key: {},
    create: () => {
      const config = getEvmChainConfig();
      const publicClient = getEthereumProvider(config);
      const wallet = new SeedWallet(
        sepolia,
        publicClient,
        config.rpcUrl,
        seed,
        config.explorerUrl,
        localForkVerification(config.rpcUrl, address =>
          publicClient.getCode({ address }),
        ),
      );
      seed = '';
      return wallet;
    },
  };
}
