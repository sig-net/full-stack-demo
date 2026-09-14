"use client";

import { ExternalLink } from "lucide-react";
import type * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Feedback } from "@/components/ui/feedback";
import { PublicIdentifier } from "@/components/ui/public-identifier";

import type { ActivityTransaction } from "./index";

interface TransactionDetailsDialogProps {
  transaction: ActivityTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shows the selected transaction details in a modal when a record is available.
 *
 * @param properties - Selected record and dialog state controls.
 * @returns The transaction dialog or nothing when no record is selected.
 */
export function TransactionDetailsDialog(
  properties: TransactionDetailsDialogProps,
): React.JSX.Element | null {
  const { transaction, open, onOpenChange } = properties;
  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transaction.type} Details</DialogTitle>
          <DialogDescription>Status: {transaction.status}</DialogDescription>
        </DialogHeader>
        <div className="ds-stack-control ds-body">
          <p>{transaction.timestamp}</p>
          {transaction.fromToken && (
            <div>
              From:{" "}
              {transaction.fromToken.symbol === "WALLET" ? (
                <PublicIdentifier
                  value={transaction.fromToken.amount}
                  label="Source wallet address"
                />
              ) : (
                transaction.fromToken.amount
              )}
            </div>
          )}
          {transaction.toToken && (
            <div>
              To:{" "}
              {transaction.toToken.symbol === "WALLET" ? (
                <PublicIdentifier
                  value={transaction.toToken.amount}
                  label="Destination wallet address"
                />
              ) : (
                transaction.toToken.amount
              )}
            </div>
          )}
          {transaction.failureReason && (
            <Feedback tone={transaction.status === "interrupted" ? "warning" : "error"}>
              {transaction.failureReason}
            </Feedback>
          )}
          {transaction.requestId && (
            <div>
              <p>Request ID</p>
              <PublicIdentifier value={transaction.requestId} label="Request ID" />
            </div>
          )}
          {transaction.transactionHash && (
            <div>
              <p>Transaction</p>
              <PublicIdentifier value={transaction.transactionHash} label="Transaction hash" />
            </div>
          )}
          {transaction.explorerUrl && (
            <a
              href={transaction.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ds-row ds-tight ds-link"
            >
              View Sepolia transaction
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
