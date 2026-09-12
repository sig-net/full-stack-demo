'use client';

import { toast } from 'sonner';

import { parseUnits } from 'viem';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useMidnightWallet } from '@/providers/midnight-context';
import { useMidnightProgress } from '@/hooks/use-midnight-progress';
import { flow } from '@/lib/midnight/flow';

import { AmountInput } from './amount-input';

export interface WithdrawToken {
  symbol: string;
  name: string;
  chain: 'ethereum' | 'midnight';
  chainName: string;
  address: string;
  balance: string;
  decimals: number;
}

interface WithdrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTokens: WithdrawToken[];
  preSelectedToken?: WithdrawToken | null;
}

function WithdrawDialogContent({
  availableTokens,
  preSelectedToken,
  onClose,
}: {
  availableTokens: WithdrawToken[];
  preSelectedToken?: WithdrawToken | null;
  onClose: () => void;
}) {
  const midnightWallet = useMidnightWallet();
  const midnight = useMidnightProgress();

  const handleAmountSubmit = async (data: {
    token: WithdrawToken;
    amount: string;
    receiverAddress: string;
  }) => {
    if (midnight.active) {
      toast.error('Transaction in progress', {
        description: 'Please wait for the current transaction to complete',
      });
      return;
    }
    if (data.token.chain === 'midnight') {
      const units = parseUnits(data.amount, data.token.decimals);
      // Reset before closing so the toaster cannot replay a terminal failure during startup.
      flow.reset();
      midnightWallet
        .withdraw(data.token.address, units, data.receiverAddress)
        .catch(() => {
          /* surfaced by MidnightProgressToaster via flow.fail */
        });
      onClose();
      return;
    }
  };

  return (
    <>
      <DialogTitle>Send</DialogTitle>
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <AmountInput
          availableTokens={availableTokens}
          onSubmit={handleAmountSubmit}
          preSelectedToken={preSelectedToken}
        />
      </div>
    </>
  );
}

export function WithdrawDialog({
  open,
  onOpenChange,
  availableTokens,
  preSelectedToken,
}: WithdrawDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[90vh] max-w-md flex-col overflow-hidden p-6 sm:p-8'>
        {open && (
          <WithdrawDialogContent
            availableTokens={availableTokens}
            preSelectedToken={preSelectedToken}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
