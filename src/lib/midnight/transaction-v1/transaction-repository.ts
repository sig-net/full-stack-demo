import type { MidnightTransaction } from '@/lib/midnight/transaction-v1/transaction'
import type { Repository } from '@/lib/repository/repository'

export type MidnightTransactionRepository = Repository<MidnightTransaction>
