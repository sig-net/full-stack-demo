'use client';

import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, SendIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TokenAmountDisplay } from '@/components/ui/token-amount-display';
import { useTokenPrice } from '@/hooks/use-token-prices';
import type { Token } from '@/lib/types/token.types';

import { WithdrawToken } from './index';

interface FormData {
  amount: string;
  receiverAddress: string;
}

interface AmountInputProps {
  availableTokens: WithdrawToken[];
  transactionReady: boolean;
  onSubmit: (data: {
    token: WithdrawToken;
    amount: string;
    receiverAddress: string;
  }) => void;
  preSelectedToken?: WithdrawToken | null;
}

export function AmountInput({
  availableTokens,
  transactionReady,
  onSubmit,
  preSelectedToken,
}: AmountInputProps) {
  const [selectedToken, setSelectedToken] = useState<WithdrawToken | undefined>(
    preSelectedToken || availableTokens[0] || undefined,
  );
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: priceData } = useTokenPrice(selectedToken?.symbol ?? '');

  const { register, handleSubmit, setValue, watch } = useForm<FormData>({
    defaultValues: {
      amount: '',
      receiverAddress: '',
    },
  });

  const watchedAmount = watch('amount');
  const watchedAddress = watch('receiverAddress');

  // Update selected token when preSelectedToken changes
  useEffect(() => {
    if (preSelectedToken) {
      setSelectedToken(preSelectedToken);
    }
  }, [preSelectedToken]);

  const onFormSubmit = (data: FormData) => {
    if (isSubmitting) return;
    if (!selectedToken) {
      setError('Please select a token');
      return;
    }

    if (parseFloat(data.amount) > parseFloat(selectedToken.balance)) {
      setError('Amount exceeds available balance');
      return;
    }

    setIsSubmitting(true);
    setError('');
    onSubmit({
      token: selectedToken,
      amount: data.amount,
      receiverAddress: data.receiverAddress,
    });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className='ds-stack-content'>
      {/* Token Selection */}
      <div>
        <TokenAmountDisplay
          value={watchedAmount}
          onChange={value => setValue('amount', value)}
          tokens={availableTokens.map(t => ({
            erc20Address: t.address,
            symbol: t.symbol,
            name: t.name,
            decimals: t.decimals,
            chain: t.chain,
            balance: t.balance,
          }))}
          selectedToken={
            selectedToken
              ? ({
                  erc20Address: selectedToken.address,
                  symbol: selectedToken.symbol,
                  name: selectedToken.name,
                  decimals: selectedToken.decimals,
                  chain: selectedToken.chain,
                  balance: selectedToken.balance,
                } as Token & { balance: string })
              : undefined
          }
          onTokenSelect={token => {
            const mapped: WithdrawToken = {
              symbol: token.symbol,
              name: token.name,
              chain: token.chain,
              chainName:
                token.chain === 'ethereum' ? 'Ethereum Sepolia' : 'Midnight',
              address: token.erc20Address,
              balance: token.balance,
              decimals: token.decimals,
            };
            setSelectedToken(mapped);
            setValue('amount', '');
            setError('');
          }}
          usdValue={`≈ $${
            watchedAmount && priceData?.usd
              ? (parseFloat(watchedAmount) * priceData.usd).toFixed(2)
              : '0.00'
          }`}
          placeholder='0.00'
        />
      </div>

      {/* Receiver Address */}
      <div className='ds-stack-control'>
        <Label>Receiver Address</Label>
        <Input
          placeholder='Recipient address'
          {...register('receiverAddress')}
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='none'
          spellCheck={false}
          enterKeyHint='done'
        />
      </div>

      {error && (
        <div className='ds-row ds-control-gap ds-round ds-frame ds-surface-error ds-inset-control'>
          <div className='ds-circle ds-dot-error h-2 w-2 shrink-0'></div>
          <p className='ds-caption ds-label ds-error'>{error}</p>
        </div>
      )}

      <Button
        type='submit'
        variant='secondary'
        disabled={
          !transactionReady ||
          isSubmitting ||
          !selectedToken ||
          !watchedAmount ||
          !watchedAddress
        }
        className='w-full'
        size='lg'
      >
        {isSubmitting ? (
          <>
            <Loader2 className='ds-spinner size-4' />
            Sending...
          </>
        ) : (
          <>
            <SendIcon className='size-4' />
            Send
          </>
        )}
      </Button>
    </form>
  );
}
