import 'server-only'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import type {
  GetTransactionArgs,
  TransactionService,
} from '@/lib/midnight/transaction-v1/transaction-service'

export class TransactionServiceImpl implements TransactionService {
  private readonly transactionRepository: MidnightTransactionRepository

  constructor(transactionRepository: MidnightTransactionRepository) {
    this.transactionRepository = transactionRepository
  }

  async getTransaction(
    caller: Caller,
    args: GetTransactionArgs,
  ): Promise<MidnightTransaction | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.transactionRepository.get(args.name)
  }
}
