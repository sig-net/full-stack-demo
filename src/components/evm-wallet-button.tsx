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
import { useEvmWallet } from '@/providers/evm-wallet-context';

export function EvmWalletButton() {
  const evm = useEvmWallet();
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [choices, setChoices] = useState<BrowserWalletChoice[]>([]);
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sepolia wallet</DialogTitle>
          </DialogHeader>
          {evm.error && <p role='alert'>{evm.error}</p>}
          {evm.wallet && (
            <div className='space-y-2'>
              <p className='break-all'>{evm.wallet.account}</p>
              {evm.balances.isPending && <p>Loading balances…</p>}
              {evm.balances.isError && (
                <p role='alert'>
                  Unable to read wallet balances.{' '}
                  <Button onClick={() => void evm.balances.refetch()}>
                    Retry balances
                  </Button>
                </p>
              )}
              {evm.balances.isSuccess && (
                <>
                  <p>{formatEther(evm.balances.data.eth)} ETH</p>
                  {evm.balances.data.tokens.map(token => (
                    <p key={token.erc20Address}>
                      {formatUnits(token.units, token.decimals)} {token.symbol}
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
          {choices.map(choice => (
            <Button key={choice.id} onClick={() => void evm.connect(choice)}>
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
