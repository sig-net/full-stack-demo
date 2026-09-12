'use client';

import { toast } from 'sonner';

import { parseTokenAmount } from '@/lib/utils/token-amount';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useVaultOperations } from '@/providers/vault-operations-context';
import { useVaultBalances } from '@/providers/vault-balances-context';
import { useVault } from '@/providers/vault-context';
import { useMidnightProgress } from '@/hooks/use-midnight-progress';

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
  const operations = useVaultOperations();
  const balances = useVaultBalances();
  const vault = useVault();
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
      try {
        vault.requireBinding();
        const token =
          balances.balances?.perToken[data.token.address.toLowerCase()];
        if (token?.decimals == null || token.vaultUnits == null)
          throw new Error(
            'Balance or token decimals are unavailable. Refresh and retry.',
          );
        const units = parseTokenAmount(data.amount, token.decimals);
        if (units > token.vaultUnits)
          throw new Error('Insufficient shielded balance.');
        void operations
          .withdraw(data.token.address, units, data.receiverAddress)
          .catch(() => {});
        onClose();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Withdrawal is unavailable.',
        );
      }
    }
  };

  return (
    <>
      <DialogTitle>Send</DialogTitle>
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <AmountInput
          availableTokens={availableTokens}
          transactionReady={operations.ready}
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
