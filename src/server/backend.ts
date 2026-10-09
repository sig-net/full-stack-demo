import 'server-only'

import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id'
import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js/types'
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider'
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider'
import {
  nodeZkConfigRegistry,
  NodeZkConfigProvider,
} from '@midnight-ntwrk/midnight-js-node-zk-config-provider'
import type { VaultCircuitId } from '@sig-net/midnight-examples-erc20-vault-contract'
import { resolve } from 'node:path'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { JsonRpcProvider } from 'ethers'
import type { Pool } from 'pg'

import { getServerConfig, type ServerConfig } from '@/lib/config/server-config'
import { createDatabase, createDatabasePool } from '@/lib/db/database'
import { UnitOfWork } from '@/lib/db/unit-of-work'
import { EthereumTransactionEventConsumer } from '@/lib/ethereum/transaction-v1/transaction-event-consumer'
import type { EthereumTransactionLedger } from '@/lib/ethereum/transaction-v1/transaction-ledger'
import { EthereumTransactionLedgerEthersImpl } from '@/lib/ethereum/transaction-v1/transaction-ledger-ethers-impl'
import type { EthereumTransactionRepository } from '@/lib/ethereum/transaction-v1/transaction-repository'
import { EthereumTransactionRepositorySQLImpl } from '@/lib/ethereum/transaction-v1/transaction-repository-sql-impl'
import type { EthereumTransactionStateController } from '@/lib/ethereum/transaction-v1/transaction-state-controller'
import { EthereumTransactionStateControllerImpl } from '@/lib/ethereum/transaction-v1/transaction-state-controller-impl'
import type { EthereumTransactionStateResolver } from '@/lib/ethereum/transaction-v1/transaction-state-resolver'
import { EthereumTransactionStateResolverImpl } from '@/lib/ethereum/transaction-v1/transaction-state-resolver-impl'
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
import type { DepositRepository } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository'
import { DepositRepositorySQLImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository-sql-impl'
import type { DepositService } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import { DepositServiceAdaptor } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-adaptor'
import { DepositServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-impl'
import type { DepositStateController } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import { DepositStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller-impl'
import type { VaultCircuits } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import {
  compiledVaultContract,
  VaultCircuitsMidnightJsImpl,
} from '@/lib/midnight/ethereum-erc20-vault/vault-circuits-midnight-js-impl'
import type { VaultLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import { VaultLedgerIndexerImpl } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger-indexer-impl'
import { MidnightTransactionEventConsumer } from '@/lib/midnight/transaction-v1/transaction-event-consumer'
import type { MidnightTransactionLedger } from '@/lib/midnight/transaction-v1/transaction-ledger'
import { MidnightTransactionLedgerImpl } from '@/lib/midnight/transaction-v1/transaction-ledger-midnight-impl'
import type { MidnightTransactionRepository } from '@/lib/midnight/transaction-v1/transaction-repository'
import type { TransactionService } from '@/lib/midnight/transaction-v1/transaction-service'
import { TransactionServiceAdaptor } from '@/lib/midnight/transaction-v1/transaction-service-adaptor'
import { TransactionServiceImpl } from '@/lib/midnight/transaction-v1/transaction-service-impl'
import { MidnightTransactionRepositorySQLImpl } from '@/lib/midnight/transaction-v1/transaction-repository-sql-impl'
import type { MidnightTransactionStateController } from '@/lib/midnight/transaction-v1/transaction-state-controller'
import { MidnightTransactionStateControllerImpl } from '@/lib/midnight/transaction-v1/transaction-state-controller-impl'
import type { MidnightTransactionStateResolver } from '@/lib/midnight/transaction-v1/transaction-state-resolver'
import { MidnightTransactionStateResolverImpl } from '@/lib/midnight/transaction-v1/transaction-state-resolver-impl'
import type { RelayerWallet } from '@/lib/midnight/wallet/relayer-wallet'
import { RelayerWalletSeedImpl } from '@/lib/midnight/wallet/relayer-wallet-seed-impl'

/**
 * Every long-lived component of the server, grouped as the packages under `src/lib` are. A
 * package is built by one function that receives only the packages built before it, so the
 * dependency direction between packages is fixed here and cannot form a cycle.
 */
export interface Backend {
  readonly config: ServerConfig
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
    readonly stateController: EthereumTransactionStateController
    readonly ledger: EthereumTransactionLedger
    readonly stateResolver: EthereumTransactionStateResolver
    readonly eventConsumer: EthereumTransactionEventConsumer
  }
}

export interface MidnightBackend {
  /** The backend's own wallet, started once by the start-up; its keys go into the relayer's calls. */
  readonly relayerWallet: RelayerWallet
  /** The indexer, as midnight-js reads contract state through it. */
  readonly publicDataProvider: PublicDataProvider
  readonly transactionV1: {
    readonly repository: MidnightTransactionRepository
    readonly stateController: MidnightTransactionStateController
    readonly ledger: MidnightTransactionLedger
    readonly stateResolver: MidnightTransactionStateResolver
    readonly eventConsumer: MidnightTransactionEventConsumer
    readonly service: TransactionService
    readonly adaptor: TransactionServiceAdaptor
  }
  readonly ethereumErc20Vault: {
    readonly circuits: VaultCircuits
    readonly ledger: VaultLedger
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
  // midnight-js reads the network id from process state when it builds a call.
  setNetworkId(config.client.midnightNetwork.networkId)
  const db = createDb(config)
  const kafka = createKafka(config)
  const event = createEvent(db, kafka)
  const ethereum = createEthereum(db, event, config)
  const midnight = createMidnight(db, event, config)
  return { config, db, kafka, event, ethereum, midnight }
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
    consumerHub: new EventConsumerHubImpl(),
    outboxEntryV1: {
      repository,
      processor: new OutboxEntryProcessorImpl(repository, kafka.publisher, db.unitOfWork),
    },
  }
}

function createEthereum(db: DbBackend, event: EventBackend, config: ServerConfig): EthereumBackend {
  const repository = new EthereumTransactionRepositorySQLImpl(db.database)
  const stateController = new EthereumTransactionStateControllerImpl(repository, event.publisher)
  // The ledger decides a consumed nonce by a receipt read, which a cached earlier null would spoil.
  const ledger = new EthereumTransactionLedgerEthersImpl(
    new JsonRpcProvider(config.client.ethereum.rpcURL, undefined, { cacheTimeout: -1 }),
  )
  const stateResolver = new EthereumTransactionStateResolverImpl(
    repository,
    stateController,
    ledger,
    db.unitOfWork,
  )
  return {
    transactionV1: {
      repository,
      stateController,
      ledger,
      stateResolver,
      eventConsumer: new EthereumTransactionEventConsumer(stateResolver),
    },
  }
}

function createMidnight(db: DbBackend, event: EventBackend, config: ServerConfig): MidnightBackend {
  const { midnightNetwork } = config.client
  const relayerWallet = new RelayerWalletSeedImpl(
    midnightNetwork,
    config.serverOnly.midnightRelayer.seed,
  )
  const publicDataProvider = indexerPublicDataProvider({
    queryURL: midnightNetwork.indexerURL,
    subscriptionURL: midnightNetwork.indexerWsURL,
  })
  const transactionV1 = createMidnightTransactionV1(db, event, config, relayerWallet)
  return {
    relayerWallet,
    publicDataProvider,
    transactionV1,
    ethereumErc20Vault: createMidnightEthereumErc20Vault(
      db,
      event,
      config,
      publicDataProvider,
      relayerWallet,
    ),
  }
}

function createMidnightTransactionV1(
  db: DbBackend,
  event: EventBackend,
  config: ServerConfig,
  relayerWallet: RelayerWallet,
): MidnightBackend['transactionV1'] {
  const { midnightNetwork } = config.client
  const repository = new MidnightTransactionRepositorySQLImpl(db.database)
  const stateController = new MidnightTransactionStateControllerImpl(repository, event.publisher)
  // The registry discovers every contract's key bundle under the root and binds a call to its
  // bundle by verifier key, so one ledger proves for every vault and for cross-contract calls.
  const proofProvider = lazySingleton(async () =>
    httpClientProofProvider({
      url: midnightNetwork.proofServerURL,
      zkConfigProvider: await nodeZkConfigRegistry(config.serverOnly.midnightProver.zkAssetsRoot),
      timeout: PROOF_TIMEOUT_MS,
    }),
  )
  const ledger = new MidnightTransactionLedgerImpl(
    proofProvider,
    midnightNetwork.indexerURL,
    midnightNetwork.nodeURL,
  )
  const stateResolver = new MidnightTransactionStateResolverImpl(
    repository,
    stateController,
    ledger,
    relayerWallet,
    db.unitOfWork,
  )
  const service = new TransactionServiceImpl(repository, stateController)
  return {
    repository,
    stateController,
    ledger,
    stateResolver,
    eventConsumer: new MidnightTransactionEventConsumer(stateResolver),
    service,
    adaptor: new TransactionServiceAdaptor(service, db.unitOfWork),
  }
}

/** The vault's own bundle under the zk-assets root, as `yarn zk-assets` lays it out. */
const VAULT_ZK_ASSETS_DIRECTORY = 'ethereum-erc20-vault'

function createMidnightEthereumErc20Vault(
  db: DbBackend,
  event: EventBackend,
  config: ServerConfig,
  publicDataProvider: PublicDataProvider,
  relayerWallet: RelayerWallet,
): MidnightBackend['ethereumErc20Vault'] {
  const vaultAddress = config.client.midnightEthereumErc20Vault.contractAddress
  const assetsPath = resolve(
    config.serverOnly.midnightProver.zkAssetsRoot,
    VAULT_ZK_ASSETS_DIRECTORY,
  )
  return {
    circuits: new VaultCircuitsMidnightJsImpl(
      publicDataProvider,
      new NodeZkConfigProvider<VaultCircuitId>(assetsPath),
      compiledVaultContract(assetsPath),
      vaultAddress,
      relayerWallet.publicKeys(),
    ),
    ledger: new VaultLedgerIndexerImpl(publicDataProvider, vaultAddress),
    depositV1: createMidnightEthereumErc20VaultDepositV1(db, event),
  }
}

/** A vault circuit proves in minutes on a loaded host, well past the SDK's five-minute default. */
const PROOF_TIMEOUT_MS = 15 * 60 * 1000

function createMidnightEthereumErc20VaultDepositV1(
  db: DbBackend,
  event: EventBackend,
): MidnightBackend['ethereumErc20Vault']['depositV1'] {
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
