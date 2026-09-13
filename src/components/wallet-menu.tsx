'use client';

import { useRef, useState, type ReactNode } from 'react';
import { KeyRound, LoaderCircle, RefreshCw } from 'lucide-react';
import type { WalletMetadata } from '@/lib/wallet-metadata';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WalletMark } from './wallet-mark';
import { SeedWalletDialog } from './seed-wallet-dialog';

export interface WalletMenuProps {
  chainName: string;
  wallet: WalletMetadata | null;
  connecting: boolean;
  error?: string | null;
  progress?: string;
  choices: readonly {
    id: string;
    name: string;
    iconUrl?: string;
    connect: () => void;
  }[];
  onOpenChange: (open: boolean) => void;
  refresh: () => void;
  installSeed: (seed: string) => void;
  disconnect: () => void;
  children?: ReactNode;
}

export function WalletMenu({
  chainName,
  wallet,
  connecting,
  error,
  progress,
  choices,
  onOpenChange,
  refresh,
  installSeed,
  disconnect,
  children,
}: WalletMenuProps) {
  const [open, setOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const status = connecting
    ? 'connecting'
    : wallet
      ? 'connected'
      : 'not connected';
  const label = `${chainName} wallet: ${status}`;
  const changeOpen = (value: boolean) => {
    setOpen(value);
    onOpenChange(value);
  };
  return (
    <>
      <DropdownMenu open={open} onOpenChange={changeOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant='ghost'
            size='sm'
            aria-label={label}
            title={label}
            className={`gap-1.5 rounded-lg px-2 ${wallet ? 'text-stone-900' : 'text-stone-500'}`}
          >
            {connecting ? (
              <LoaderCircle
                className='size-4 animate-spin'
                aria-hidden='true'
              />
            ) : (
              <WalletMark iconUrl={wallet?.iconUrl} />
            )}
            <span>{chainName}</span>
            <span
              aria-hidden='true'
              className={`size-1.5 rounded-full ${wallet ? 'bg-emerald-500' : 'bg-stone-400'}`}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align='end'
          className='w-72 max-w-[calc(100vw-2rem)] rounded-xl'
          onCloseAutoFocus={event => {
            if (seedOpen) event.preventDefault();
          }}
        >
          <div className='border-b px-2 py-2 text-sm font-medium'>
            {chainName} wallet{' '}
            <span className='font-normal text-stone-500'>({status})</span>
          </div>
          {connecting && (
            <p role='status' className='p-2 text-sm'>
              Connecting… {progress}
            </p>
          )}
          {error && (
            <p
              role='alert'
              className='text-destructive p-2 text-sm break-words'
            >
              {error}
            </p>
          )}
          {wallet && (
            <div className='space-y-1 border-b p-2 text-sm'>
              <p className='flex items-center gap-2'>
                <WalletMark iconUrl={wallet.iconUrl} />
                <span className='break-all'>{wallet.name}</span>
              </p>
              <p>
                {wallet.kind === 'seed' ? 'Seed wallet' : 'Browser wallet'} ·
                Connected
              </p>
              <p className='font-mono text-xs break-all'>
                {wallet.accountDetail}
              </p>
            </div>
          )}
          {children}
          {!choices.length && (
            <p className='p-2 text-sm text-stone-500'>
              No {chainName} wallet extension found. Enable an extension for
              this page, then refresh wallets.
            </p>
          )}
          {choices.map(choice => (
            <DropdownMenuItem
              key={choice.id}
              disabled={connecting}
              onSelect={event => {
                event.preventDefault();
                choice.connect();
              }}
            >
              <WalletMark iconUrl={choice.iconUrl} />
              <span className='break-all'>Connect {choice.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            disabled={connecting}
            onSelect={() => setSeedOpen(true)}
          >
            <KeyRound aria-hidden='true' />
            Use a seed wallet
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={event => {
              event.preventDefault();
              refresh();
            }}
          >
            <RefreshCw aria-hidden='true' />
            Refresh wallets
          </DropdownMenuItem>
          {(wallet || connecting) && (
            <DropdownMenuItem
              variant='destructive'
              onSelect={event => {
                event.preventDefault();
                disconnect();
              }}
            >
              Disconnect {chainName} wallet
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <SeedWalletDialog
        chainName={chainName}
        open={seedOpen}
        onOpenChange={setSeedOpen}
        returnFocus={trigger}
        onInstall={seed => {
          changeOpen(true);
          installSeed(seed);
        }}
      />
    </>
  );
}
