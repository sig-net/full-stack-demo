import { useState } from 'react';
import { ArrowRight, ExternalLink, WalletIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { TruncatedText } from '@/components/ui/truncated-text';
import { useMidnightTransactions } from '@/hooks/use-midnight-transactions';
import { useVault } from '@/providers/vault-context';
import type { MidnightTxRecord } from '@/lib/midnight/tx-history';

import { CryptoIcon } from '../balance-display/crypto-icon';
import { TransactionDetailsDialog } from './transaction-details-dialog';

export interface ActivityTransaction {
  id: string;
  type: MidnightTxRecord['type'];
  fromToken?: {
    symbol: string;
    chain: string;
    amount: string;
    usdValue: string;
  };
  toToken?: {
    symbol: string;
    chain: string;
    amount: string;
    usdValue: string;
  };
  address?: string;
  timestamp: string;
  timestampRaw?: number;
  status: MidnightTxRecord['status'];
  transactionHash?: string;
  explorerUrl?: string;
  failureReason?: string;
}

interface ActivityListTableProps {
  className?: string;
}

interface TokenDisplayProps {
  token?: {
    symbol: string;
    chain: string;
    amount: string;
    usdValue: string;
  };
}

interface DetailsCellProps {
  transaction: ActivityTransaction;
}

interface StatusBadgeProps {
  status: MidnightTxRecord['status'];
}

function TokenDisplay({ token }: TokenDisplayProps) {
  if (!token) return null;

  if (token.symbol === 'WALLET') {
    return (
      <div className='flex min-w-0 items-center gap-2 sm:gap-4'>
        <WalletIcon className='text-tundora-50 h-4 w-4 flex-shrink-0 sm:h-5 sm:w-5' />
        <div className='flex min-w-0 flex-col gap-1'>
          <div className='text-xs font-medium text-stone-600 sm:text-sm'>
            <TruncatedText
              text={token.amount}
              prefixLength={4}
              suffixLength={3}
              copyable={true}
              className='transition-colors hover:text-blue-600'
            />
          </div>
          <div className='text-xs font-semibold text-stone-400'>Wallet</div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex min-w-0 items-center gap-2 sm:gap-4'>
      <div className='flex-shrink-0'>
        <CryptoIcon chain={token.chain} token={token.symbol} />
      </div>
      <div className='flex min-w-0 flex-col gap-1'>
        <div className='truncate text-xs font-medium text-stone-600 sm:text-sm'>
          {token.amount}
        </div>
        <div className='truncate text-xs font-semibold text-stone-400'>
          {token.usdValue}
        </div>
      </div>
    </div>
  );
}

function DetailsCell({ transaction }: DetailsCellProps) {
  const showsTokenDestination = transaction.type !== 'Withdraw';

  return (
    <div className='flex max-w-full min-w-0 items-center gap-2 sm:gap-4'>
      <div className='flex-shrink-0'>
        <TokenDisplay token={transaction.fromToken} />
      </div>

      <ArrowRight className='text-tundora-50 h-4 w-4 shrink-0 sm:h-5 sm:w-5' />

      {showsTokenDestination ? (
        <div className='flex-shrink-0'>
          <TokenDisplay token={transaction.toToken} />
        </div>
      ) : (
        <div className='flex min-w-0 items-center gap-1 sm:gap-2'>
          <WalletIcon className='text-tundora-50 h-4 w-4 shrink-0 sm:h-5 sm:w-5' />
          <div className='min-w-0 text-xs font-medium text-stone-600 sm:text-sm'>
            {transaction.address ? (
              <TruncatedText
                text={transaction.address}
                prefixLength={4}
                suffixLength={3}
                copyable={true}
                className='transition-colors hover:text-blue-600'
              />
            ) : (
              'Unknown'
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: StatusBadgeProps) {
  const displayLabel =
    status === 'completed'
      ? 'Completed'
      : status === 'failed'
        ? 'Failed'
        : status === 'refunded'
          ? 'Refunded'
          : 'Pending';

  const variants = {
    pending: 'bg-colors-pastels-polar-100 border-colors-dark-neutral-50',
    completed: 'bg-colors-pastels-polar-100 border-colors-dark-neutral-50',
    failed: 'bg-red-50 border-red-200',
    refunded: 'bg-amber-50 border-amber-200',
  } as const;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5',
        variants[status],
      )}
    >
      <div
        className={cn(
          'h-2 w-2 rounded-full',
          status === 'refunded'
            ? 'bg-amber-500'
            : status === 'failed'
              ? 'bg-red-500'
              : status === 'pending'
                ? 'animate-pulse bg-blue-500'
                : 'bg-success-500',
        )}
      />
      <span className='text-colors-dark-neutral-500 text-xs font-medium'>
        {displayLabel}
      </span>
    </div>
  );
}

export function ActivityListTable({ className }: ActivityListTableProps) {
  const vault = useVault();
  const [selectedTransaction, setSelectedTransaction] =
    useState<ActivityTransaction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const midnightTxs = useMidnightTransactions();

  const allTransactions = [...midnightTxs]
    .filter((tx, index, self) => self.findIndex(t => t.id === tx.id) === index)
    .sort((a, b) => {
      const aTime = a.timestampRaw || 0;
      const bTime = b.timestampRaw || 0;
      return bTime - aTime;
    });

  const displayTransactions = allTransactions.slice(0, 5);

  const handleRowClick = (transaction: ActivityTransaction) => {
    setSelectedTransaction(transaction);
    setDialogOpen(true);
  };

  return (
    <div className={cn('w-full', className)}>
      <div className='mb-6'>
        <h2 className='text-dark-neutral-200 self-start font-semibold uppercase'>
          Activity
        </h2>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-20 sm:w-24'>Activity</TableHead>
            <TableHead>Details</TableHead>
            <TableHead className='hidden w-20 sm:table-cell sm:w-28'>
              Timestamp
            </TableHead>
            <TableHead className='w-20 sm:w-24'>Status</TableHead>
            <TableHead className='hidden w-12 sm:table-cell sm:w-16'>
              <span className='sr-only sm:not-sr-only'>Explorer</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayTransactions.length > 0 ? (
            displayTransactions.map(transaction => (
              <TableRow
                key={transaction.id}
                className='cursor-pointer transition-colors hover:bg-gray-50'
                onClick={() => handleRowClick(transaction)}
              >
                <TableCell>
                  <div className='text-tundora-50 text-xs font-medium sm:text-sm'>
                    {transaction.type}
                  </div>
                </TableCell>
                <TableCell>
                  <DetailsCell transaction={transaction} />
                </TableCell>
                <TableCell className='hidden sm:table-cell'>
                  <div className='text-xs font-medium text-stone-700 sm:text-sm'>
                    {transaction.timestamp}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={transaction.status} />
                </TableCell>
                <TableCell className='hidden sm:table-cell'>
                  {transaction.explorerUrl ? (
                    <a
                      href={transaction.explorerUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='inline-block h-5 w-5 transition-opacity hover:opacity-80'
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink className='text-tundora-50 h-5 w-5' />
                    </a>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className='py-8 text-center text-gray-500'>
                {vault.binding !== null
                  ? 'No transactions found. Deposit, withdraw, or swap to see activity.'
                  : 'Connect your wallet to view transaction activity.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <TransactionDetailsDialog
        transaction={
          midnightTxs.find(tx => tx.id === selectedTransaction?.id) ?? null
        }
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
