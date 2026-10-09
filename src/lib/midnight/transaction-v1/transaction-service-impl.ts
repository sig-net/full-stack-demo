import 'server-only'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import type {
  GetTransactionArgs,
  ListTransactionsArgs,
  SubmitTransactionArgs,
  TransactionService,
} from '@/lib/midnight/transaction-v1/transaction-service'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'

export class TransactionServiceImpl implements TransactionService {
  private readonly transactionRepository: MidnightTransactionRepository
  private readonly stateController: MidnightTransactionStateController

  constructor(
    transactionRepository: MidnightTransactionRepository,
    stateController: MidnightTransactionStateController,
  ) {
    this.transactionRepository = transactionRepository
    this.stateController = stateController
  }

  async getTransaction(
    caller: Caller,
    args: GetTransactionArgs,
  ): Promise<MidnightTransaction | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.transactionRepository.get(args.name)
  }

  async listTransactions(
    caller: Caller,
    args: ListTransactionsArgs,
  ): Promise<MidnightTransaction[]> {
    if (!resourceOwnedByCaller(args.parent, caller)) return []
    return this.transactionRepository.search({
      criteria: [{ type: 'exact-text', field: 'parent', text: args.parent }],
      order: { field: 'createTime', direction: 'desc' },
    })
  }

  async submitTransaction(
    caller: Caller,
    args: SubmitTransactionArgs,
  ): Promise<MidnightTransaction> {
    if (!resourceOwnedByCaller(args.name, caller)) {
      throw new Error(`${args.name} does not exist`)
    }
    return this.stateController.submitTransaction({
      name: args.name,
      finalizedTx: args.finalizedTx,
    })
  }
}
