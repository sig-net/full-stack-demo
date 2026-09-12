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
      <DialogContent className='max-w-lg overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{transaction.type} Details</DialogTitle>
          <DialogDescription>Status: {transaction.status}</DialogDescription>
        </DialogHeader>
        <div className='space-y-3 text-sm'>
          <p>{transaction.timestamp}</p>
          {transaction.fromToken && <p>From: {transaction.fromToken.amount}</p>}
          {transaction.toToken && <p>To: {transaction.toToken.amount}</p>}
          {transaction.failureReason && (
            <p className='rounded-md bg-red-50 p-3 break-all text-red-800'>
              {transaction.failureReason}
            </p>
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
              className='flex items-center gap-1 text-blue-600 hover:underline'
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
