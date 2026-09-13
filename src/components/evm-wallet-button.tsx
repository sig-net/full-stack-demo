'use client';

import { useEffect, useState } from 'react';
import { formatEther, formatUnits } from 'viem';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { WalletMenu } from './wallet-menu';
import {
  discoverBrowserWallets,
  type BrowserWalletChoice,
} from '@/lib/evm/wallet/BrowserWallet';
import {
  browserWalletConnection,
  seedWalletConnection,
} from '@/lib/config/evm-wallet';
import { useRuntimeConfig } from '@/providers/runtime-config-context';
import { useEvmBalances } from '@/providers/evm-balances-context';
import { ERC20_TOKENS } from '@/lib/constants/token-metadata';
import { useEvmWallet } from '@/providers/evm-wallet-context';

export function EvmWalletButton() {
  const { applied } = useRuntimeConfig();
  const evm = useEvmWallet();
  const balances = useEvmBalances();
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [choices, setChoices] = useState<BrowserWalletChoice[]>([]);
  useEffect(() => {
    if (!open) return;
    return discoverBrowserWallets(setChoices);
  }, [open, revision]);
  return (
    <WalletMenu
      chainName='EVM'
      wallet={evm.wallet}
      connecting={evm.connecting}
      error={evm.error}
      onOpenChange={setOpen}
      refresh={() => {
        setChoices([]);
        setRevision(value => value + 1);
      }}
      choices={choices.map(choice => ({
        ...choice,
        connect: () => {
          void evm.connect(browserWalletConnection(choice, applied.evm));
        },
      }))}
      installSeed={seed => {
        void evm.connect(seedWalletConnection(seed, applied.evm));
      }}
      disconnect={evm.disconnect}
    >
      {evm.wallet && (
        <div
          className='space-y-1 border-b p-2 text-sm'
          aria-label='EVM balances'
        >
          {balances.isPending && <p role='status'>Loading balances…</p>}
          {balances.isError && (
            <p role='alert'>Unable to read wallet balances.</p>
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
          <DropdownMenuItem
            onSelect={event => {
              event.preventDefault();
              void balances.refetch();
            }}
          >
            {balances.isError ? 'Retry balances' : 'Refresh balances'}
          </DropdownMenuItem>
        </div>
      )}
    </WalletMenu>
  );
}
