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
import { useVaultBalances } from '@/providers/vault-balances-context';
import { useVaultOperations } from '@/providers/vault-operations-context';
import { useMidnightConnection } from '@/providers/midnight-wallet-context';
import { useMidnightProgress } from '@/hooks/use-midnight-progress';
import { useVault } from '@/providers/vault-context';
import { useEvmWallet } from '@/providers/evm-wallet-context';

import { TokenSelection } from './token-selection';
import { EvmDepositTransfer } from './evm-deposit-transfer';
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

  const balances = useVaultBalances();
  const operations = useVaultOperations();
  const connection = useMidnightConnection();
  const evm = useEvmWallet();
  const vault = useVault();
  const progress = useMidnightProgress();

  const isVaultEvmDeposit =
    vault.binding !== null && selectedNetwork?.chain === 'ethereum';
  const step =
    selectedToken && selectedNetwork ? 'show-address' : 'select-token';

  const handleTokenSelect = (token: TokenConfig, network: NetworkData) => {
    setSelectedToken(token);
    setSelectedNetwork(network);
  };

  const recordedTransfer =
    evm.transfer?.binding === vault.binding &&
    evm.transfer?.destination === (vault.binding?.depositAddress ?? '') &&
    evm.transfer?.token === selectedToken?.erc20Address &&
    evm.transfer.status !== 'error' &&
    evm.transfer.sweep !== 'complete'
      ? evm.transfer
      : null;

  const handleContinue = async () => {
    if (!selectedToken || !selectedNetwork) return;
    if (progress.active) return;

    if (selectedNetwork.chain === 'midnight') {
      handleClose();
      return;
    }

    if (isVaultEvmDeposit) {
      if (recordedTransfer) {
        if (recordedTransfer.status === 'confirmed')
          await evm.continueDeposit();
        return;
      }
      const erc20 = selectedToken.erc20Address;
      const units =
        balances.balances?.perToken[erc20.toLowerCase()]?.depositUnits;
      if (units == null) {
        toast.error(
          'Deposit balance is unavailable. Refresh balances and retry.',
        );
        void balances.refresh().catch(() => {});
        return;
      }
      if (units === 0n) {
        toast.error(`No ${selectedToken.symbol} at the deposit address`, {
          description: `Send Sepolia ${selectedToken.symbol} to the address above first.`,
        });
        return;
      }
      operations.deposit(erc20, units).catch(() => {
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
            {selectedNetwork.chain === 'ethereum' && (
              <EvmDepositTransfer token={selectedToken} />
            )}
            {isVaultEvmDeposit && progress.active ? (
              <LoadingState message={progress.message} />
            ) : (
              <DepositAddress
                token={selectedToken}
                network={selectedNetwork}
                depositAddress={
                  selectedNetwork.chain === 'midnight'
                    ? (connection.wallet?.shieldedAddress ?? '')
                    : (vault.binding?.depositAddress ?? '')
                }
                isSubmitting={progress.active}
                showContinue={!recordedTransfer}
                canContinue={operations.ready}
                onContinue={handleContinue}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
