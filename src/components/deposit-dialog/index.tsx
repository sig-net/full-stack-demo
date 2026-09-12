'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState } from '@/components/states/LoadingState';
import { TokenConfig, NetworkData } from '@/lib/constants/token-metadata';
import { useMidnightWallet } from '@/providers/midnight-context';
import { useMidnightProgress } from '@/hooks/use-midnight-progress';
import { flow } from '@/lib/midnight/flow';

import { TokenSelection } from './token-selection';
import { DepositAddress } from './deposit-address';

interface DepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DepositDialog({ open, onOpenChange }: DepositDialogProps) {
  const [selectedToken, setSelectedToken] = useState<TokenConfig | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkData | null>(
    null,
  );

  const midnight = useMidnightWallet();
  const progress = useMidnightProgress();

  const isVaultEvmDeposit =
    midnight.connected && selectedNetwork?.chain === 'ethereum';
  const step =
    selectedToken && selectedNetwork ? 'show-address' : 'select-token';

  const handleTokenSelect = (token: TokenConfig, network: NetworkData) => {
    setSelectedToken(token);
    setSelectedNetwork(network);
  };

  const handleContinue = async () => {
    if (!selectedToken || !selectedNetwork) return;
    if (progress.active) return;

    if (selectedNetwork.chain === 'midnight') {
      handleClose();
      return;
    }

    if (isVaultEvmDeposit) {
      const erc20 = selectedToken.erc20Address;
      const units =
        midnight.balances?.perToken[erc20.toLowerCase()]?.depositUnits ?? 0n;
      if (units === 0n) {
        toast.error(`No ${selectedToken.symbol} at the deposit address`, {
          description: `Send Sepolia ${selectedToken.symbol} to the address above first.`,
        });
        return;
      }
      // Reset before closing so the toaster cannot replay a terminal failure during startup.
      flow.reset();
      midnight.deposit(erc20, units).catch(() => {
        /* surfaced by MidnightProgressToaster via flow.fail */
      });
      handleClose();
      return;
    }
  };

  const handleClose = () => {
    setSelectedToken(null);
    setSelectedNetwork(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='gradient-popover max-h-[90vh] max-w-md overflow-y-auto rounded-sm p-5 shadow-[0px_4px_9.3px_0px_rgba(41,86,70,0.35)] sm:p-10'>
        {step === 'select-token' && (
          <div className='space-y-5'>
            <DialogHeader className='space-y-0 p-0'>
              <DialogTitle className='text-dark-neutral-400 text-xl font-semibold'>
                Select an asset
              </DialogTitle>
            </DialogHeader>
            <TokenSelection onTokenSelect={handleTokenSelect} />
          </div>
        )}

        {step === 'show-address' && selectedToken && selectedNetwork && (
          <div className='space-y-5'>
            <DialogHeader className='space-y-0 p-0'>
              <DialogTitle className='text-dark-neutral-400 text-xl font-semibold'>
                Deposit Address
              </DialogTitle>
            </DialogHeader>
            {isVaultEvmDeposit && progress.active ? (
              <LoadingState message={progress.message} />
            ) : (
              <DepositAddress
                token={selectedToken}
                network={selectedNetwork}
                depositAddress={
                  selectedNetwork.chain === 'midnight'
                    ? midnight.shieldedAddress
                    : midnight.depositAddress
                }
                isSubmitting={progress.active}
                onContinue={handleContinue}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
