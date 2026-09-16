import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";
import {
  DustAddress,
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from "@midnightntwrk/wallet-sdk-address-format";
import { vi } from "vitest";

import { type MidnightNodeConfig, NETWORK_DEFAULTS, type NetworkId } from "@/lib/config/runtime";
import { deriveAccountKeys } from "@/lib/midnight/seedlib";
import { BrowserWallet, type BrowserWalletChoice } from "@/lib/midnight/wallet/BrowserWallet";

type ShieldedAddresses = Awaited<ReturnType<ConnectedAPI["getShieldedAddresses"]>>;
type UnshieldedAddressResponse = Awaited<ReturnType<ConnectedAPI["getUnshieldedAddress"]>>;
type DustAddressResponse = Awaited<ReturnType<ConnectedAPI["getDustAddress"]>>;

export interface BrowserWalletAddresses {
  readonly shielded: ShieldedAddresses;
  readonly unshielded: UnshieldedAddressResponse;
  readonly dust: DustAddressResponse;
}

export interface BrowserWalletFixture {
  readonly wallet: BrowserWallet;
  readonly api: {
    getConfiguration: ReturnType<typeof vi.fn<ConnectedAPI["getConfiguration"]>>;
    getShieldedAddresses: ReturnType<typeof vi.fn<ConnectedAPI["getShieldedAddresses"]>>;
    getUnshieldedAddress: ReturnType<typeof vi.fn<ConnectedAPI["getUnshieldedAddress"]>>;
    getDustAddress: ReturnType<typeof vi.fn<ConnectedAPI["getDustAddress"]>>;
  };
  readonly addresses: BrowserWalletAddresses;
  readonly configuration: MidnightNodeConfig;
}

export function createBrowserWalletAddresses(networkId: NetworkId): BrowserWalletAddresses {
  const keys = deriveAccountKeys("07".repeat(32), networkId);
  try {
    const coinPublicKey = ShieldedCoinPublicKey.fromHexString(
      keys.shieldedSecretKeys.coinPublicKey,
    );
    const encryptionPublicKey = ShieldedEncryptionPublicKey.fromHexString(
      keys.shieldedSecretKeys.encryptionPublicKey,
    );
    return {
      shielded: {
        shieldedAddress: MidnightBech32m.encode(
          networkId,
          new ShieldedAddress(coinPublicKey, encryptionPublicKey),
        ).toString(),
        shieldedCoinPublicKey: ShieldedCoinPublicKey.codec
          .encode(networkId, coinPublicKey)
          .toString(),
        shieldedEncryptionPublicKey: ShieldedEncryptionPublicKey.codec
          .encode(networkId, encryptionPublicKey)
          .toString(),
      },
      unshielded: { unshieldedAddress: keys.unshieldedKeystore.getBech32Address().toString() },
      dust: { dustAddress: DustAddress.encodePublicKey(networkId, keys.dustSecretKey.publicKey) },
    };
  } finally {
    keys.shieldedSecretKeys.clear();
    keys.dustSecretKey.clear();
  }
}

export function createBrowserWalletFixture(): BrowserWalletFixture {
  const configuration = NETWORK_DEFAULTS.midnight.undeployed;
  const addresses = createBrowserWalletAddresses(configuration.networkId);
  const unavailable = <Result>(): Promise<Result> =>
    Promise.reject(new Error("This connector fixture method is not used."));
  const api = {
    getShieldedBalances: () => Promise.resolve({}),
    getUnshieldedBalances: () => Promise.resolve({}),
    getDustBalance: () => Promise.resolve({ balance: 0n, cap: 0n }),
    getConfiguration: vi.fn<ConnectedAPI["getConfiguration"]>().mockResolvedValue({
      networkId: configuration.networkId,
      indexerUri: configuration.indexerUrl,
      indexerWsUri: configuration.indexerWsUrl,
      substrateNodeUri: configuration.nodeUrl,
    }),
    getShieldedAddresses: vi
      .fn<ConnectedAPI["getShieldedAddresses"]>()
      .mockResolvedValue(addresses.shielded),
    getUnshieldedAddress: vi
      .fn<ConnectedAPI["getUnshieldedAddress"]>()
      .mockResolvedValue(addresses.unshielded),
    getDustAddress: vi.fn<ConnectedAPI["getDustAddress"]>().mockResolvedValue(addresses.dust),
    getTxHistory: () => Promise.resolve([]),
    balanceUnsealedTransaction: () =>
      unavailable<Awaited<ReturnType<ConnectedAPI["balanceUnsealedTransaction"]>>>(),
    balanceSealedTransaction: () =>
      unavailable<Awaited<ReturnType<ConnectedAPI["balanceSealedTransaction"]>>>(),
    makeTransfer: () => unavailable<Awaited<ReturnType<ConnectedAPI["makeTransfer"]>>>(),
    makeIntent: () => unavailable<Awaited<ReturnType<ConnectedAPI["makeIntent"]>>>(),
    signData: () => unavailable<Awaited<ReturnType<ConnectedAPI["signData"]>>>(),
    submitTransaction: () => unavailable<Awaited<ReturnType<ConnectedAPI["submitTransaction"]>>>(),
    getProvingProvider: () =>
      unavailable<Awaited<ReturnType<ConnectedAPI["getProvingProvider"]>>>(),
    getConnectionStatus: () =>
      Promise.resolve({ status: "connected" as const, networkId: configuration.networkId }),
    hintUsage: () => Promise.resolve(),
  } satisfies ConnectedAPI;
  const connector: InitialAPI = {
    apiVersion: "4.0.1",
    icon: "data:image/svg+xml,fixture",
    name: "Fixture",
    rdns: "example.fixture",
    connect: vi.fn<InitialAPI["connect"]>().mockResolvedValue(api),
  };
  const choice: BrowserWalletChoice = {
    apiVersion: connector.apiVersion,
    connector,
    icon: connector.icon,
    key: "fixture",
    name: connector.name,
    rdns: connector.rdns,
  };
  return { wallet: new BrowserWallet(choice, configuration), api, addresses, configuration };
}
