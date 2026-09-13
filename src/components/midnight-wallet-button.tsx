'use client';

import { useState } from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { WalletMenu } from './wallet-menu';
import { VaultIdentityButton } from './vault-identity-button';
import { useVault } from '@/providers/vault-context';
import {
  discoverBrowserWallets,
  type BrowserWalletChoice,
} from '@/lib/midnight/wallet/BrowserWallet';
import { useMidnightConnection } from '@/providers/midnight-wallet-context';

export function MidnightWalletButton() {
  const connection = useMidnightConnection();
  const vault = useVault();
  const [choices, setChoices] = useState<BrowserWalletChoice[]>([]);
  const connect = (action: () => Promise<unknown>) => {
    void action().catch(() => {});
  };
  const refresh = () => setChoices(discoverBrowserWallets());
  return (
    <WalletMenu
      chainName='Midnight'
      wallet={connection.wallet}
      connecting={connection.connecting}
      progress={connection.syncStatus}
      error={connection.error}
      onOpenChange={open => {
        if (open) refresh();
      }}
      refresh={refresh}
      choices={choices.map(choice => ({
        id: choice.key,
        name: choice.name,
        iconUrl: choice.icon,
        connect: () => connect(() => connection.installBrowserWallet(choice)),
      }))}
      installSeed={seed => connect(() => connection.installSeedWallet(seed))}
      disconnect={vault.disconnect}
    >
      <div className='space-y-2 border-b p-2 text-sm'>
        <VaultIdentityButton menuItem />
        {connection.wallet && vault.status === 'missing-identity' && (
          <p role='status'>Set a vault identity to load the vault.</p>
        )}
        {vault.status === 'loading' && <p role='status'>Loading vault…</p>}
        {vault.error && (
          <>
            <p role='alert'>{vault.error}</p>
            <DropdownMenuItem
              onSelect={event => {
                event.preventDefault();
                vault.retry();
              }}
            >
              Retry vault
            </DropdownMenuItem>
          </>
        )}
        {connection.wallet?.transactionUnavailable && (
          <p>{connection.wallet.transactionUnavailable}</p>
        )}
      </div>
    </WalletMenu>
  );
}
