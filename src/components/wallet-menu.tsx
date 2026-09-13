'use client';

import { StatusDot } from '@/components/ui/feedback';
import { Feedback } from '@/components/ui/feedback';
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
          >
            {connecting ? (
              <LoaderCircle className='ds-spinner size-4' aria-hidden='true' />
            ) : (
              <WalletMark iconUrl={wallet?.iconUrl} />
            )}
            <span>{chainName}</span>
            <StatusDot tone={wallet ? 'success' : 'neutral'} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align='end'
          onCloseAutoFocus={event => {
            if (seedOpen) event.preventDefault();
          }}
        >
          <div className='ds-divider-bottom ds-body ds-label ds-inline-inset-control ds-block-inset-control'>
            {chainName} wallet <span className='ds-muted'>({status})</span>
          </div>
          {connecting && (
            <p role='status' className='ds-inset-control ds-body'>
              Connecting… {progress}
            </p>
          )}
          {error && (
            <Feedback tone='error' role='alert'>
              {error}
            </Feedback>
          )}
          {wallet && (
            <div className='ds-menu-section'>
              <p className='ds-row ds-control-gap'>
                <WalletMark iconUrl={wallet.iconUrl} />
                <span className='break-all'>{wallet.name}</span>
              </p>
              <p>
                {wallet.kind === 'seed' ? 'Seed wallet' : 'Browser wallet'} ·
                Connected
              </p>
              <p className='ds-value ds-caption break-all'>
                {wallet.accountDetail}
              </p>
            </div>
          )}
          {children}
          {!choices.length && (
            <p className='ds-inset-control ds-body ds-muted'>
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
