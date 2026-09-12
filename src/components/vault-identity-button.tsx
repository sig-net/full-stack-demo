'use client';

import { useState } from 'react';
import { bytesToHex } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { useVault } from '@/providers/vault-context';

export function VaultIdentityButton() {
  const vault = useVault();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [validation, setValidation] = useState('');
  const { copyToClipboard, isCopied, error, reset } = useCopyToClipboard();
  const changeOpen = (value: boolean) => {
    setOpen(value);
    setInput(value ? vault.identitySecret : '');
    setValidation('');
    reset();
  };
  return (
    <>
      <Button variant='outline' onClick={() => changeOpen(true)}>
        {vault.identitySecret ? 'Vault identity' : 'Set vault identity'}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vault identity</DialogTitle>
            <DialogDescription>
              Generate or paste an independent 32-byte secret. Keep a copy to
              access this identity again. It stays in page memory and refresh
              requires re-entry.
            </DialogDescription>
          </DialogHeader>
          <form
            className='flex flex-col gap-3'
            onSubmit={event => {
              event.preventDefault();
              try {
                vault.setIdentitySecret(input);
                changeOpen(false);
              } catch (failure) {
                setValidation((failure as Error).message);
              }
            }}
          >
            <label htmlFor='vault-secret'>Vault secret</label>
            <Input
              id='vault-secret'
              type='password'
              autoComplete='off'
              spellCheck={false}
              value={input}
              onChange={event => {
                setInput(event.target.value);
                setValidation('');
                reset();
              }}
              placeholder='64 hexadecimal characters'
            />
            {validation && <p role='alert'>{validation}</p>}
            <div className='flex gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setInput(
                    bytesToHex(
                      crypto.getRandomValues(new Uint8Array(32)),
                    ).slice(2),
                  );
                  reset();
                  setValidation('');
                }}
              >
                Generate secret
              </Button>
              <Button
                type='button'
                variant='outline'
                disabled={!input}
                onClick={() => void copyToClipboard(input)}
              >
                {isCopied ? 'Copied' : 'Copy secret'}
              </Button>
            </div>
            {error && (
              <p role='alert'>
                Copy failed. Allow clipboard access and try again.
              </p>
            )}
            <Button type='submit' disabled={!input.trim()}>
              Use vault secret
            </Button>
            {vault.identitySecret && (
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  vault.clearIdentity();
                  changeOpen(false);
                }}
              >
                Clear vault identity
              </Button>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
