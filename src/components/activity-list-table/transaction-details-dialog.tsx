'use client';

import { ExternalLink } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import type { ActivityTransaction } from './index';

interface TransactionDetailsDialogProps {
  transaction: ActivityTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransactionDetailsDialog({
  transaction,
  open,
  onOpenChange,
}: TransactionDetailsDialogProps) {
  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transaction.type} Details</DialogTitle>
          <DialogDescription>Status: {transaction.status}</DialogDescription>
        </DialogHeader>
        <div className='ds-stack-control ds-body'>
          <p>{transaction.timestamp}</p>
          {transaction.fromToken && <p>From: {transaction.fromToken.amount}</p>}
          {transaction.toToken && <p>To: {transaction.toToken.amount}</p>}
          {transaction.failureReason && (
            <p className='ds-round ds-surface-error ds-inset-control ds-error break-all'>
              {transaction.failureReason}
            </p>
          )}
          {transaction.requestId && (
            <p className='break-all'>Request ID: {transaction.requestId}</p>
          )}
          {transaction.transactionHash && (
            <p className='break-all'>
              Transaction: {transaction.transactionHash}
            </p>
          )}
          {transaction.explorerUrl && (
            <a
              href={transaction.explorerUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='ds-row ds-tight ds-link'
            >
              View Sepolia transaction
              <ExternalLink className='h-3 w-3' />
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
