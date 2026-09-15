"use client";

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
import { REQUEST_ID_UNSUPPORTED } from "@/lib/explorer";

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
                  explorer={transaction.explorer.fromAddress}
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
                  explorer={transaction.explorer.toAddress}
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
              <PublicIdentifier
                value={transaction.requestId}
                label="Request ID"
                explorer={REQUEST_ID_UNSUPPORTED}
              />
            </div>
          )}
          {transaction.evmTransactionHash && (
            <div>
              <p>EVM settlement transaction</p>
              <PublicIdentifier
                value={transaction.evmTransactionHash}
                label="EVM settlement transaction hash"
                explorer={transaction.explorer.evmTransaction}
              />
            </div>
          )}
          {transaction.explorer.evmTransaction.status === "unavailable" && (
            <p className="ds-caption ds-muted">{transaction.explorer.evmTransaction.reason}</p>
          )}
          {transaction.midnightTransactionHash && (
            <div>
              <p>Midnight settlement transaction</p>
              <PublicIdentifier
                value={transaction.midnightTransactionHash}
                label="Midnight settlement transaction hash"
                explorer={transaction.explorer.midnightTransaction}
              />
            </div>
          )}
          {transaction.midnightTransactionHash &&
            transaction.explorer.midnightTransaction.status === "unavailable" && (
              <p className="ds-caption ds-muted">
                {transaction.explorer.midnightTransaction.reason}
              </p>
            )}
          {transaction.explorer.vaultContract.status === "available" && (
            <div>
              <p>Midnight vault contract</p>
              <a
                href={transaction.explorer.vaultContract.href}
                target="_blank"
                rel="noopener noreferrer"
                className="ds-row ds-tight ds-link"
              >
                {transaction.explorer.vaultContract.label}
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
