import 'server-only'

import { z } from 'zod'

import { resolveCaller } from '@/lib/caller/resolve-caller'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import {
  getTransactionArgsSchema,
  type TransactionService,
} from '@/lib/midnight/transaction-v1/transaction-service'
import type { Logger } from '@/lib/logging/logger'

export class TransactionServiceAdaptor {
  private readonly transactionService: TransactionService
  private readonly logger: Logger

  constructor(transactionService: TransactionService, logger: Logger) {
    this.transactionService = transactionService
    this.logger = logger
  }

  async getTransaction(callerSecret: string, args: unknown): Promise<TransactionResult> {
    const caller = resolveCaller(callerSecret)
    this.logger.debug('method called', { method: 'getTransaction', caller: caller.name })
    const parsed = getTransactionArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: z.prettifyError(parsed.error) }
    }
    const transaction = await this.transactionService.getTransaction(caller, parsed.data)
    if (transaction === undefined) {
      return { ok: false, error: `${parsed.data.name} was not found.` }
    }
    return { ok: true, transaction }
  }
}

export type TransactionResult =
  | { readonly ok: true; readonly transaction: MidnightTransaction }
  | { readonly ok: false; readonly error: string }
