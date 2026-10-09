import 'server-only'

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { getServerConfig, type ServerConfig } from '@/lib/config/server-config'
import { createDatabase, createDatabasePool } from '@/lib/db/database'
import { UnitOfWork } from '@/lib/db/unit-of-work'
import type { EthereumTransactionRepository } from '@/lib/ethereum/transaction-v1/transaction-repository'
import { EthereumTransactionRepositorySQLImpl } from '@/lib/ethereum/transaction-v1/transaction-repository-sql-impl'
import type { EventConsumerHub } from '@/lib/event/event-consumer-hub'
import { EventConsumerHubImpl } from '@/lib/event/event-consumer-hub-impl'
import type { EventPublisher } from '@/lib/event/event-publisher'
import { EventPublisherKafkaImpl } from '@/lib/event/event-publisher-kafka-impl'
import { EventPublisherOutboxImpl } from '@/lib/event/event-publisher-outbox-impl'
import type { OutboxEntryProcessor } from '@/lib/event/outbox-entry-v1/outbox-entry-processor'
import { OutboxEntryProcessorImpl } from '@/lib/event/outbox-entry-v1/outbox-entry-processor-impl'
import type { OutboxEntryRepository } from '@/lib/event/outbox-entry-v1/outbox-entry-repository'
import { OutboxEntryRepositorySQLImpl } from '@/lib/event/outbox-entry-v1/outbox-entry-repository-sql-impl'
import {
  createConsumer,
  createProducer,
  kafkaConnectionOptions,
  type StringConsumer,
} from '@/lib/kafka/clients'
import { lazySingleton } from '@/lib/lazy-singleton'
import type { DepositRepository } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-repository'
import { DepositRepositorySQLImpl } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-repository-sql-impl'
import type { DepositService } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-service'
import { DepositServiceAdaptor } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-service-adaptor'
import { DepositServiceImpl } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-service-impl'
import type { DepositStateController } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-state-controller'
import { DepositStateControllerImpl } from '@/lib/midnight/erc20-vault/deposit-v1/deposit-state-controller-impl'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import { MidnightTransactionRepositorySQLImpl } from '@/lib/midnight/transaction-v1/transaction-repository-sql-impl'
import type { TransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { TransactionStateControllerImpl } from '@/lib/midnight/transaction-v1/transaction-state-controller-impl'

/**
 * Every long-lived component of the server, grouped as the packages under `src/lib` are. A
 * package is built by one function that receives only the packages built before it, so the
 * dependency direction between packages is fixed here and cannot form a cycle.
 */
export interface Backend {
  readonly db: DbBackend
  readonly kafka: KafkaBackend
  readonly event: EventBackend
  readonly ethereum: EthereumBackend
  readonly midnight: MidnightBackend
}

export interface DbBackend {
  readonly pool: Pool
  readonly database: NodePgDatabase
  readonly unitOfWork: UnitOfWork
}

export interface KafkaBackend {
  readonly createConsumer: (groupId: string) => StringConsumer
  readonly publisher: EventPublisher
}

export interface EventBackend {
  /** What the domain publishes through: the outbox, relayed to Kafka by the processor. */
  readonly publisher: EventPublisher
  readonly consumerHub: EventConsumerHub
  readonly outboxEntryV1: {
    readonly repository: OutboxEntryRepository
    readonly processor: OutboxEntryProcessor
  }
}

export interface EthereumBackend {
  readonly transactionV1: {
    readonly repository: EthereumTransactionRepository
  }
}

export interface MidnightBackend {
  readonly transactionV1: {
    readonly repository: MidnightTransactionRepository
    readonly stateController: TransactionStateController
  }
  readonly erc20Vault: {
    readonly depositV1: {
      readonly repository: DepositRepository
      readonly stateController: DepositStateController
      readonly service: DepositService
      readonly adaptor: DepositServiceAdaptor
    }
  }
}

/**
 * The one backend of this module graph. Next.js evaluates instrumentation and request code in
 * separate graphs, so each gets its own instance and only the instrumentation one consumes.
 */
export const getBackend: () => Promise<Backend> = lazySingleton(async () =>
  createBackend(await getServerConfig()),
)

/** Builds the packages in dependency order. Nothing here connects until first use. */
export function createBackend(config: ServerConfig): Backend {
  const db = createDb(config)
  const kafka = createKafka(config)
  const event = createEvent(db, kafka)
  const ethereum = createEthereum(db)
  const midnight = createMidnight(db, event)
  return { db, kafka, event, ethereum, midnight }
}

function createDb(config: ServerConfig): DbBackend {
  const pool = createDatabasePool(config.serverOnly.dbConnectionString)
  const database = createDatabase(pool)
  return { pool, database, unitOfWork: new UnitOfWork(database) }
}

function createKafka(config: ServerConfig): KafkaBackend {
  const options = kafkaConnectionOptions(config.serverOnly.kafka.brokers)
  return {
    createConsumer: (groupId) => createConsumer(options, groupId),
    publisher: new EventPublisherKafkaImpl(createProducer(options)),
  }
}

function createEvent(db: DbBackend, kafka: KafkaBackend): EventBackend {
  const repository = new OutboxEntryRepositorySQLImpl(db.database)
  return {
    publisher: new EventPublisherOutboxImpl(repository),
    consumerHub: new EventConsumerHubImpl(db.unitOfWork),
    outboxEntryV1: {
      repository,
      processor: new OutboxEntryProcessorImpl(repository, kafka.publisher, db.unitOfWork),
    },
  }
}

function createEthereum(db: DbBackend): EthereumBackend {
  return { transactionV1: { repository: new EthereumTransactionRepositorySQLImpl(db.database) } }
}

function createMidnight(db: DbBackend, event: EventBackend): MidnightBackend {
  const transactionV1 = createMidnightTransactionV1(db, event)
  return { transactionV1, erc20Vault: { depositV1: createMidnightErc20VaultDepositV1(db, event) } }
}

function createMidnightTransactionV1(
  db: DbBackend,
  event: EventBackend,
): MidnightBackend['transactionV1'] {
  const repository = new MidnightTransactionRepositorySQLImpl(db.database)
  return {
    repository,
    stateController: new TransactionStateControllerImpl(repository, event.publisher),
  }
}

function createMidnightErc20VaultDepositV1(
  db: DbBackend,
  event: EventBackend,
): MidnightBackend['erc20Vault']['depositV1'] {
  const repository = new DepositRepositorySQLImpl(db.database)
  const stateController = new DepositStateControllerImpl(repository, event.publisher)
  const service = new DepositServiceImpl(repository, stateController)
  return {
    repository,
    stateController,
    service,
    adaptor: new DepositServiceAdaptor(service, db.unitOfWork),
  }
}
