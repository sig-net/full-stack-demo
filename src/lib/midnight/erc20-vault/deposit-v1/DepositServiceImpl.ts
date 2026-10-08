import 'server-only'

import { randomUUID } from 'node:crypto'

import { type Caller, resourceOwnedByCaller } from '@/lib/caller/caller'
import { getDatabase } from '@/lib/db/database'
import { type Deposit, depositName } from '@/lib/midnight/erc20-vault/deposit-v1/Deposit'
import type { DepositRepository } from '@/lib/midnight/erc20-vault/deposit-v1/DepositRepository'
import { DepositRepositorySQLImpl } from '@/lib/midnight/erc20-vault/deposit-v1/DepositRepositorySQLImpl'
import type {
  CreateDepositArgs,
  DepositService,
  GetDepositArgs,
} from '@/lib/midnight/erc20-vault/deposit-v1/DepositService'

export class DepositServiceImpl implements DepositService {
  private readonly depositRepository: DepositRepository

  constructor(depositRepository: DepositRepository) {
    this.depositRepository = depositRepository
  }

  createDeposit(caller: Caller, args: CreateDepositArgs): Promise<Deposit> {
    return this.depositRepository.upsertDeposit({
      ...args,
      name: depositName(caller.name, randomUUID()),
    })
  }

  async getDeposit(caller: Caller, args: GetDepositArgs): Promise<Deposit | undefined> {
    if (!resourceOwnedByCaller(args.name, caller)) return undefined
    return this.depositRepository.getDeposit(args.name)
  }
}

// One service serves the whole server process.
let service: Promise<DepositService> | undefined

export function getDepositService(): Promise<DepositService> {
  service ??= getDatabase()
    .then((database) => new DepositServiceImpl(new DepositRepositorySQLImpl(database)))
    .catch((error: unknown) => {
      service = undefined
      throw error
    })
  return service
}
