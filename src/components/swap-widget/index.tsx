'use client';

import { Card, CardContent } from '@/components/ui/card';
import { useEffect, useState } from 'react';
import { ArrowDown, Settings2 } from 'lucide-react';
import { formatUnits } from 'viem';
import { parseTokenAmount } from '@/lib/utils/token-amount';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { TokenAmountDisplay } from '@/components/ui/token-amount-display';
import { MIDNIGHT_TOKENS } from '@/lib/constants/token-metadata';
import { useVault } from '@/providers/vault-context';
import { useVaultBalances } from '@/providers/vault-balances-context';
import { useVaultOperations } from '@/providers/vault-operations-context';
import { useMidnightProgress } from '@/hooks/use-midnight-progress';
import { useRuntimeConfig } from '@/providers/runtime-config-context';
import {
  discoverSwappablePairs,
  pairKey,
  quoteBestFeeExactInput,
} from '@/lib/midnight/evm-swap';
import type { Token } from '@/lib/types/token.types';

import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface SwapWidgetProps {
  className?: string;
}

const SLIPPAGE_PRESETS = [10n, 50n, 100n];
const DEFAULT_SLIPPAGE_BPS = 100n;

type TokenWithBalance = Token & { balance: string; units: bigint };

export function SwapWidget({ className }: SwapWidgetProps) {
  const { applied } = useRuntimeConfig();
  const vault = useVault();
  const { balances } = useVaultBalances();
  const operations = useVaultOperations();
  const progress = useMidnightProgress();

  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [fromToken, setFromToken] = useState<TokenWithBalance | undefined>();
  const [toToken, setToToken] = useState<TokenWithBalance | undefined>();
  const [swapping, setSwapping] = useState(false);
  const [slippageBps, setSlippageBps] = useState<bigint>(DEFAULT_SLIPPAGE_BPS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const enabled = vault.binding !== null;
  const rpc = enabled ? applied.evm.rpcUrl : null;
  const pairs = useQuery({
    queryKey: ['vault-swap-pairs', rpc],
    enabled: rpc !== null,
    queryFn: () =>
      discoverSwappablePairs(
        rpc!,
        MIDNIGHT_TOKENS.filter(token => !token.noSwap).map(
          token => token.erc20Address,
        ),
      ),
  });
  const swappablePairs = pairs.isError ? null : (pairs.data ?? null);
  const tokens: TokenWithBalance[] = MIDNIGHT_TOKENS.filter(
    token => !token.noSwap,
  ).flatMap(token => {
    const balance = balances?.perToken[token.erc20Address.toLowerCase()];
    if (balance?.decimals == null || balance.vaultUnits == null) return [];
    return [
      {
        ...token,
        chain: 'midnight' as const,
        decimals: balance.decimals,
        units: balance.vaultUnits,
        balance: formatUnits(balance.vaultUnits, balance.decimals),
      },
    ];
  });
  const fromTokens = swappablePairs
    ? tokens.filter(token =>
        tokens.some(
          other =>
            other.erc20Address !== token.erc20Address &&
            swappablePairs.has(pairKey(token.erc20Address, other.erc20Address)),
        ),
      )
    : [];
  const toTokens =
    swappablePairs && fromToken
      ? tokens.filter(
          token =>
            token.erc20Address !== fromToken.erc20Address &&
            swappablePairs.has(
              pairKey(fromToken.erc20Address, token.erc20Address),
            ),
        )
      : [];

  useEffect(() => {
    if (!enabled || fromTokens.length === 0) return;
    setFromToken(prev =>
      prev && fromTokens.some(t => t.erc20Address === prev.erc20Address)
        ? prev
        : (fromTokens.find(t => t.units > 0n) ?? fromTokens[0]),
    );
  }, [enabled, fromTokens]);

  useEffect(() => {
    if (toTokens.length === 0) return;
    setToToken(prev =>
      prev && toTokens.some(t => t.erc20Address === prev.erc20Address)
        ? prev
        : toTokens[0],
    );
  }, [toTokens]);

  const fromSel =
    fromToken && tokens.find(t => t.erc20Address === fromToken.erc20Address);
  const toSel =
    toToken && tokens.find(t => t.erc20Address === toToken.erc20Address);

  let quoteUnits: bigint | null = null;
  try {
    if (fromSel) quoteUnits = parseTokenAmount(fromAmount, fromSel.decimals);
  } catch {
    /* Invalid input disables the quote. */
  }
  const quote = useQuery({
    queryKey: [
      'vault-swap-quote',
      vault.binding?.sessionId,
      rpc,
      fromSel?.erc20Address,
      toSel?.erc20Address,
      quoteUnits?.toString(),
    ],
    enabled:
      enabled &&
      !!fromSel &&
      !!toSel &&
      quoteUnits !== null &&
      fromSel.erc20Address !== toSel.erc20Address,
    staleTime: 10_000,
    queryFn: () =>
      quoteBestFeeExactInput(
        rpc!,
        fromSel!.erc20Address,
        toSel!.erc20Address,
        quoteUnits!,
      ),
  });
  const fee = quote.isError ? null : (quote.data?.fee ?? null);
  const quoting = quote.isFetching;
  useEffect(() => {
    setToAmount(
      quote.data && !quote.isError && toSel
        ? formatUnits(quote.data.amountOut, toSel.decimals)
        : '',
    );
  }, [quote.data, quote.isError, toSel]);

  const amountValid = (() => {
    if (!fromSel || !toSel) return false;
    try {
      const spend = parseTokenAmount(fromAmount || '0', fromSel.decimals);
      return spend > 0n && spend <= fromSel.units;
    } catch {
      return false;
    }
  })();

  const inEntered = (() => {
    if (!fromSel) return false;
    try {
      return parseTokenAmount(fromAmount || '0', fromSel.decimals) > 0n;
    } catch {
      return false;
    }
  })();

  const canSwap =
    enabled &&
    !!fromSel &&
    !!toSel &&
    fromSel.erc20Address !== toSel.erc20Address &&
    amountValid &&
    fee !== null &&
    !quoting &&
    !progress.active &&
    !operations.busy &&
    operations.ready;

  const handleSwap = () => {
    if (!canSwap || !fromSel || !toSel || fee === null) return;
    const amountIn = parseTokenAmount(fromAmount, fromSel.decimals);
    setSwapping(true);
    operations
      .swap(
        fromSel.erc20Address,
        toSel.erc20Address,
        amountIn,
        fee,
        slippageBps,
      )
      .then(() => {
        setFromAmount('');
        setToAmount('');
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : 'Swap failed'),
      )
      .finally(() => setSwapping(false));
  };

  const noPool = inEntered && !quoting && fee === null;
  const buttonLabel = !enabled
    ? vault.status === 'disconnected'
      ? 'Connect Midnight to swap'
      : vault.status === 'missing-identity'
        ? 'Set a vault identity'
        : vault.status === 'loading'
          ? 'Loading vault…'
          : 'Retry vault loading'
    : pairs.isError
      ? 'Pools unavailable'
      : tokens.length === 0
        ? 'Balances unavailable'
        : swappablePairs === null
          ? 'Loading pools…'
          : swapping
            ? 'Swapping…'
            : quoting
              ? 'Fetching quote…'
              : noPool
                ? 'No pool for this pair'
                : 'Swap';

  return (
    <Card className={className}>
      <CardContent>
        <div className='ds-row justify-between'>
          <h2 className='ds-text ds-heading ds-label'>Swap</h2>
          <Button
            variant='ghost'
            size='icon'
            onClick={() => setSettingsOpen(true)}
            aria-label='Swap settings'
          >
            <Settings2 className='ds-muted h-6 w-6' />
          </Button>
        </div>

        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Swap settings</DialogTitle>
              <DialogDescription>
                Max slippage sets the minimum you receive for your spend. The
                swap reverts on-chain if the output would fall more than this
                below the quote.
              </DialogDescription>
            </DialogHeader>
            <div className='ds-control-gap flex flex-wrap'>
              {SLIPPAGE_PRESETS.map(bps => (
                <Button
                  key={String(bps)}
                  variant={slippageBps === bps ? 'secondary' : 'outline'}
                  size='sm'
                  onClick={() => setSlippageBps(bps)}
                >
                  {formatUnits(bps, 2)}%
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <div className='ds-stack-content'>
          <TokenAmountDisplay
            value={fromAmount}
            onChange={setFromAmount}
            tokens={enabled ? fromTokens : []}
            selectedToken={fromSel}
            onTokenSelect={t => setFromToken(t as TokenWithBalance)}
            placeholder='0'
            disabled={!enabled || progress.active}
          />

          <div className='flex justify-center'>
            <ArrowDown className='ds-muted h-5 w-5' />
          </div>

          <TokenAmountDisplay
            value={toAmount}
            onChange={() => {}}
            tokens={enabled ? toTokens : []}
            selectedToken={toSel}
            onTokenSelect={t => setToToken(t as TokenWithBalance)}
            placeholder='0'
            disabled={!enabled}
            readOnly
          />
        </div>

        <Button
          onClick={handleSwap}
          disabled={!canSwap}
          variant='secondary'
          size='lg'
          className='w-full'
        >
          {buttonLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
