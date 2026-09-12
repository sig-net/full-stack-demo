'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Wallet, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatAddress } from '@/lib/address-utils';
import { useVault } from '@/providers/vault-context';
import { EvmWalletButton } from './evm-wallet-button';
import { VaultIdentityButton } from './vault-identity-button';
import { useMidnightConnection } from '@/providers/midnight-wallet-context';

export function WalletButton() {
  const [modalOpen, setModalOpen] = useState(false);
  const [seed, setSeed] = useState('');
  const attempt = useRef(0);
  useEffect(
    () => () => {
      attempt.current += 1;
    },
    [],
  );
  const vault = useVault();
  const connection = useMidnightConnection();
  const openChanged = (open: boolean) => {
    setModalOpen(open);
    if (!open) setSeed('');
  };

  const connectMidnight = () => {
    const current = ++attempt.current;
    void connection.installSeedWallet(seed).catch((error: unknown) => {
      if (current !== attempt.current) return;
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to connect Midnight wallet',
      );
    });
    openChanged(false);
  };

  return (
    <>
      <div className='flex items-center gap-2'>
        <VaultIdentityButton />
        <EvmWalletButton />
        <Button onClick={() => openChanged(true)} className='font-medium'>
          <Wallet className='mr-2 h-4 w-4' />
          {connection.connecting
            ? `Connecting… ${connection.syncStatus}`
            : connection.wallet
              ? `Midnight · ${formatAddress(connection.wallet.shieldedAddress, 4, 4)}`
              : 'Connect Wallet'}
        </Button>
        {(connection.wallet || connection.connecting) && (
          <Button
            variant='outline'
            onClick={() => {
              attempt.current += 1;
              vault.disconnect();
            }}
            title='Disconnect wallet'
            aria-label='Disconnect wallet'
          >
            <LogOut className='h-4 w-4' />
          </Button>
        )}
      </div>
      {connection.wallet && vault.status === 'missing-identity' && (
        <p role='status'>
          Midnight connected. Set a vault identity to load the vault.
        </p>
      )}
      {vault.status === 'loading' && <p role='status'>Loading vault…</p>}
      {vault.error && (
        <div
          role='alert'
          className='text-destructive flex items-center gap-2 text-sm'
        >
          <span>{vault.error}</span>
          <Button variant='outline' onClick={vault.retry}>
            Retry vault
          </Button>
        </div>
      )}
      <Dialog open={modalOpen} onOpenChange={openChanged}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {connection.wallet || connection.connecting
                ? 'Replace Midnight wallet'
                : 'Connect Midnight wallet'}
            </DialogTitle>
            <DialogDescription>
              Paste your hexadecimal seed (16–64 bytes). It stays in this page’s
              memory. Refreshing requires you to enter it again.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={event => {
              event.preventDefault();
              connectMidnight();
            }}
            className='flex flex-col gap-3'
          >
            <label htmlFor='midnight-seed'>Midnight seed</label>
            <Input
              id='midnight-seed'
              type='password'
              autoComplete='off'
              spellCheck={false}
              value={seed}
              onChange={event => setSeed(event.target.value)}
              placeholder='Hexadecimal seed'
            />
            <Button type='submit' disabled={!seed.trim()}>
              Connect seed wallet
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
