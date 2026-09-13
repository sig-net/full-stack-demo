'use client';

import { useId, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function SeedWalletDialog({
  chainName,
  open,
  onOpenChange,
  onInstall,
  returnFocus,
}: {
  chainName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (seed: string) => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const id = useId();
  const [seed, setSeed] = useState('');
  const changeOpen = (value: boolean) => {
    setSeed('');
    onOpenChange(value);
  };
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className='rounded-xl'
        onCloseAutoFocus={event => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{chainName} seed wallet</DialogTitle>
          <DialogDescription>
            A hexadecimal seed (16–64 bytes, optional 0x) creates a wallet that
            signs in this page. Keys stay in tab memory. Refresh requires
            re-entry. A wallet seed is separate from your vault identity secret.
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-3'
          onSubmit={event => {
            event.preventDefault();
            const value = seed.trim();
            if (!value) return;
            changeOpen(false);
            onInstall(value);
          }}
        >
          <label htmlFor={id}>{chainName} seed</label>
          <Input
            id={id}
            type='password'
            autoComplete='off'
            spellCheck={false}
            value={seed}
            onChange={event => setSeed(event.target.value)}
          />
          <div className='flex flex-wrap justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={!seed.trim()}>
              Install {chainName} seed wallet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
