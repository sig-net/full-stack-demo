import 'server-only'

import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id'
import type {
  ProofProvider,
  PublicDataProvider,
  ZKConfigProvider,
} from '@midnight-ntwrk/midnight-js/types'
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider'
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider'
import { MpcOutputCacheReader } from '@sig-net/midnight'
import {
  nodeZkConfigRegistry,
  NodeZkConfigProvider,
} from '@midnight-ntwrk/midnight-js-node-zk-config-provider'
import {
  flushPending,
  VAULT_PRIVATE_STATE_ID,
  type VaultCircuitId,
  type VaultPrivateState,
  type VaultProviders,
} from '@sig-net/midnight-examples-erc20-vault-contract'
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
import { delayUnlessAborted } from '@/lib/delay-unless-aborted'
import type { EventConsumer } from '@/lib/event/event-consumer'
import type { EventConsumerHub } from '@/lib/event/event-consumer-hub'
import {
  EventConsumerHubImpl,
  EVENTS_GROUP_ID,
  runEventConsumerHub,
} from '@/lib/event/event-consumer-hub-impl'
import type { EventPublisher } from '@/lib/event/event-publisher'
import { EventPublisherKafkaImpl } from '@/lib/event/event-publisher-kafka-impl'
import { EventPublisherOutboxImpl } from '@/lib/event/event-publisher-outbox-impl'
import type { OutboxEntryProcessor } from '@/lib/event/outbox-entry-v1/outbox-entry-processor'
import {
  OutboxEntryProcessorImpl,
  runOutboxEntryProcessor,
} from '@/lib/event/outbox-entry-v1/outbox-entry-processor-impl'
import type { OutboxEntryRepository } from '@/lib/event/outbox-entry-v1/outbox-entry-repository'
import { OutboxEntryRepositorySQLImpl } from '@/lib/event/outbox-entry-v1/outbox-entry-repository-sql-impl'
import {
  createConsumer,
  createProducer,
  kafkaConnectionOptions,
  type StringConsumer,
  type StringProducer,
} from '@/lib/kafka/clients'
import { lazySingleton } from '@/lib/lazy-singleton'
import { DepositEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-event-consumer'
import type { DepositRepository } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository'
import { DepositRepositorySQLImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-repository-sql-impl'
import type { DepositService } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service'
import { DepositServiceAdaptor } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-adaptor'
import { DepositServiceImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-service-impl'
import type { DepositStateController } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller'
import { DepositStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-controller-impl'
import type { DepositStateResolver } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-resolver'
import { DepositStateResolverImpl } from '@/lib/midnight/ethereum-erc20-vault/deposit-v1/deposit-state-resolver-impl'
import { FlushEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/flush-event-consumer'
import type { Flusher } from '@/lib/midnight/ethereum-erc20-vault/flusher'
import { FlusherImpl } from '@/lib/midnight/ethereum-erc20-vault/flusher-impl'
import type { RespondOutcomeSource } from '@/lib/midnight/ethereum-erc20-vault/respond-outcome-source'
import { RespondOutcomeSourceEvmNodeImpl } from '@/lib/midnight/ethereum-erc20-vault/respond-outcome-source-evm-node-impl'
import { RespondOutcomeSourceMpcCacheImpl } from '@/lib/midnight/ethereum-erc20-vault/respond-outcome-source-mpc-cache-impl'
import {
  type SignetReaders,
  signetReaders,
} from '@/lib/midnight/ethereum-erc20-vault/signet-readers'
import type { VaultAction } from '@/lib/midnight/ethereum-erc20-vault/vault-action'
import type { VaultCircuits } from '@/lib/midnight/ethereum-erc20-vault/vault-circuits'
import {
  compiledVaultContract,
  permissionlessVaultPrivateState,
  VaultCircuitsMidnightJsImpl,
} from '@/lib/midnight/ethereum-erc20-vault/vault-circuits-midnight-js-impl'
import type { VaultLedger } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger'
import { VaultLedgerIndexerImpl } from '@/lib/midnight/ethereum-erc20-vault/vault-ledger-indexer-impl'
import { VaultRequestEventConsumer } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-event-consumer'
import type { VaultRequestRepository } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository'
import { VaultRequestRepositorySQLImpl } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-repository-sql-impl'
import type { VaultRequestStateController } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller'
import { VaultRequestStateControllerImpl } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-controller-impl'
import type { VaultRequestStateResolver } from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-resolver'
import {
  type RespondOutcomeSources,
  VaultRequestStateResolverImpl,
} from '@/lib/midnight/ethereum-erc20-vault/vault-request-v1/vault-request-state-resolver-impl'
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
import { PrivateStateProviderMemoryImpl } from '@/lib/midnight/private-state-provider-memory-impl'
import type { RelayerWallet } from '@/lib/midnight/wallet/relayer-wallet'
import { RelayerWalletSeedImpl } from '@/lib/midnight/wallet/relayer-wallet-seed-impl'
import { sweep, type SweepTask } from '@/lib/sweep'

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
  /**
   * Starts the long-running work of the process: the relayer wallet's sync, the consumers on the
   * hub, the hub's Kafka loop, the outbox relay and the sweep. It runs once per instance, a later
   * call sharing the first's promise, and resolves once the loops are running, before the wallet
   * has synced.
   */
  start(): Promise<void>
  /**
   * Ends every loop `start()` began and closes the Kafka consumer, the outbox listener's
   * connection and the Kafka producer, waiting up to `STOP_TIMEOUT_MS` for the resolve or flush
   * that was mid-run. The pool stays open for its owner to end. A stopped backend never starts
   * again.
   */
  stop(): Promise<void>
}

/** The packages alone, which the lifecycle is built over. */
type BackendPackages = Omit<Backend, 'start' | 'stop'>

export interface DbBackend {
  readonly pool: Pool
  readonly database: NodePgDatabase
  readonly unitOfWork: UnitOfWork
}

export interface KafkaBackend {
  readonly createConsumer: (groupId: string) => StringConsumer
  /** The one producer of the process, connected on its first send and closed by `stop()`. */
  readonly producer: StringProducer
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
  /** The RPC node on `EVM_RPC_URL`, with ethers' request cache off so every read is fresh. */
  readonly provider: JsonRpcProvider
  readonly transactionV1: {
    readonly repository: EthereumTransactionRepository
    readonly stateController: EthereumTransactionStateController
    readonly ledger: EthereumTransactionLedger
    readonly stateResolver: EthereumTransactionStateResolver
    readonly eventConsumer: EthereumTransactionEventConsumer
  }
}

export interface MidnightBackend {
  /** The backend's own wallet, started once by the start-up, and its keys go into the relayer's calls. */
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
    readonly signetReaders: SignetReaders
    readonly respondOutcomeSources: RespondOutcomeSources
    /** Nudged by `flushEventConsumer` and by the sweep, and never by a vault request's resolver. */
    readonly flusher: Flusher
    readonly flushEventConsumer: FlushEventConsumer
    readonly vaultRequestV1: {
      readonly repository: VaultRequestRepository
      readonly stateController: VaultRequestStateController
      readonly stateResolver: VaultRequestStateResolver
      readonly eventConsumer: VaultRequestEventConsumer
    }
    readonly depositV1: {
      readonly repository: DepositRepository
      readonly stateController: DepositStateController
      readonly stateResolver: DepositStateResolver
      readonly eventConsumer: DepositEventConsumer
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
  const midnight = createMidnight(db, event, ethereum, config)
  const packages: BackendPackages = { config, db, kafka, event, ethereum, midnight }
  return { ...packages, ...createLifecycle(packages) }
}

/** The sweep's period, which bounds how long a lost event or an expiry goes unnoticed. */
const SWEEP_INTERVAL_MS = 30_000
/** How long a stop waits for a resolve or flush mid-run before it leaves the run to finish detached. */
const STOP_TIMEOUT_MS = 30_000

/** One abort ends every loop, so a stop cannot leave one running. */
function createLifecycle(backend: BackendPackages): Pick<Backend, 'start' | 'stop'> {
  const { db, kafka, event, ethereum, midnight } = backend
  const stopping = new AbortController()
  let loops: Promise<void>[] = []
  const start = lazySingleton(async () => {
    startRelayerWallet(midnight.relayerWallet)
    const consumers: EventConsumer[] = [
      midnight.transactionV1.eventConsumer,
      ethereum.transactionV1.eventConsumer,
      midnight.ethereumErc20Vault.vaultRequestV1.eventConsumer,
      midnight.ethereumErc20Vault.depositV1.eventConsumer,
      midnight.ethereumErc20Vault.flushEventConsumer,
    ]
    for (const consumer of consumers) event.consumerHub.registerConsumer(consumer)
    const { signal } = stopping
    loops = [
      runEventConsumerHub(event.consumerHub, () => kafka.createConsumer(EVENTS_GROUP_ID), signal),
      runOutboxEntryProcessor(event.outboxEntryV1.processor, db.pool, signal),
      sweep(sweepTasks(ethereum, midnight), SWEEP_INTERVAL_MS, signal),
    ]
    console.log(
      `Backend started: ${String(consumers.length)} consumers registered, sweep every ${String(SWEEP_INTERVAL_MS)} ms`,
    )
  })
  const stop = async (): Promise<void> => {
    stopping.abort()
    await endWithin(Promise.all(loops), STOP_TIMEOUT_MS, 'The backend loops')
    try {
      await kafka.producer.close()
    } catch (error: unknown) {
      console.error('Closing the Kafka producer failed', error)
    }
  }
  return { start, stop }
}

/** Every resolver's sweep, then the flusher, so a request a sweep moved into a flush state is flushed at once. */
function sweepTasks(ethereum: EthereumBackend, midnight: MidnightBackend): SweepTask[] {
  const { vaultRequestV1, depositV1, flusher } = midnight.ethereumErc20Vault
  return [
    {
      name: 'Midnight transactions',
      run: () => midnight.transactionV1.stateResolver.resolvePending(),
    },
    {
      name: 'Ethereum transactions',
      run: () => ethereum.transactionV1.stateResolver.resolvePending(),
    },
    { name: 'vault requests', run: () => vaultRequestV1.stateResolver.resolvePending() },
    { name: 'deposits', run: () => depositV1.stateResolver.resolvePending() },
    // The flusher coalesces and logs its own failures, and a flush that proves runs for minutes,
    // so the pass fires it and moves on.
    {
      name: 'flush',
      run: async () => {
        void flusher.flush()
      },
    },
  ]
}

/** Resolves when the work ends, or logs and resolves once the bound passes, holding no timer past either. */
async function endWithin(work: Promise<unknown>, ms: number, what: string): Promise<void> {
  const timer = new AbortController()
  const expired = delayUnlessAborted(ms, timer.signal).then(() => !timer.signal.aborted)
  const ended = work.then(() => false)
  if (await Promise.race([ended, expired])) {
    console.error(`${what} are still running after ${String(ms)} ms`)
  }
  timer.abort()
}

/**
 * Begins the wallet's sync at once, since a sync can take minutes. The backend starts without
 * waiting, and a resolver that reaches the wallet before the sync ends waits on it.
 */
function startRelayerWallet(relayerWallet: RelayerWallet): void {
  const started = Date.now()
  relayerWallet.start().then(
    () => {
      console.log(`Relayer wallet synced in ${String(Date.now() - started)} ms`)
    },
    (error: unknown) => {
      console.error('Relayer wallet failed to start, the next relayer transaction retries', error)
    },
  )
}

function createDb(config: ServerConfig): DbBackend {
  const pool = createDatabasePool(config.serverOnly.dbConnectionString)
  const database = createDatabase(pool)
  return { pool, database, unitOfWork: new UnitOfWork(database) }
}

function createKafka(config: ServerConfig): KafkaBackend {
  const options = kafkaConnectionOptions(config.serverOnly.kafka.brokers)
  const producer = createProducer(options)
  return {
    createConsumer: (groupId) => createConsumer(options, groupId),
    producer,
    publisher: new EventPublisherKafkaImpl(producer),
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
  const provider = new JsonRpcProvider(config.client.ethereum.rpcURL, undefined, {
    cacheTimeout: -1,
  })
  const ledger = new EthereumTransactionLedgerEthersImpl(provider)
  const stateResolver = new EthereumTransactionStateResolverImpl(
    repository,
    stateController,
    ledger,
    db.unitOfWork,
  )
  return {
    provider,
    transactionV1: {
      repository,
      stateController,
      ledger,
      stateResolver,
      eventConsumer: new EthereumTransactionEventConsumer(stateResolver),
    },
  }
}

function createMidnight(
  db: DbBackend,
  event: EventBackend,
  ethereum: EthereumBackend,
  config: ServerConfig,
): MidnightBackend {
  const { midnightNetwork } = config.client
  const relayerWallet = new RelayerWalletSeedImpl(
    midnightNetwork,
    config.serverOnly.midnightRelayer.seed,
  )
  const publicDataProvider = indexerPublicDataProvider({
    queryURL: midnightNetwork.indexerURL,
    subscriptionURL: midnightNetwork.indexerWsURL,
  })
  // The registry discovers every contract's key bundle under the root and binds a call to its
  // bundle by verifier key, so one prover serves every vault and cross-contract calls.
  const proofProvider = lazySingleton(async () =>
    httpClientProofProvider({
      url: midnightNetwork.proofServerURL,
      zkConfigProvider: await nodeZkConfigRegistry(config.serverOnly.midnightProver.zkAssetsRoot),
      timeout: PROOF_TIMEOUT_MS,
    }),
  )
  const transactionV1 = createMidnightTransactionV1(db, event, config, relayerWallet, proofProvider)
  return {
    relayerWallet,
    publicDataProvider,
    transactionV1,
    ethereumErc20Vault: createMidnightEthereumErc20Vault(
      db,
      event,
      ethereum,
      config,
      publicDataProvider,
      proofProvider,
      relayerWallet,
      transactionV1,
    ),
  }
}

/** A vault circuit proves in minutes on a loaded host, well past the SDK's five-minute default. */
const PROOF_TIMEOUT_MS = 15 * 60 * 1000

function createMidnightTransactionV1(
  db: DbBackend,
  event: EventBackend,
  config: ServerConfig,
  relayerWallet: RelayerWallet,
  proofProvider: () => Promise<ProofProvider>,
): MidnightBackend['transactionV1'] {
  const { midnightNetwork } = config.client
  const repository = new MidnightTransactionRepositorySQLImpl(db.database)
  const stateController = new MidnightTransactionStateControllerImpl(repository, event.publisher)
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
  ethereum: EthereumBackend,
  config: ServerConfig,
  publicDataProvider: PublicDataProvider,
  proofProvider: () => Promise<ProofProvider>,
  relayerWallet: RelayerWallet,
  transactionV1: MidnightBackend['transactionV1'],
): MidnightBackend['ethereumErc20Vault'] {
  const { midnightNetwork, midnightSignet } = config.client
  const vaultAddress = config.client.midnightEthereumErc20Vault.contractAddress
  const assetsPath = resolve(
    config.serverOnly.midnightProver.zkAssetsRoot,
    VAULT_ZK_ASSETS_DIRECTORY,
  )
  const zkConfigProvider = new NodeZkConfigProvider<VaultCircuitId>(assetsPath)
  const compiledContract = compiledVaultContract(assetsPath)
  const circuits = new VaultCircuitsMidnightJsImpl(
    publicDataProvider,
    zkConfigProvider,
    compiledContract,
    vaultAddress,
    relayerWallet.publicKeys(),
  )
  const ledger = new VaultLedgerIndexerImpl(publicDataProvider, vaultAddress)
  const readers = signetReaders({
    vaultAddress,
    signetAddress: midnightSignet.contractAddress,
    publicDataProvider,
    indexerURL: midnightNetwork.indexerURL,
  })
  const respondOutcomeSources = createRespondOutcomeSources(ethereum, config, readers)
  const vaultRequestV1 = createMidnightEthereumErc20VaultRequestV1(
    db,
    event,
    ethereum,
    transactionV1,
    { circuits, ledger, signetReaders: readers, respondOutcomeSources },
  )
  const providers = createVaultProviders(
    vaultAddress,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    relayerWallet,
  )
  const flusher = new FlusherImpl(
    async () => flushPending(await providers(), compiledContract, vaultAddress),
    () => vaultRequestV1.stateResolver.resolveWaitingFlushes(),
  )
  return {
    circuits,
    ledger,
    signetReaders: readers,
    respondOutcomeSources,
    flusher,
    flushEventConsumer: new FlushEventConsumer(flusher),
    vaultRequestV1,
    depositV1: createMidnightEthereumErc20VaultDepositV1(
      db,
      event,
      ethereum,
      config,
      transactionV1,
      vaultRequestV1,
      { circuits, ledger },
    ),
  }
}

/**
 * The relayer's full provider set for the vault, assembled on first use: the wallet slots resolve
 * once the relayer wallet has synced, and the proof provider once its key registry has loaded.
 */
function createVaultProviders(
  vaultAddress: string,
  publicDataProvider: PublicDataProvider,
  zkConfigProvider: ZKConfigProvider<VaultCircuitId>,
  proofProvider: () => Promise<ProofProvider>,
  relayerWallet: RelayerWallet,
): () => Promise<VaultProviders> {
  return lazySingleton(async (): Promise<VaultProviders> => {
    const privateStateProvider = new PrivateStateProviderMemoryImpl<VaultPrivateState>()
    privateStateProvider.setContractAddress(vaultAddress)
    await privateStateProvider.set(VAULT_PRIVATE_STATE_ID, permissionlessVaultPrivateState())
    const wallet = await relayerWallet.provider()
    return {
      privateStateProvider,
      publicDataProvider,
      zkConfigProvider,
      proofProvider: await proofProvider(),
      walletProvider: wallet,
      midnightProvider: wallet,
    }
  })
}

/** One source per action over that action's reader, of the kind `RESPOND_OUTPUT_SOURCE` names. */
function createRespondOutcomeSources(
  ethereum: EthereumBackend,
  config: ServerConfig,
  readers: SignetReaders,
): RespondOutcomeSources {
  const respondOutput = config.serverOnly.midnightRespondOutput
  const source = (action: VaultAction): RespondOutcomeSource => {
    switch (respondOutput.source) {
      case 'evm-node':
        return new RespondOutcomeSourceEvmNodeImpl(readers[action], ethereum.provider)
      case 'mpc-cache':
        return new RespondOutcomeSourceMpcCacheImpl(
          readers[action],
          new MpcOutputCacheReader({
            cacheUrl: respondOutput.mpcOutputCacheURL,
            networkId: config.client.midnightNetwork.networkId,
            signetContractAddress: config.client.midnightSignet.contractAddress,
          }),
        )
      default: {
        const unhandled: never = respondOutput
        throw new Error(`Unhandled source ${JSON.stringify(unhandled)}`)
      }
    }
  }
  return { deposit: source('deposit') }
}

function createMidnightEthereumErc20VaultRequestV1(
  db: DbBackend,
  event: EventBackend,
  ethereum: EthereumBackend,
  transactionV1: MidnightBackend['transactionV1'],
  vault: Pick<
    MidnightBackend['ethereumErc20Vault'],
    'circuits' | 'ledger' | 'signetReaders' | 'respondOutcomeSources'
  >,
): MidnightBackend['ethereumErc20Vault']['vaultRequestV1'] {
  const repository = new VaultRequestRepositorySQLImpl(db.database)
  const stateController = new VaultRequestStateControllerImpl(
    repository,
    event.publisher,
    transactionV1.stateController,
    ethereum.transactionV1.stateController,
  )
  const stateResolver = new VaultRequestStateResolverImpl(
    repository,
    stateController,
    vault.ledger,
    vault.circuits,
    vault.signetReaders,
    vault.respondOutcomeSources,
    transactionV1.repository,
    ethereum.transactionV1.repository,
    db.unitOfWork,
  )
  return {
    repository,
    stateController,
    stateResolver,
    eventConsumer: new VaultRequestEventConsumer(stateResolver),
  }
}

function createMidnightEthereumErc20VaultDepositV1(
  db: DbBackend,
  event: EventBackend,
  ethereum: EthereumBackend,
  config: ServerConfig,
  transactionV1: MidnightBackend['transactionV1'],
  vaultRequestV1: MidnightBackend['ethereumErc20Vault']['vaultRequestV1'],
  vault: Pick<MidnightBackend['ethereumErc20Vault'], 'circuits' | 'ledger'>,
): MidnightBackend['ethereumErc20Vault']['depositV1'] {
  const repository = new DepositRepositorySQLImpl(db.database)
  const stateController = new DepositStateControllerImpl(
    repository,
    event.publisher,
    transactionV1.stateController,
    vaultRequestV1.stateController,
  )
  const stateResolver = new DepositStateResolverImpl(
    repository,
    stateController,
    transactionV1.repository,
    vaultRequestV1.repository,
    vault.ledger,
    db.unitOfWork,
  )
  const service = new DepositServiceImpl(
    repository,
    stateController,
    vaultRequestV1.repository,
    vault.circuits,
    ethereum.provider,
    db.unitOfWork,
    config.client.midnightSignet,
    config.client.midnightEthereumErc20Vault,
  )
  return {
    repository,
    stateController,
    stateResolver,
    eventConsumer: new DepositEventConsumer(stateResolver),
    service,
    adaptor: new DepositServiceAdaptor(service),
  }
}
