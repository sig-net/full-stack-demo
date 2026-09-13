import { getAddress } from 'viem';
import { getEvmChainConfig, sepolia } from './evm';
import { getEthereumProvider } from '@/lib/rpc';
import {
  BrowserWallet,
  type BrowserWalletChoice,
} from '@/lib/evm/wallet/BrowserWallet';
import type { WalletConnection } from '@/lib/evm/wallet/Wallet';

export function browserWalletConnection(
  choice: BrowserWalletChoice,
): WalletConnection {
  return {
    key: choice.provider,
    create: onInvalidated => {
      const config = getEvmChainConfig();
      const local =
        (process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID ?? 'undeployed') ===
        'undeployed';
      const markerAddress = process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_ADDRESS;
      const markerCode = process.env.NEXT_PUBLIC_LOCAL_EVM_MARKER_CODE;
      const verifyNetwork = local
        ? async () => {
            if (!markerAddress || !markerCode)
              throw new Error(
                'Run local setup and restart the app to configure the local fork.',
              );
            const observed = await choice.provider.request({
              method: 'eth_getCode',
              params: [getAddress(markerAddress), 'latest'],
            });
            if (observed.toLowerCase() !== markerCode.toLowerCase())
              throw new Error(
                `Configure the extension’s Sepolia RPC as ${config.rpcUrl}, then reconnect. The local fork marker does not match.`,
              );
          }
        : undefined;
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
