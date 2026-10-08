import type { EthereumTransaction } from '@/lib/ethereum/transaction-v1/transaction'
import type { Repository } from '@/lib/repository/repository'

export type EthereumTransactionRepository = Repository<EthereumTransaction>
