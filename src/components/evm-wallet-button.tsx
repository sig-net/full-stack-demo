'use client';

import { useEffect, useState } from 'react';
import { formatEther, formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  discoverBrowserWallets,
  type BrowserWalletChoice,
} from '@/lib/evm/wallet/BrowserWallet';
import { Input } from '@/components/ui/input';
import {
  browserWalletConnection,
  seedWalletConnection,
} from '@/lib/config/evm-wallet';
import { useEvmBalances } from '@/providers/evm-balances-context';
import { ERC20_TOKENS } from '@/lib/constants/token-metadata';
import { useEvmWallet } from '@/providers/evm-wallet-context';

export function EvmWalletButton() {
  const evm = useEvmWallet();
  const balances = useEvmBalances();
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState('');
  const openChanged = (value: boolean) => {
    setOpen(value);
    if (!value) setSeed('');
  };
  const [revision, setRevision] = useState(0);
  const [choices, setChoices] = useState<BrowserWalletChoice[]>([]);
  const [observedWallet, setObservedWallet] = useState(evm.wallet);
  if (observedWallet !== evm.wallet) {
    setObservedWallet(evm.wallet);
    if (evm.wallet) {
      setOpen(false);
      setSeed('');
    }
  }
  useEffect(() => {
    if (!open) return;
    return discoverBrowserWallets(setChoices);
  }, [open, revision]);
  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        {evm.wallet
          ? 'Sepolia wallet'
          : evm.connecting
            ? 'Connecting EVM wallet…'
            : 'Connect EVM wallet'}
      </Button>
      <Dialog open={open} onOpenChange={openChanged}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sepolia wallet</DialogTitle>
          </DialogHeader>
          {evm.error && <p role='alert'>{evm.error}</p>}
          {evm.wallet && (
            <div className='space-y-2'>
              <p className='break-all'>{evm.wallet.account}</p>
              {balances.isPending && <p>Loading balances…</p>}
              {balances.isError && (
                <p role='alert'>
                  Unable to read wallet balances.{' '}
                  <Button onClick={() => void balances.refetch()}>
                    Retry balances
                  </Button>
                </p>
              )}
              {balances.isSuccess && (
                <>
                  <p>{formatEther(balances.data.eth)} ETH</p>
                  {balances.data.tokens.map(token => (
                    <p key={token.erc20Address}>
                      {formatUnits(token.units, token.decimals)}{' '}
                      {ERC20_TOKENS.find(
                        value => value.erc20Address === token.erc20Address,
                      )?.symbol ?? token.erc20Address}
                    </p>
                  ))}
                </>
              )}
            </div>
          )}
          {(evm.wallet || evm.connecting) && (
            <Button variant='outline' onClick={evm.disconnect}>
              Disconnect EVM wallet
            </Button>
          )}
          <form
            onSubmit={event => {
              event.preventDefault();
              void evm.connect(seedWalletConnection(seed));
              setSeed('');
            }}
            className='flex flex-col gap-2'
          >
            <label htmlFor='evm-seed'>EVM seed</label>
            <Input
              id='evm-seed'
              type='password'
              autoComplete='off'
              spellCheck={false}
              value={seed}
              onChange={event => setSeed(event.target.value)}
            />
            <p>
              The hexadecimal seed stays in page memory. This wallet signs
              transactions without an extension prompt.
            </p>
            <Button type='submit' disabled={!seed.trim()}>
              Connect EVM seed wallet
            </Button>
          </form>
          {choices.map(choice => (
            <Button
              key={choice.id}
              disabled={evm.connecting}
              onClick={() => {
                void evm.connect(browserWalletConnection(choice));
              }}
            >
              {choice.name}
            </Button>
          ))}
          {!choices.length && (
            <p>
              No browser wallet announced. Enable an EVM wallet extension and
              refresh the list.
            </p>
          )}
          <Button
            variant='outline'
            onClick={() => {
              setChoices([]);
              setRevision(value => value + 1);
            }}
          >
            Refresh wallets
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
