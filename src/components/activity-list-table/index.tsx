import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/feedback';
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
  requestId?: string;
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
      <div className='ds-control-gap sm:ds-content-gap flex min-w-0 items-center'>
        <WalletIcon className='ds-muted h-4 w-4 flex-shrink-0 sm:h-5 sm:w-5' />
        <div className='ds-tight flex min-w-0 flex-col'>
          <div className='ds-caption ds-label ds-muted sm:ds-body'>
            <TruncatedText
              text={token.amount}
              prefixLength={4}
              suffixLength={3}
              copyable={true}
            />
          </div>
          <div className='ds-caption ds-label ds-muted'>Wallet</div>
        </div>
      </div>
    );
  }

  return (
    <div className='ds-control-gap sm:ds-content-gap flex min-w-0 items-center'>
      <div className='flex-shrink-0'>
        <CryptoIcon chain={token.chain} token={token.symbol} />
      </div>
      <div className='ds-tight flex min-w-0 flex-col'>
        <div className='ds-caption ds-label ds-muted sm:ds-body truncate'>
          {token.amount}
        </div>
        <div className='ds-caption ds-label ds-muted truncate'>
          {token.usdValue}
        </div>
      </div>
    </div>
  );
}

function DetailsCell({ transaction }: DetailsCellProps) {
  const showsTokenDestination = transaction.type !== 'Withdraw';

  return (
    <div className='ds-control-gap sm:ds-content-gap flex max-w-full min-w-0 items-center'>
      <div className='flex-shrink-0'>
        <TokenDisplay token={transaction.fromToken} />
      </div>

      <ArrowRight className='ds-muted h-4 w-4 shrink-0 sm:h-5 sm:w-5' />

      {showsTokenDestination ? (
        <div className='flex-shrink-0'>
          <TokenDisplay token={transaction.toToken} />
        </div>
      ) : (
        <div className='ds-tight sm:ds-control-gap flex min-w-0 items-center'>
          <WalletIcon className='ds-muted h-4 w-4 shrink-0 sm:h-5 sm:w-5' />
          <div className='ds-caption ds-label ds-muted sm:ds-body min-w-0'>
            {transaction.address ? (
              <TruncatedText
                text={transaction.address}
                prefixLength={4}
                suffixLength={3}
                copyable={true}
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

  const tone =
    status === 'completed'
      ? 'success'
      : status === 'failed'
        ? 'error'
        : status === 'refunded'
          ? 'warning'
          : 'pending';
  return (
    <Badge variant={tone}>
      <StatusDot tone={tone} />
      {displayLabel}
    </Badge>
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
      <div className='ds-after-content'>
        <h2 className='ds-muted ds-label ds-section-title self-start'>
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
                onClick={() => handleRowClick(transaction)}
              >
                <TableCell>
                  <div className='ds-muted ds-caption ds-label sm:ds-body'>
                    {transaction.type}
                  </div>
                </TableCell>
                <TableCell>
                  <DetailsCell transaction={transaction} />
                </TableCell>
                <TableCell className='hidden sm:table-cell'>
                  <div className='ds-caption ds-label ds-text sm:ds-body'>
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
                      className='inline-block h-5 w-5'
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink className='ds-muted h-5 w-5' />
                    </a>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={5}
                className='ds-muted ds-block-inset-section text-center'
              >
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
