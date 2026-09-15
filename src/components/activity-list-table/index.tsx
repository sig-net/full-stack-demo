import { ArrowRight, ExternalLink, WalletIcon } from "lucide-react";
import type * as React from "react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/feedback";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMidnightTransactions } from "@/hooks/use-midnight-transactions";
import type { ExplorerAvailability } from "@/lib/explorer";
import type { MidnightTxRecord } from "@/lib/midnight/tx-history";
import { cn } from "@/lib/utils";
import { useVault } from "@/providers/vault-context";

import { CryptoIcon } from "../balance-display/crypto-icon";
import { TransactionDetailsDialog } from "./transaction-details-dialog";

/** Explorer destination of each captured leg, resolved once from the record's own chain. */
export interface ActivityExplorerLinks {
  readonly evmTransaction: ExplorerAvailability;
  readonly midnightTransaction: ExplorerAvailability;
  readonly fromAddress: ExplorerAvailability;
  readonly toAddress: ExplorerAvailability;
  readonly vaultContract: ExplorerAvailability;
}

/** Transaction record shape consumed by the activity table and details dialog. */
export interface ActivityTransaction {
  id: string;
  type: MidnightTxRecord["type"];
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
  status: MidnightTxRecord["status"];
  evmTransactionHash?: string;
  midnightTransactionHash?: string;
  requestId?: string;
  explorer: ActivityExplorerLinks;
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
  explorer: ExplorerAvailability;
}

interface DetailsCellProps {
  transaction: ActivityTransaction;
}

interface StatusBadgeProps {
  status: MidnightTxRecord["status"];
}

/**
 * Displays a token amount with its asset or wallet identity.
 *
 * @param properties - Token display data and the explorer destination of its wallet leg.
 * @returns The token display or nothing when no token is present.
 */
function TokenDisplay(properties: TokenDisplayProps): React.JSX.Element | null {
  const { token, explorer } = properties;
  if (!token) return null;

  if (token.symbol === "WALLET") {
    return (
      <div className="ds-control-gap sm:ds-content-gap flex min-w-0 items-center">
        <WalletIcon className="ds-muted h-4 w-4 flex-shrink-0 sm:h-5 sm:w-5" />
        <div className="ds-tight flex min-w-0 flex-col">
          <div className="ds-caption ds-label ds-muted sm:ds-body">
            <PublicIdentifier value={token.amount} label="Wallet address" explorer={explorer} />
          </div>
          <div className="ds-caption ds-label ds-muted">Wallet</div>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-control-gap sm:ds-content-gap flex min-w-0 items-center">
      <div className="flex-shrink-0">
        <CryptoIcon chain={token.chain} token={token.symbol} />
      </div>
      <div className="ds-tight flex min-w-0 flex-col">
        <div className="ds-caption ds-label ds-muted sm:ds-body truncate">{token.amount}</div>
        <div className="ds-caption ds-label ds-muted truncate">{token.usdValue}</div>
      </div>
    </div>
  );
}

/**
 * Arranges the source and destination details for one activity row.
 *
 * @param properties - Activity transaction data.
 * @returns The activity details cell.
 */
function DetailsCell(properties: DetailsCellProps): React.JSX.Element {
  const { transaction } = properties;
  const showsTokenDestination = transaction.type !== "Withdraw";

  return (
    <div className="ds-control-gap sm:ds-content-gap flex max-w-full min-w-0 items-center">
      <div className="flex-shrink-0">
        <TokenDisplay token={transaction.fromToken} explorer={transaction.explorer.fromAddress} />
      </div>

      <ArrowRight className="ds-muted h-4 w-4 shrink-0 sm:h-5 sm:w-5" />

      {showsTokenDestination ? (
        <div className="flex-shrink-0">
          <TokenDisplay token={transaction.toToken} explorer={transaction.explorer.toAddress} />
        </div>
      ) : (
        <div className="ds-tight sm:ds-control-gap flex min-w-0 items-center">
          <WalletIcon className="ds-muted h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
          <div className="ds-caption ds-label ds-muted sm:ds-body min-w-0">
            {transaction.address ? (
              <PublicIdentifier
                value={transaction.address}
                label="Recipient address"
                explorer={transaction.explorer.toAddress}
              />
            ) : (
              "Unknown"
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Maps transaction status to its label and semantic badge tone.
 *
 * @param properties - Transaction status data.
 * @returns The status badge.
 */
function StatusBadge(properties: StatusBadgeProps): React.JSX.Element {
  const { status } = properties;
  const displayLabel =
    status === "completed"
      ? "Completed"
      : status === "failed"
        ? "Failed"
        : status === "refunded"
          ? "Refunded"
          : status === "interrupted"
            ? "Observation interrupted"
            : "Pending";

  const tone =
    status === "completed"
      ? "success"
      : status === "failed"
        ? "error"
        : status === "refunded"
          ? "warning"
          : status === "interrupted"
            ? "warning"
            : "pending";
  return (
    <Badge variant={tone}>
      <StatusDot tone={tone} />
      {displayLabel}
    </Badge>
  );
}

/**
 * Lists recent activity and opens the selected transaction details.
 *
 * @param properties - Optional table classes.
 * @returns The activity table and details dialog.
 */
export function ActivityListTable(properties: ActivityListTableProps): React.JSX.Element {
  const { className } = properties;
  const vault = useVault();
  const [selectedTransaction, setSelectedTransaction] = useState<ActivityTransaction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const midnightTxs = useMidnightTransactions();

  const allTransactions = [...midnightTxs]
    .filter((tx, index, self) => self.findIndex((t) => t.id === tx.id) === index)
    .sort((a, b) => {
      const aTime = a.timestampRaw ?? 0;
      const bTime = b.timestampRaw ?? 0;
      return bTime - aTime;
    });

  const displayTransactions = allTransactions.slice(0, 5);

  const handleRowClick = (transaction: ActivityTransaction): void => {
    setSelectedTransaction(transaction);
    setDialogOpen(true);
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="ds-after-content">
        <h2 className="ds-muted ds-label ds-section-title self-start">Activity</h2>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20 sm:w-24">Activity</TableHead>
            <TableHead>Details</TableHead>
            <TableHead className="hidden w-20 sm:table-cell sm:w-28">Timestamp</TableHead>
            <TableHead className="w-20 sm:w-24">Status</TableHead>
            <TableHead className="hidden w-12 sm:table-cell sm:w-16">
              <span className="sr-only sm:not-sr-only">Explorer</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayTransactions.length > 0 ? (
            displayTransactions.map((transaction) => (
              <TableRow
                key={transaction.id}
                onClick={() => {
                  handleRowClick(transaction);
                }}
              >
                <TableCell>
                  <div className="ds-muted ds-caption ds-label sm:ds-body">{transaction.type}</div>
                </TableCell>
                <TableCell>
                  <DetailsCell transaction={transaction} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="ds-caption ds-label ds-text sm:ds-body">
                    {transaction.timestamp}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={transaction.status} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {transaction.explorer.evmTransaction.status === "available" && (
                    <Button asChild variant="ghost" size="icon-sm">
                      <a
                        href={transaction.explorer.evmTransaction.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${transaction.explorer.evmTransaction.label}: ${transaction.type} ${transaction.timestamp}`}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <ExternalLink aria-hidden="true" />
                      </a>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="ds-muted ds-block-inset-section text-center">
                {vault.binding !== null
                  ? "No transactions found. Deposit, withdraw, or swap to see activity."
                  : "Connect your wallet to view transaction activity."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <TransactionDetailsDialog
        transaction={midnightTxs.find((tx) => tx.id === selectedTransaction?.id) ?? null}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
