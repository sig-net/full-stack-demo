# Deposit build plan

The goal is one end-to-end deposit, driven by the backend's own lifecycle machinery and proven
by a new integration test under `integration-tests/`. This document is the whole plan: an agent
picking it up after a context clear needs nothing else beyond the repository's rules files and
the code itself. Work through the stages in order, tick each box as it is verified, and record
anything learned in the findings log at the end so the next agent does not rediscover it.

## How to use this document

- [ ] Read `AGENTS.md` first. Its rules on layering, validation boundaries, lifecycle entities,
      repositories, testing and the backend boundary are the constraints every stage below obeys.
- [ ] Work in the worktree `/Users/bernard/Projects/github.com/sig-net/full-stack-demo-rebuild`
      on branch `bernard/rebuild`. Never commit or push unless the user says so for that action.
- [ ] Each stage ends with a verification list. A box is ticked only after its verification ran.
      `yarn check` (typecheck, lint, format check, boundary guard, unit tests) must pass at the
      end of every stage, and `yarn test:integration` whenever a stage touches a repository, a
      migration or the composition root.
- [ ] Resolve the research list items the stage names before designing against them. Record the
      answer in the findings log with the command or file that proved it.
- [ ] Keep the entity pattern exact for every resource with a lifecycle: a resource file, a pure
      state machine, a state controller (the only writer, one method per action, atomic under the
      caller's unit of work, called by the resolver, or by a service only when the user must act),
      a state resolver (driven by events and the sweep, does the slow work outside transactions),
      and a dumb event consumer.

## The goal in one test

`integration-tests/ethereum-erc20-vault-deposit.test.ts` runs the full round trip against the
local stack that is already up: Postgres and Kafka from `compose.yaml`, the Midnight node,
indexer and proof server, the deployed signet singleton and ERC20 vault named in `.env.local`, the
Sepolia fork on `EVM_RPC_URL`, and the MPC that answers the singleton. The test plays the user:
it starts a deposit through the adaptor, balances and signs the user's two Midnight transactions
with a funded seed wallet, funds the deposit account on the fork, calls complete when the deposit
asks for it, and waits for `Completed`. Everything in between is the backend acting on its own:
flushes, the send, the signature poll, the EVM broadcast, the attestation poll, the queue, the
second flush, each of them permissionless and paid by the backend's relayer wallet.

## Protocol facts the design rests on

Source: the contract `erc20-vault.compact` and the deposit and contention documents in the
`midnight-examples-fullstack-demo-prep` repository (`examples/erc20-vault/docs/deposit/deposit.md`
and `docs/contention-handling.md`). The ten steps of a deposit:

| Step | Circuit or action                                          | Who may act                                     | What proves it happened on the vault ledger                              |
| ---- | ---------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| 1    | Fund the deposit account with the ERC20 and gas ETH        | the user, on the EVM chain                      | an EVM balance                                                           |
| 2    | `startDeposit(inIndex, evmNonce, gas, request)`            | the depositor (needs the caller secret witness) | `inputRequestBuffer` holds `inIndex`, `depositArgsMap` holds its args    |
| 3    | `flushQueue(slots)` carrying `inIndex`                     | anyone                                          | `outputRequestBuffer` holds `requestIndex(entry)`                        |
| 4    | `sendDeposit(outIndex)`                                    | anyone                                          | `evictionMap` and `bidirectionalDepositMap` hold the request id          |
| 5    | MPC posts the signature through the singleton              | the MPC                                         | a `SignatureRespondedEvent` whose signer recovers to the deposit account |
| 6    | Broadcast the signed sweep                                 | anyone                                          | an EVM receipt                                                           |
| 7    | MPC posts the attestation                                  | the MPC                                         | a `RespondBidirectionalEvent` verifying against `mpcResponseKey`         |
| 8    | `queueAttestation1` or `queueAttestation0`                 | anyone                                          | `inputAttestationBuffer` holds the request id                            |
| 9    | `flushQueue(slots)` carrying the request id                | anyone                                          | `outputAttestationBuffer` holds the request id                           |
| 10   | `completeDeposit(requestId, output, mintNonce, recipient)` | the depositor                                   | the request's entries are gone, the mint happened                        |

Facts that shape the design:

- Every chain step is deduplicated by the contract. A second send builds the same request id and
  is refused, a queued attestation cannot be queued twice, a flushed item fails the next flush
  that names it. The ledger is therefore the acknowledgement for every step we take, and our rows
  only cache where a request stands.
- Only `flushQueue` touches shared state (`globalLastSeen`, `vaultAccountNonce`). Two flushes
  built against the same state conflict, one lands and the other is rebuilt. So flushing is a
  vault-level batch, never a per-request step.
- `sendDeposit`, `flushQueue` and `queueAttestation*` never call the `callerSecretKey` witness,
  so the backend proves and pays for them with any private state. `startDeposit` and
  `completeDeposit` do call it, so they are built while the caller secret is in hand, inside the
  user's action, and finalised by the user's wallet.
- `completeDeposit` mints to `ownPublicKey()`, the coin public key of the wallet provider the
  call is built with. The server never holds the browser wallet's keys, so the complete action
  takes them as arguments.
- The expected signer of the sweep is the deposit account,
  `deriveEvmAddress(mpcRootPublicKey, vaultAddress, hex(userCommitment(secret)))`, and the
  commitment is public on the ledger in `depositArgsMap.lookup(inIndex).path`, so no step after
  the start needs the secret.
- A request started with an EVM nonce an earlier sweep of the same deposit account consumed
  before the flush is attested `unviable` at a block at or below the entry's `lastSeen`, and the
  queue circuit refuses it forever. Only the MPC signs from a deposit account, so that earlier
  sweep is always a previous request of the same caller, and the case is reachable only through
  a bad nonce choice at start. The contract marks the branch unreachable for a correct caller.
  This backend assigns the nonce, so it keeps the case unreachable (Stage 6) and models no
  failure for it: the resolver guards the invariant and logs, nothing more.
- The attested output bytes travel off chain. A post declaring `executed` is verified over the
  mined transaction's traced return data, serialised as the MPC does, and a post declaring
  `failed` or `unviable` over the empty output. The MPC also caches the exact bytes it hashed,
  one object per request id, when `MPC_OUTPUT_CACHE_URL` is configured.

## Design overview

Five entities, four of them with the full lifecycle pattern, one vault-level process, and six
ports behind which the slow systems sit.

```text
Deposit (user-owned)
  AwaitingStartTransaction -> AwaitingVaultRequest -> AwaitingCompletion -> AwaitingCompleteTransaction -> Completed
                           \-> Failed (StartFailed)                                        \-> back to AwaitingCompletion on a failed attempt
  children: MidnightTransaction(circuit startDeposit), VaultRequest, MidnightTransaction(circuit completeDeposit)

VaultRequest (the permissionless vault processing of one request, any action)
  AwaitingFlush -> AwaitingSend -> AwaitingSignature -> AwaitingBroadcast -> AwaitingAttestation
    -> AwaitingAttestationQueue -> AwaitingAttestationFlush -> Attested
  no failure state: every step is retried until the ledger shows it done
  children: MidnightTransaction(circuit sendDeposit), EthereumTransaction, MidnightTransaction(circuit queueAttestationN)

MidnightTransaction (exists): AwaitingProof -> AwaitingWallet -> AwaitingSubmission -> AwaitingInclusion -> Succeeded | Failed
  new field signer: 'caller' | 'relayer'. AwaitingWallet is the browser's to-do for a caller transaction
  and the relayer wallet's to-do for a relayer transaction.

EthereumTransaction (draft exists): AwaitingSubmission -> AwaitingInclusion -> Succeeded | Failed

Flusher (vault-level process, no row): runs the SDK's flushPending with the relayer's providers,
  one in flight per process, again while anything waits, then nudges every request awaiting a flush.
```

Every transition is nudged by an event and caught by a sweep. A child's terminal event carries
`{ name, parent }`, so the parent's consumer matches on the parent's collection and calls the
parent's resolver with the parent name. The sweep calls `resolvePending()` on every resolver and
`flush()` on the flusher at an interval, and it is load-bearing: the MPC's posts never reach our
Kafka, so the two polling states only advance on a resolve.

The resolver loop is the same for every vault request state, and it is the outbox pattern with
the ledger as the acknowledgement:

```text
observe the ledger (and the singleton's event log) outside any transaction
if it shows the step done:           apply one controller transition inside a unit of work
else if no live child does the step: commit one child (relayer transaction or EVM transaction)
else:                                wait for the child's terminal event or the next sweep
```

A crash between the chain accepting and our record costs nothing, the next resolve observes and
records. A duplicate child is refused on chain and ends `Failed`, and the resolver never reads a
child's failure as the request's failure: it reads the ledger, sees the step done, and moves on.

## Reuse census: what the packages already provide

Every item here was read from the installed declarations under `node_modules`. Import from these,
never re-implement them.

`@sig-net/midnight@0.24.0` (root export):

- `SignetRequestResponseReader` with config `{ requesterContractAddress, requesterRequestsPath,
signetContractAddress, publicDataProvider, eventSource, signetEventsFromBlock? }`. Methods:
  `getSignatureRequest(requestId)`, `getVerifiedSignatureRespondedEvent(requestId, expectedSigner)`,
  `getSignedEvmTransaction(requestId, expectedSigner)` returning an ethers `Transaction` or
  `undefined`, `getRespondBidirectionalEvents(requestId)`,
  `getVerifiedRespondBidirectionalEvent(requestId, serializedOutput, mpcResponseKey)`.
- `signetEventSourceFromIndexer({ queryUrl })` builds the `eventSource`.
- `MpcOutputCacheReader({ cacheUrl, networkId, signetContractAddress }).fetchSerializedOutput(requestId)`.
- `executedEvmRespondOutput(schema, isContractCall, trace)`, `evmTraceOutputFromCallFrame(frame)`,
  `isEvmContractCall(data)`, `deriveRespondSchema`, `verifyRespondBidirectionalSignature(output,
event, mpcResponseKey)`, `respondBidirectionalEventToCircuitInput(event)`.
- `deriveEvmAddress(mpcPublicKey, contractAddress, pathHex)`, `requestIdHex`, `parseRequestIdHex`,
  `OutputKind`, `bytesToHex`, `hexToBytes`.
- `signBidirectionalEventToSignedEvmTransaction(request, response)` (used inside the reader).

`@sig-net/midnight-examples-erc20-vault-contract@0.4.0-rc.2` (root export):

- `readVaultLedger(publicDataProvider, vaultAddress)` returning `VaultLedgerState`, the generated
  `Ledger` with `member`/`lookup` on `inputRequestBuffer`, `outputRequestBuffer`,
  `inputAttestationBuffer`, `outputAttestationBuffer`, `evictionMap`, `depositArgsMap`, plus
  `mpcResponseKey`, `globalLastSeen`, `vaultEvmAddress`, `evmChainId`, `allowedTokens`.
- `queuedRequestIndex(state, inIndex)`, `flushedRequestIndex(state, action, inIndex)`,
  `newInputIndex()`, `flushSlots`, `FLUSH_WIDTH`.
- `flushPending(providers, compiledContract, vaultAddress, first?)` resolving with the number of
  slots moved (0 when nothing waits) and throwing `CallTxFailedError` or a `flushQueue` assert
  message on a lost race. It chooses the slots, builds the call with the transcript in the
  fallible section, proves, balances with the providers' wallet, submits and waits.
- `Contract`, `witnesses`, `createVaultPrivateState(secret)`, `VAULT_PRIVATE_STATE_ID`,
  `VaultProviders`, `VaultCompiledContract`, `VaultCircuitId`, `Action`, `FlushSlot`,
  `pureCircuits.userCommitment(secret)`, `pureCircuits.ownershipCommitment`, `evmAddressBytes`,
  `VAULT_DEPOSIT_REQUESTS_PATH`, `CIRCLE_USDC` and the other Sepolia addresses.

`@midnight-ntwrk/midnight-js-contracts@5.0.0-beta.6` (reached as `@midnight-ntwrk/midnight-js/contracts`):

- `createCallTxOptions(compiledContract, circuitId, contractAddress, privateStateId, undefined, args)`
  and `createUnprovenCallTx(providers, options)` where providers are `{ zkConfigProvider,
publicDataProvider, walletProvider, privateStateProvider }`. The result's `private.unprovenTx`
  is the `UnprovenTransaction` (declared in `UnsubmittedTxData`), the thing our transaction row
  stores as hex.
- `findDeployedContract`, `submitTx`, `withContractScopedTransaction`, `CallTxFailedError`.

Already in this repository:

- `src/lib/midnight/wallet/seed-wallet-facade.ts`: `deriveAccountKeys(seedHex, networkId)`,
  `initialiseWalletFacade(keys, networkConfig)`, `createWalletAndMidnightProvider(facade, keys)`
  whose `balanceTx(unboundTx)` balances, signs and finalises. Runtime-neutral (wallet SDK,
  `@polkadot/api`, `effect`), currently consumed only by the browser's `SeedWallet` class.
- `src/lib/midnight/transaction-v1/*`: the model lifecycle entity, its ledger over the proof
  server, node and indexer, and the proof provider registry in `src/server/backend.ts`.
- `src/lib/repository/*`: the golden repository with `search({ criteria, order, limit, lock })`.
- `src/lib/testing/mock.ts`: `mock<Interface>(name, methods)`.

Not in any package, to be written here (small, ported from the prep repository's
`examples/erc20-vault/integration-tests/src`):

- Attested output resolution (`flows/respond-output.ts`, `observed-execution.ts`): obtaining the
  bytes to verify an attestation over, from the EVM node trace or the MPC cache.
- EVM broadcast idempotency (`flows/broadcast-evm.ts`): receipt first, tolerate already-known,
  detect a consumed nonce.
- A `PublicDataProvider`: the dependency below provides it.
- A compiled-contract binding for midnight-js (`makeCompiledContract` lives in
  `@sig-net/midnight-contract-deploy@0.24.0`, see the dependency list).

## Research list

Resolve each item by executing something and record the result in the findings log. Items are
grouped by the first stage that needs them.

Stage 0:

- [x] R1. Which seed wallets the local stack funds with NIGHT and dust, and how to fund one more.
      Needed for `MIDNIGHT_RELAYER_SEED` (backend) and `MIDNIGHT_USER_SEED` (the test's user).
      Look in the stack's compose and env in `midnight-examples-align-with-protocol-spec` (named
      at the top of `.env.local`) and in the prep repository's `integration-tests/src/setup.ts`.
- [x] R2. Whether `EVM_RPC_URL` is anvil with cheatcodes (`anvil_setBalance`,
      `anvil_setStorageAt`). Ask the node for its client version:

```bash
curl -s -X POST "$EVM_RPC_URL" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"web3_clientVersion","params":[]}'
```

- [x] R3. Which ERC20 the deployed vault allows: read `allowedTokens` with `readVaultLedger`
      through a throwaway script run as below. Expect `CIRCLE_USDC`. The prep repository's
      `fork-funding.ts` finds the USDC balance slot by probing `anvil_setStorageAt`, copy that.

```bash
NODE_OPTIONS=--conditions=react-server node_modules/.bin/tsx <script>
```

- [x] R4. Whether an MPC is answering the singleton on this stack and which output source it
      serves: `RESPOND_OUTPUT_SOURCE` and `MPC_OUTPUT_CACHE_URL` in the stack's env, and whether
      the fork serves `debug_traceTransaction` (`assertDebugTraceAvailable` in the prep
      repository's `observed-execution.ts` shows the probe).
- [x] R5. The gas constants the prep repository uses for a deposit
      (`ERC20_TRANSFER_GAS_LIMIT`, `ERC20_TRANSFER_MAX_FEE_PER_GAS`,
      `ERC20_TRANSFER_MAX_PRIORITY_FEE_PER_GAS` in `integration-tests/src/flows/start-deposit.ts`
      or its imports) and their rationale, so the deposit service assigns the same envelope.

Stage 2:

- [x] R6. That `createUnprovenCallTx(...).private.unprovenTx.serialize()` yields bytes our
      `TransactionLedger.prove` accepts (it deserialises with the markers `'signature'`,
      `'pre-proof'`, `'pre-binding'`). Prove it with a throwaway script building a `startDeposit`
      call and proving it through the running proof server.
- [x] R7. The minimal `PrivateStateProvider` an in-memory implementation must satisfy (members
      in `node_modules/@midnight-ntwrk/midnight-js-types/dist/index.d.ts` around line 627:
      `setContractAddress`, `get`, `set`, `remove`, `clear`, signing-key methods, export and
      import). Decide between a tiny in-memory class and
      `@midnight-ntwrk/midnight-js-level-private-state-provider`. In-memory is preferred: the
      vault's private state is only the caller secret, which the server never persists.
- [x] R8. Whether `nodeZkConfigRegistry(root)` (already used for the proof provider) satisfies the
      `zkConfigProvider` slot `createUnprovenCallTx` and `flushPending` expect, or whether a
      `NodeZkConfigProvider<VaultCircuitId>` over `zk-assets/ethereum-erc20-vault` is needed
      beside it.
- [x] R9. Whether `createUnprovenCallTx` needs a real `walletProvider` for `startDeposit` (no
      mint) or only for `completeDeposit` (mints to `ownPublicKey()`). Decides whether
      `startDeposit` must take the wallet's public keys too.
- [x] R10. How `makeCompiledContract(name, Contract, witnesses, zkAssetsPath)` from
      `@sig-net/midnight-contract-deploy` binds assets, and whether pointing it at
      `zk-assets/ethereum-erc20-vault` works with the layout `yarn zk-assets` produces (`keys/`
      and `zkir/` under that directory). Fallback: build the `CompiledContract` with
      `@midnight-ntwrk/compact-js` directly.

Stage 4:

- [ ] R11. The `SignetRequestResponseReader` is configured per requests path. Confirm one reader
      per action (deposit uses `VAULT_DEPOSIT_REQUESTS_PATH`) is enough, and whether
      `signetEventsFromBlock` matters for a long-running stack (how far back the indexer streams).
- [ ] R12. The `RespondBidirectionalEvent` fields the queue circuit input needs
      (`respondBidirectionalEventToCircuitInput`) so the row stores enough to rebuild it:
      `requestId`, `blockHeight`, `outputKind`, `serializedOutputLength`, `digest`,
      `signature { bigR { x, y }, s, recoveryId }`.

## Stage 0: dependencies, configuration and environment

- [x] Add dependencies, each with the consumer that imports it:
      `@midnight-ntwrk/midnight-js-indexer-public-data-provider@5.0.0-beta.6` (the vault ledger
      port and the signet reader), `@midnight-ntwrk/compact-js@2.5.5-rc.7` (the compiled-contract
      binding, see R10 in the findings log), `ethers@^6.17.0` as a direct dependency (EVM
      broadcast and funding, consumed from Stage 3).
- [x] Add config modules under `src/lib/config`, following `midnight-prover-config.ts`: - `midnight-relayer-config.ts`: `MIDNIGHT_RELAYER_SEED` (hex), server-only. - `midnight-respond-output-config.ts`: `RESPOND_OUTPUT_SOURCE` (`evm-node` | `mpc-cache`,
      default `evm-node`) and optional `MPC_OUTPUT_CACHE_URL`, server-only. - Add both to `ServerOnlyConfig` in `server-config.ts` and to `.env.example` with the
      comment style used there.
- [x] Add `MIDNIGHT_USER_SEED` to `.env.local` for the integration test only (the test reads it
      from `process.env` after `integration-tests/setup.ts` loads the file). Document it in
      `.env.example` under a "tests" comment.
- [x] Fund the relayer and user wallets per R1, fund nothing on the EVM yet (the test does that
      per deposit).

Verification:

- [x] `yarn install` leaves the lockfile consistent and `yarn check` passes.
- [x] A throwaway script reads the vault ledger through the new public data provider and prints
      `initialised`, `allowedTokens` and `globalLastSeen` (R3).

## Stage 1: Midnight transaction additions

Files: `src/lib/midnight/transaction-v1/transaction.ts`, `transaction-state-controller.ts`,
`transaction-state-resolver-impl.ts`, `src/lib/db/schema.ts`, a migration, the tests beside them.

- [x] Add `signer` to the resource and the table:

```ts
export const MIDNIGHT_TRANSACTION_SIGNERS = ['caller', 'relayer'] as const
// schema: signer: z.enum(MIDNIGHT_TRANSACTION_SIGNERS)
// table:  signer: text('signer', { enum: MIDNIGHT_TRANSACTION_SIGNERS }).notNull()
```

      The migration must give existing rows a value: either `default 'caller'` in the generated
      SQL or delete the test rows first. `drizzle-kit migrate` swallows SQL errors, so confirm
      with `docker compose exec -T postgres psql -U demo -d demo -c '\d midnight_transactions_v1'`.

- [x] Put the parent in the lifecycle events so a parent's consumer can match without a read:

```ts
export const transactionEventDataSchema = z.object({
  name: midnightTransactionNameSchema,
  parent: z.string().min(1),
})
// controller-impl publishEntered: TRANSACTION_EVENT_BY_STATE[state].create(name, { name, parent })
```

- [x] Add a `RelayerWallet` port, `src/lib/midnight/wallet/relayer-wallet.ts` (a backend-wide capability, not part of the versioned transaction resource):

```ts
/** The backend's own wallet, which finalises relayer-signed transactions. */
export interface RelayerWallet {
  /** Balances, signs and finalises the unbound bytes, resolving with the finalized bytes. */
  finalize(unboundTx: string): Promise<string>
}
```

- [x] Resolver: `AwaitingWallet` gains one branch. The caller's transaction stays the browser's
      to-do. The relayer's is finalised here and handed to the existing `submitTransaction`
      transition, so the state table does not change:

```ts
case 'AwaitingWallet': return this.resolveAwaitingWallet(transaction)

private async resolveAwaitingWallet({ name, signer, unboundTx }: MidnightTransaction): Promise<void> {
  if (signer === 'caller' || unboundTx === null) return
  const finalizedTx = await this.relayerWallet.finalize(unboundTx)      // slow, outside any transaction
  return this.write(() => this.stateController.submitTransaction({ name, finalizedTx }))
}
```

- [x] A `TransactionService` for the user's side, `transaction-service.ts` and impl, adaptor and
      action, in the one shape every service has:

```ts
export interface TransactionService {
  getTransaction(caller: Caller, args: GetTransactionArgs): Promise<MidnightTransaction | undefined>
  /** The wallet balanced and signed the unbound bytes: AwaitingWallet to AwaitingSubmission. */
  submitTransaction(caller: Caller, args: SubmitTransactionArgs): Promise<MidnightTransaction>
  /** The live transactions a parent owns, so the UI finds the one awaiting the wallet. */
  listTransactions(caller: Caller, args: ListTransactionsArgs): Promise<MidnightTransaction[]>
}
// submitTransactionArgsSchema = z.object({ name: midnightTransactionNameSchema, finalizedTx: hexSchema })
// listTransactionsArgsSchema  = z.object({ parent: z.string().min(1) })
// Ownership: resourceOwnedByCaller(name, caller) on every method, and the adaptor's submit runs in runInTransaction.
```

- [x] Update `transaction-fixtures.ts` and the four unit test files for the new field and the new
      branch (a relayer transaction in `AwaitingWallet` is finalised and submitted, a caller one
      is left alone, a finalise failure propagates).

Verification:

- [x] `yarn db:generate`, `yarn db:migrate`, `\d midnight_transactions_v1` shows `signer`.
- [x] `yarn check` passes, `yarn test:integration` passes (the resolve test now commits with
      `signer: 'caller'`).

## Stage 2: the relayer wallet, providers and circuits

Files: `src/lib/midnight/wallet/relayer-wallet-seed-impl.ts` (implements the Stage 1 port),
`src/lib/midnight/ethereum-erc20-vault/vault-providers.ts`, `vault-circuits.ts` and
`vault-circuits-midnight-js-impl.ts`, `vault-ledger.ts` and `vault-ledger-indexer-impl.ts`,
`src/lib/midnight/private-state/in-memory-private-state-provider.ts`.

- [x] `RelayerWalletSeedImpl` reuses the facade module, not the browser `SeedWallet` class:

```ts
export class RelayerWalletSeedImpl implements RelayerWallet {
  private provider: (WalletProvider & MidnightProvider) | undefined
  constructor(
    private readonly config: MidnightNetworkConfig,
    private readonly seed: string,
  ) {}

  /** Starts the facade and waits for the first synced state. Called once from start-up. */
  async start(): Promise<void> {
    const keys = deriveAccountKeys(this.seed, this.config.networkId)
    const facade = await initialiseWalletFacade(keys, this.config)
    await facade.start(keys.shieldedSecretKeys, keys.dustSecretKey)
    await firstSyncedState(facade) // subscribe to facade.state(), resolve on isSynced
    this.provider = createWalletAndMidnightProvider(facade, keys)
  }
  async finalize(unboundTx: string): Promise<string> {
    const unbound = Transaction.deserialize<SignatureEnabled, Proof, PreBinding>(
      'signature',
      'proof',
      'pre-binding',
      hexToBytes(unboundTx),
    )
    const finalized = await this.requireProvider().balanceTx(unbound)
    return bytesToHex(finalized.serialize())
  }
  /** The wallet and midnight provider slots of a VaultProviders set. */
  walletProvider(): WalletProvider & MidnightProvider {
    return this.requireProvider()
  }
}
```

      Check the exact marker types `balanceTx` expects against `WalletProvider['balanceTx']` in
      `@midnight-ntwrk/midnight-js-types`, the facade file already types it. `setNetworkId` is
      process-global and midnight-js reads it: call it once in `createBackend`.

- [x] (folded into the composition root, see the findings log) `vault-providers.ts` assembles the `VaultProviders` set the SDK calls take, from parts the
      backend already owns plus the new ones:

```ts
export function vaultProviders(parts: {
  publicDataProvider: PublicDataProvider // indexerPublicDataProvider({ indexerQueryUrl, indexerWsUrl })
  zkConfigProvider: ZKConfigProvider<VaultCircuitId> // R8
  proofProvider: ProofProvider // the backend's httpClientProofProvider
  privateStateProvider: PrivateStateProvider<VaultPrivateStateId, VaultPrivateState> // R7
  wallet: WalletProvider & MidnightProvider // the relayer's, or a stub carrying the user's public keys
}): VaultProviders
```

- [x] `vault-circuits.ts` is the port that builds unproven calls as hex, one method per circuit
      the deposit needs, each `createCallTxOptions` + `createUnprovenCallTx` + serialise:

```ts
export interface VaultCircuits {
  startDeposit(args: {
    secret: Uint8Array
    wallet: WalletPublicKeys
    inIndex: bigint
    evmNonce: bigint
    gas: GasParams
    request: DepositRequest
  }): Promise<string>
  completeDeposit(args: {
    secret: Uint8Array
    wallet: WalletPublicKeys
    requestId: Uint8Array
    serializedOutput: Uint8Array
    mintNonce: Uint8Array
  }): Promise<string>
  sendDeposit(args: { outIndex: Uint8Array }): Promise<string>
  queueAttestation(args: {
    attestation: RespondBidirectionalEvent
    serializedOutput: Uint8Array
  }): Promise<string> // picks 0, 1 or 32 by output length
}
export interface WalletPublicKeys {
  readonly coinPublicKey: string
  readonly encryptionPublicKey: string
}
```

      The impl holds the public data provider, the zk config provider and the compiled contract,
      and builds a fresh in-memory private state provider per call: the caller's secret for the
      two user circuits, the relayer's own secret for the permissionless ones (the witness is not
      called, any secret proves). The wallet slot is the relayer's provider for permissionless
      calls and a stub returning the user's keys for the user's calls (R9). The result is
      `bytesToHex(call.private.unprovenTx.serialize())` (R6).

- [x] `vault-ledger.ts` is the read port, one method, and a pure stage function beside it:

```ts
export interface VaultLedger {
  state(): Promise<VaultLedgerState> // readVaultLedger(publicDataProvider, vaultAddress)
}

export type RequestStage =
  | { stage: 'queued' }
  | { stage: 'flushed'; outIndex: Uint8Array; lastSeen: bigint }
  | { stage: 'sent'; outIndex: Uint8Array; lastSeen: bigint; requestId: Uint8Array }
  | { stage: 'attestationQueued'; requestId: Uint8Array }
  | { stage: 'attestationFlushed'; requestId: Uint8Array; record: AttestationRecord }
  | { stage: 'settled' }

/** Where the ledger holds the request queued under inIndex. Pure, unit tested with a fake state. */
export function requestStage(
  state: VaultLedgerState,
  action: Action,
  inIndex: bigint,
  known: { requestId: Uint8Array | null },
): RequestStage {
  if (state.inputRequestBuffer.member(inIndex)) return { stage: 'queued' }
  if (!state.depositArgsMap.member(inIndex)) return { stage: 'settled' } // args leave at complete
  const outIndex = flushedRequestIndex(state, action, inIndex) // throws when no open request carries it
  const out = state.outputRequestBuffer.lookup(outIndex)
  if (known.requestId === null) {
    // sent or not: the send writes evictionMap under the request id, which only the row knows
    // once recorded. Before that, scan evictionMap for an entry pointing at outIndex.
    const requestId = findRequestIdFor(state.evictionMap, outIndex)
    if (requestId === undefined) return { stage: 'flushed', outIndex, lastSeen: out.lastSeen }
    return { stage: 'sent', outIndex, lastSeen: out.lastSeen, requestId }
  }
  if (state.outputAttestationBuffer.member(known.requestId))
    return {
      stage: 'attestationFlushed',
      requestId: known.requestId,
      record: state.outputAttestationBuffer.lookup(known.requestId),
    }
  if (state.inputAttestationBuffer.member(known.requestId))
    return { stage: 'attestationQueued', requestId: known.requestId }
  return { stage: 'sent', outIndex, lastSeen: out.lastSeen, requestId: known.requestId }
}
```

      `evictionMap` is iterable (`[requestId, outIndex]` pairs), so `findRequestIdFor` is a
      linear scan. The generated map types are classes with `member`/`lookup`/iterator, so the
      unit test builds a small fake satisfying that shape.

- [x] (named `private-state-provider-memory-impl.ts`) `in-memory-private-state-provider.ts`: the minimal `PrivateStateProvider` (R7), a `Map`
      keyed by contract address and private state id. Place it under `src/lib/midnight/` since
      every contract will use it.

Verification:

- [x] A throwaway script builds a `startDeposit` unproven call for a random secret, proves it
      through the proof server with `TransactionLedgerMidnightImpl.prove`, and prints the unbound
      length (R6, R8, R9, R10 resolved and logged).
- [x] Unit tests: `requestStage` over every stage with fake ledger states, `VaultCircuits` is not
      unit tested (it is a thin wrapper over the SDK, covered by the integration test).
- [x] `yarn check` passes.

## Stage 3: the Ethereum transaction entity

Files: `src/lib/ethereum/transaction-v1/transaction.ts` (exists as a draft), new
`transaction-state-machine.ts`, `transaction-state-controller.ts` and impl, `transaction-ledger.ts`
and `transaction-ledger-ethers-impl.ts`, `transaction-state-resolver.ts` and impl,
`transaction-event-consumer.ts`, `transaction-fixtures.ts`, tests.

- [ ] Rename the draft's states to the awaiting style and add a failure reason. A migration
      follows, with the same existing-rows care as Stage 1:

```ts
export const ETHEREUM_TRANSACTION_STATES = [
  'AwaitingSubmission',
  'AwaitingInclusion',
  'Succeeded',
  'Failed',
] as const
export const ETHEREUM_TRANSACTION_TERMINAL_STATES = ['Succeeded', 'Failed'] as const
export const ETHEREUM_TRANSACTION_FAILURES = [
  'Rejected',
  'Reverted',
  'NonceConsumed',
  'Expired',
] as const
// fields: name, parent, state, signedTx, txHash, expireTime, failure, error, createTime, updateTime
// unsignedTx is dropped: the MPC signs, the backend only ever holds signed bytes.
```

- [ ] State machine, controller and events mirror the Midnight ones exactly (`nextState`,
      `assertConsistent`, `EXPIRABLE_STATES`, `TransactionStateConflict`, an event per state
      with type prefix `ethereum.transaction-v1.` and data `{ name, parent }`). Controller
      methods: `commitTransaction`, `recordSubmission` (name, txHash), `recordSuccess`,
      `recordFailure` (name, failure, error), `expireTransaction`.
- [ ] The ledger port and its ethers impl port the prep repository's broadcast rules:

```ts
export interface EthereumTransactionLedger {
  /** Sends the signed bytes and resolves with the hash. An already-known or already-mined transaction resolves normally. */
  broadcast(signedTx: string): Promise<string>
  status(txHash: string, from: string, nonce: bigint): Promise<EthereumLedgerStatus>
}
export type EthereumLedgerStatus =
  | { outcome: 'pending' }
  | { outcome: 'mined'; blockNumber: bigint }
  | { outcome: 'reverted'; blockNumber: bigint }
  | { outcome: 'nonceConsumed' } // getTransactionCount(from, 'latest') > nonce and no receipt for txHash
```

      `broadcast`: parse with ethers `Transaction.from(signedTx)`, `getTransactionReceipt(hash)`
      first and return the hash when mined, then `broadcastTransaction`, swallowing
      `NONCE_EXPIRED` and the "already known" family of messages. `status`: receipt present means
      mined or reverted by `receipt.status`, else the nonce check, else pending.

- [ ] Resolver: `AwaitingSubmission` broadcasts and records the hash (a thrown error other than
      already-known records `Rejected`), `AwaitingInclusion` maps the status, expiry first as in
      the Midnight resolver. Consumer: every Ethereum transaction event calls
      `resolveTransaction`.

Verification:

- [ ] Unit tests table-driven as the Midnight ones: state machine over every pair, controller per
      action, resolver per status.
- [ ] `yarn db:generate`, `yarn db:migrate`, `\d ethereum_transactions_v1`.
- [ ] Integration test `integration-tests/ethereum-transaction-broadcast.test.ts`: fund a fresh
      anvil account, sign a zero-value self-transfer with ethers, commit it, resolve twice, expect
      `Succeeded` with a hash. Resolve a third time and expect no change.
- [ ] `yarn check` passes.

## Stage 4: the vault request entity

Files under `src/lib/midnight/ethereum-erc20-vault/vault-request-v1/`: `vault-request.ts`,
`vault-request-repository.ts` and SQL impl, `vault-request-state-machine.ts`,
`vault-request-state-controller.ts` and impl, `vault-request-state-resolver.ts` and impl,
`vault-request-event-consumer.ts`, `vault-request-fixtures.ts`, tests. Beside them under
`ethereum-erc20-vault/`: `respond-outcome-source.ts` with `respond-outcome-source-evm-node-impl.ts`
and `respond-outcome-source-mpc-cache-impl.ts`, `signet-readers.ts`. Schema and a migration.

- [ ] The resource. `Request` alone would read as the kind of `DepositRequest`, so the entity is
      qualified:

```ts
export const VAULT_REQUEST_COLLECTION = 'ethereum-erc20-vault-requests'
export const VAULT_REQUEST_STATES = [
  'AwaitingFlush',
  'AwaitingSend',
  'AwaitingSignature',
  'AwaitingBroadcast',
  'AwaitingAttestation',
  'AwaitingAttestationQueue',
  'AwaitingAttestationFlush',
  'Attested',
] as const
export const VAULT_REQUEST_TERMINAL_STATES = ['Attested'] as const
export const VAULT_REQUEST_ACTIONS = ['deposit'] as const // grows with withdraw, swap, ...

export const vaultRequestSchema = z.object({
  name: vaultRequestNameSchema, // callers/{caller}/ethereum-erc20-vault-requests/{uuid}
  parent: z.string().min(1), // the deposit
  action: z.enum(VAULT_REQUEST_ACTIONS),
  state: z.enum(VAULT_REQUEST_STATES),
  inIndex: uint64Schema,
  depositAccount: evmAddressSchema, // the expected signer, copied from the deposit
  outIndex: hex32Schema.nullable(),
  requestId: hex32Schema.nullable(),
  signedTx: hexSchema.nullable(), // the MPC-signed sweep, ethers Transaction.serialized
  attestationBlockHeight: uint64Schema.nullable(),
  attestationOutputKind: z.enum(['executed', 'failed', 'unviable']).nullable(),
  attestationDigest: hex32Schema.nullable(),
  attestationSignature: hexSchema.nullable(), // bigR.x || bigR.y || s || recoveryId, 97 bytes, codec in this file
  attestationOutput: hexSchema.nullable(), // the verified bytes, '' for the empty output
  createTime: z.date(),
  updateTime: z.date(),
})
```

      Table `midnight_ethereum_erc20_vault_requests_v1`, columns named as the fields, contract
      integers as `numeric(39,0)`, and a partial unique index on `(parent, action)` over
      non-terminal states. Two helpers in the resource file: `attestationToEvent(request)`
      rebuilding the `RespondBidirectionalEvent` for the circuit input (R12), and its inverse.

- [ ] State machine: `nextState(state, action)` over the actions `recordFlushed`, `recordSent`,
      `recordSignature`, `recordBroadcast`, `recordAttestation`, `recordAttestationQueued`,
      `recordAttested`, each legal from exactly one state, plus `assertConsistent` (`outIndex`
      set from `AwaitingSend`, `requestId` from `AwaitingSignature`, `signedTx` from
      `AwaitingBroadcast`, the attestation fields from `AwaitingAttestationQueue`).
- [ ] Controller: `queueRequest` creates the row in `AwaitingFlush` and publishes, one method
      per action above (read with `lock: 'update'`, `nextState`, patch, `assertConsistent`,
      update, publish the event of the state entered with name and parent), and three child
      starters that keep the request's state and commit a child through the child's controller:

```ts
startSend({ name, unprovenTx }) // midnight tx: parent name, circuit 'sendDeposit', signer 'relayer', AwaitingProof
startBroadcast({ name }) // ethereum tx: parent name, signedTx from the row, AwaitingSubmission
startAttestationQueue({ name, unprovenTx }) // midnight tx: circuit 'queueAttestation0' | 'queueAttestation1', signer 'relayer'
// A unique violation on the child's live index means another resolver committed first: map it to VaultRequestStateConflict.
```

      Event types `midnight.ethereum-erc20-vault.vault-request-v1.<kebab-state>`.

- [ ] `signet-readers.ts`: one `SignetRequestResponseReader` per action, built from the vault
      address, the action's requests path, the signet address, the public data provider and
      `signetEventSourceFromIndexer({ queryUrl: indexerURL })` (R11).
- [ ] `respond-outcome-source.ts`, the one genuinely new port:

```ts
export interface RespondOutcomeSource {
  /** The first attestation post whose signature verifies over bytes obtained from this source, or undefined while none does. */
  attestedOutcome(args: {
    requestId: Uint8Array
    mpcResponseKey: Secp256k1Point
  }): Promise<RespondOutcome | undefined>
}
export interface RespondOutcome {
  readonly event: RespondBidirectionalEvent
  readonly serializedOutput: Uint8Array
}
```

      Both impls take the action's reader. The MPC cache impl checks every post over
      `MpcOutputCacheReader.fetchSerializedOutput(requestId)`. The EVM node impl ports
      `fetchAttestedRespondOutcome` and `observeExecution` from the prep repository: for a post
      declaring `executed`, find the mined transaction among the request's signature posts, trace
      its top frame with `debug_traceTransaction` (`callTracer`), and recompute the bytes with
      `executedEvmRespondOutput(schema, isEvmContractCall(tx.data), evmTraceOutputFromCallFrame(frame))`
      where the schema comes from `getSignatureRequest(requestId).outputDeserializationSchema`.
      For `failed` or `unviable`, the candidate is the empty output. Verify each post with
      `verifyRespondBidirectionalSignature(candidate, post, mpcResponseKey)`.

- [ ] Resolver, with the loop from the overview applied per state:

```ts
async resolveVaultRequest({ name }): Promise<void> {
  const request = await this.repository.get(name); if (!request) return
  if (TERMINAL.includes(request.state)) return
  const state = await this.vaultLedger.state()
  const stage = requestStage(state, request.action, request.inIndex, { requestId: bytesOrNull(request.requestId) })
  switch (request.state) {
    case 'AwaitingFlush':
      if (stage.stage !== 'queued') return this.write(() => this.controller.recordFlushed({ name, outIndex: hex(stage.outIndex) }))
      return                                                           // the Flusher carries it
    case 'AwaitingSend':
      if (stage.stage === 'sent' || later) return this.write(() => this.controller.recordSent({ name, requestId: hex(stage.requestId) }))
      if (await this.liveChild(name, 'sendDeposit')) return
      return this.write(async () => this.controller.startSend({ name, unprovenTx: await this.circuits.sendDeposit({ outIndex }) }))
      // NOTE: build the unproven call BEFORE opening the write, it is slow. Pattern: const unprovenTx = await ...; return this.write(() => startSend({ name, unprovenTx }))
    case 'AwaitingSignature': {
      const signed = await this.readers.deposit.getSignedEvmTransaction(requestIdHex(request.requestId), request.depositAccount)
      if (signed) return this.write(() => this.controller.recordSignature({ name, signedTx: signed.serialized }))
      return
    }
    case 'AwaitingBroadcast': {
      const child = await this.latestEthereumChild(name)
      if (!child) return this.write(() => this.controller.startBroadcast({ name }))
      if (ETHEREUM_TERMINAL.includes(child.state)) return this.write(() => this.controller.recordBroadcast({ name }))
      return                                                           // the MPC attests whichever way the EVM transaction ended
    }
    case 'AwaitingAttestation': {
      const outcome = await this.outcomeSource.attestedOutcome({ requestId, mpcResponseKey: state.mpcResponseKey })
      if (outcome) return this.write(() => this.controller.recordAttestation({ name, ...attestationFields(outcome) }))
      return
    }
    case 'AwaitingAttestationQueue':
      if (stage.stage === 'attestationQueued' || stage.stage === 'attestationFlushed') return this.write(() => this.controller.recordAttestationQueued({ name }))
      if (stage.stage === 'sent' && request.attestationBlockHeight <= stage.lastSeen) {
        // Invariant guard, never a state: only a consumed nonce at start reaches here, which the deposit
        // service's nonce assignment prevents. Log and leave the row for the sweep to re-check.
        console.error(`vault request ${name} attested at ${height} at or below lastSeen ${lastSeen}: nonce reuse at start`)
        return
      }
      if (await this.liveChild(name, queueCircuitFor(request))) return
      const unprovenTx = await this.circuits.queueAttestation({ attestation: attestationToEvent(request), serializedOutput })
      return this.write(() => this.controller.startAttestationQueue({ name, unprovenTx }))
    case 'AwaitingAttestationFlush':
      if (stage.stage === 'attestationFlushed') return this.write(() => this.controller.recordAttested({ name }))
      return
  }
}

/** Every request waiting for a flush, re-read after a flush landed or on the sweep. */
async resolveWaitingFlushes(): Promise<void>   // search state in [AwaitingFlush, AwaitingAttestationFlush], resolve each
async resolvePending(): Promise<void>          // search each non-terminal state, resolve each
```

      `liveChild(name, circuit)` is a `search` on the Midnight transaction repository with
      criteria `parent = name`, `circuit = circuit`, and a check that the newest row is
      non-terminal. A failed child whose step the ledger does not show done is simply replaced by
      a new one, which is the infinite retry.

- [ ] Consumer: wants Midnight transaction terminal events and Ethereum transaction terminal
      events whose `parent` matches `vaultRequestNameSchema`, calling `resolveVaultRequest` with
      the parent as the name, and the flush-succeeded nudge from Stage 5 calling
      `resolveWaitingFlushes()`.

Verification:

- [ ] Unit tests: state machine over every pair, controller per action including the three child
      starters and the conflict mapping, resolver over every state with a mocked `VaultLedger`
      (fake states), mocked readers, mocked outcome source, mocked circuits and a pass-through
      unit of work, consumer matching.
- [ ] `yarn db:generate`, `yarn db:migrate`, `\d midnight_ethereum_erc20_vault_requests_v1`.
- [ ] `yarn check` and `yarn test:integration` pass.

## Stage 5: the flusher

File: `src/lib/midnight/ethereum-erc20-vault/flusher.ts` and `flusher-impl.ts`. No entity, no
row: the ledger holds the queue and `flushPending` is the whole batch.

```ts
export interface Flusher {
  /** Flushes until nothing waits. Coalesces: a call during a run marks the run to go again. */
  flush(): Promise<void>
}

export class FlusherImpl implements Flusher {
  private running: Promise<void> | undefined
  private runAgain = false
  constructor(
    private readonly providers: VaultProviders,
    private readonly compiled: VaultCompiledContract,
    private readonly vaultAddress: string,
    private readonly onFlushed: () => Promise<void>,
  ) {}

  flush(): Promise<void> {
    if (this.running) {
      this.runAgain = true
      return this.running
    }
    this.running = this.runUntilDrained().finally(() => {
      this.running = undefined
    })
    return this.running
  }
  private async runUntilDrained(): Promise<void> {
    do {
      this.runAgain = false
      let moved: number
      try {
        moved = await flushPending(this.providers, this.compiled, this.vaultAddress)
      } catch (error: unknown) {
        if (!isLostRace(error)) throw error
        this.runAgain = true
        continue
      } // CallTxFailedError FailFallible, or a flushQueue assert
      if (moved > 0) {
        await this.onFlushed()
        this.runAgain = true
      } // more may wait behind the width
    } while (this.runAgain)
  }
}
```

- [ ] `onFlushed` is `vaultRequestStateResolver.resolveWaitingFlushes`, wired in the composition
      root. `isLostRace` recognises `CallTxFailedError` with status `FailFallible` and the three
      `flushQueue` assert messages: Request not queued, Attestation not queued, Identical request
      open.
- [ ] A `FlushEventConsumer` wants the vault request events `awaiting-flush` and
      `awaiting-attestation-flush` and calls `flusher.flush()`. Two replicas racing is handled by
      the chain, which is what the contract intends.
- [ ] Backpressure: `flushPending` proves, balances and waits for inclusion, so one run is
      minutes. That is acceptable for the demo and is why the sweep also calls `flush()`.

Verification:

- [ ] Unit test with a mocked `flushPending` (inject it as a function argument so the test can
      script it): zero moved runs once, moved then zero runs twice and calls `onFlushed` once, a
      lost race runs again, a coalesced call during a run causes one more run.
- [ ] `yarn check` passes.

## Stage 6: the deposit entity and its services

Files under `src/lib/midnight/ethereum-erc20-vault/deposit-v1/`: `deposit.ts` (exists),
`deposit-state-machine.ts`, `deposit-state-controller.ts` and impl (exist as placeholders),
`deposit-state-resolver.ts` and impl, `deposit-event-consumer.ts`, `deposit-service.ts` and impl
(exist), `deposit-service-adaptor.ts` (exists), `deposit-fixtures.ts`, tests, and
`src/server/actions/deposit-actions.ts`.

- [ ] Resource changes in `deposit.ts`:

```ts
export const DEPOSIT_STATES = [
  'AwaitingStartTransaction',
  'AwaitingVaultRequest',
  'AwaitingCompletion',
  'AwaitingCompleteTransaction',
  'Completed',
  'Failed',
] as const
export const DEPOSIT_TERMINAL_STATES = ['Completed', 'Failed'] as const
export const DEPOSIT_FAILURES = ['StartFailed'] as const
// add: depositAccount: evmAddressSchema (server-assigned, shown to the user as the address to fund),
//      outcome: z.enum(['minted', 'closed']).nullable() (from the attestation on completion),
//      failure, error, createTime, updateTime
```

      Migration with the usual care for existing rows.

- [ ] State machine over the actions `recordStarted`, `recordStartFailure`, `recordAttested`,
      `complete` (`AwaitingCompletion` to `AwaitingCompleteTransaction`),
      `recordCompleted`, `recordCompleteFailure` (back to `AwaitingCompletion`), with
      `assertConsistent`.
- [ ] Controller. Two methods are called by the service, since the user must act, and the rest by
      the resolver:

```ts
startDeposit({ caller, name, depositRequest, assigned, unprovenTx })
// creates the row in AwaitingStartTransaction with the server-assigned fields, commits the start
// transaction (parent name, circuit 'startDeposit', signer 'caller', AwaitingProof), publishes
recordStarted({ name })
// AwaitingStartTransaction -> AwaitingVaultRequest, and queues the child VaultRequest through its
// controller in the same unit of work: { parent: name, action: 'deposit', inIndex, depositAccount }
recordStartFailure({ name, error }) // -> Failed, StartFailed
recordAttested({ name }) // -> AwaitingCompletion
completeDeposit({ name, unprovenTx }) // AwaitingCompletion -> AwaitingCompleteTransaction, commits the complete transaction
recordCompleted({ name, outcome }) // -> Completed
recordCompleteFailure({ name }) // AwaitingCompleteTransaction -> AwaitingCompletion
```

      Events `midnight.ethereum-erc20-vault.deposit-v1.<kebab-state>`, data `{ name }` (a deposit
      has no parent).

- [ ] Service. The slow building of the circuit call happens before the adaptor's transaction is
      opened, so the service method is split: a pure `prepare` outside and the controller call
      inside is not possible with the current adaptor shape (one `runInTransaction` around the
      whole call). Keep the adaptor's shape and accept that the unproven call is built inside
      the transaction for these two user actions, noting it in `AGENTS.md` as the second
      documented exception beside the outbox's Kafka send, or build it in the adaptor before
      opening the transaction and pass it in. Decide, record the decision in the findings log.

```ts
export interface DepositService {
  startDeposit(caller, { depositRequest, wallet }): Promise<Deposit>
  // assigns: inIndex = newInputIndex(), depositAccount = deriveEvmAddress(mpcRootPublicKey, vaultAddress, hex(pureCircuits.userCommitment(caller.secretKey))),
  //          evmNonce = max(ethereum.getTransactionCount(depositAccount, 'pending'), 1 + highest evmNonce among this caller's
  //          non-terminal deposits), gas = the Stage 0 R5 envelope. The second operand is what keeps the stale attestation
  //          case unreachable: a second deposit started before the first sweep is broadcast would otherwise reuse its nonce.
  // unprovenTx = circuits.startDeposit({ secret: caller.secretKey, wallet, inIndex, evmNonce, gas, request })
  completeDeposit(caller, { name, wallet }): Promise<Deposit>
  // requires state AwaitingCompletion and an Attested child request; mintNonce = 32 random bytes;
  // serializedOutput = the request's attestationOutput for 'executed', one zero byte otherwise (the circuit ignores it)
  getDeposit(caller, { name }): Promise<Deposit | undefined>
  listDeposits(caller, {}): Promise<Deposit[]>
}
// wallet: { coinPublicKey, encryptionPublicKey } from the browser wallet, validated by a hex schema. R9 decides whether startDeposit needs it.
```

- [ ] Resolver, nudged by the children's terminal events:

```ts
async resolveDeposit({ name }): Promise<void> {
  const deposit = await this.repository.get(name); if (!deposit || TERMINAL.includes(deposit.state)) return
  switch (deposit.state) {
    case 'AwaitingStartTransaction': {
      const tx = await this.latestChildTransaction(name, 'startDeposit')
      if (tx?.state === 'Succeeded') return this.write(() => this.controller.recordStarted({ name }))
      if (tx?.state === 'Failed') return this.write(() => this.controller.recordStartFailure({ name, error: tx.error ?? tx.failure }))
      return
    }
    case 'AwaitingVaultRequest': {
      const request = await this.latestVaultRequest(name)
      if (request?.state === 'Attested') return this.write(() => this.controller.recordAttested({ name }))
      return
    }
    case 'AwaitingCompletion': return                                   // the user's to-do
    case 'AwaitingCompleteTransaction': {
      const tx = await this.latestChildTransaction(name, 'completeDeposit')
      if (tx?.state === 'Succeeded') return this.write(() => this.controller.recordCompleted({ name, outcome: outcomeOf(request) }))
      if (tx?.state === 'Failed') return this.write(() => this.controller.recordCompleteFailure({ name }))
      return
    }
  }
}
```

- [ ] Consumer: wants Midnight transaction terminal events and vault request terminal events
      whose `parent` matches `depositNameSchema`, calling `resolveDeposit({ name: parent })`.
- [ ] Adaptor gains `completeDeposit` and `listDeposits`, actions gain the same one-liners.

Verification:

- [ ] Unit tests: state machine, controller (including the child creation in `recordStarted` and
      the two commits), service (assignment, including the nonce taking the higher of the chain's
      pending count and one above the caller's live deposits, ownership refusal, wrong-state
      refusal), resolver per state, consumer matching.
- [ ] `yarn db:generate`, `yarn db:migrate`, `\d midnight_ethereum_erc20_vault_deposits_v1`.
- [ ] `yarn check` and `yarn test:integration` pass.

## Stage 7: composition and start-up

Files: `src/server/backend.ts`, `src/server/start.ts`, `src/server/actions/*.ts`.

- [ ] `createBackend` grows per package, in dependency order, keeping the tree mirror:

```ts
Backend {
  config, db, kafka, event,
  ethereum: { ledger: EthereumTransactionLedger, transactionV1: { repository, stateController, stateResolver, eventConsumer } },
  midnight: {
    relayer: { wallet: RelayerWalletSeedImpl, caller: Caller },          // the relayer is a caller like any other
    publicDataProvider, zkConfigProvider, proofProvider,
    transactionV1: { repository, stateController, ledger, stateResolver, eventConsumer, service, adaptor },
    ethereumErc20Vault: {
      compiledContract, providers (relayer), circuits, ledger: VaultLedger, readers, outcomeSource, flusher, flushEventConsumer,
      vaultRequestV1: { repository, stateController, stateResolver, eventConsumer },
      depositV1: { repository, stateController, stateResolver, eventConsumer, service, adaptor },
    },
  },
  start(): Promise<void>      // see below
}
```

- [ ] Move the start-up into the backend object so the integration test can run it through the
      one import it is allowed (`getBackend`). `src/server/start.ts` becomes
      `(await getBackend()).start()`. `start()` starts the relayer wallet, registers the six
      consumers, starts the hub and the outbox relay, and starts the sweep:

```ts
async function sweepForever(backend): Promise<never> {
  for (;;) {
    for (const resolver of [
      midnight.transactionV1.stateResolver,
      ethereum.transactionV1.stateResolver,
      vaultRequestV1.stateResolver,
      depositV1.stateResolver,
    ])
      await resolver.resolvePending().catch(log)
    await flusher.flush().catch(log)
    await delay(SWEEP_INTERVAL_MS) // 30 s
  }
}
```

      `resolvePending()` on the Midnight and Ethereum transaction resolvers also covers expiry,
      which was already planned.

- [ ] `setNetworkId(midnightNetwork.networkId)` once at the top of `createBackend`.
- [ ] Update `scripts/check-boundaries.ts` only if a new file suffix appears that the lists do
      not cover (`-source.ts`, `flusher`). Plant a violation, see it fail, restore.

Verification:

- [ ] `yarn check` passes. Start the dev server through the preview tool and read its logs: the
      relayer wallet syncs, the consumers register, the sweep runs and finds nothing.
- [ ] `yarn test:integration` passes.

## Stage 8: the end-to-end integration test

File: `integration-tests/ethereum-erc20-vault-deposit.test.ts`. It imports `getBackend` from
`src` and nothing else from `src` (the boundary guard enforces it), plus the packages and
`ethers` directly. Timeout: the round trip takes several minutes (six proofs, MPC round trips,
EVM inclusion), so the file sets `{ timeout: 40 * 60_000 }` on its test.

```ts
describe('ERC20 vault deposit round trip', () => {
  let backend: Backend
  const callerSecret = randomHex32()                       // the user's vault caller secret
  const userSeed = process.env.MIDNIGHT_USER_SEED           // R1

  beforeAll(async () => {
    backend = await testBackend()
    await backend.start()                                  // consumers, outbox, relayer wallet, sweep
    user = await startUserWallet(userSeed, backend.config.client.midnightNetwork)   // deriveAccountKeys + initialiseWalletFacade + createWalletAndMidnightProvider, from the packages the facade uses
  })
  afterAll(async () => { delete this caller's rows from all four tables and its outbox entries; await backend.db.pool.end() })

  test('deposit from start to Completed', async () => {
    const { adaptor } = backend.midnight.ethereumErc20Vault.depositV1
    const transactions = backend.midnight.transactionV1.adaptor
    const wallet = { coinPublicKey: user.getCoinPublicKey(), encryptionPublicKey: user.getEncryptionPublicKey() }

    // 1. start
    const started = await adaptor.startDeposit(callerSecret, { depositRequest: { erc20Address: CIRCLE_USDC, amount: 1_000_000n }, wallet })
    expect(started.ok).toBe(true)
    const deposit = started.deposit

    // 2. fund the deposit account on the fork (R2, R3): anvil_setBalance + anvil_setStorageAt at the USDC balance slot
    await fundDepositAccount(deposit.depositAccount, deposit.amount)

    // 3. play the user's wallet: whenever a caller transaction under this deposit is AwaitingWallet, balance and submit it
    const playWallet = async () => {
      const live = await transactions.listTransactions(callerSecret, { parent: deposit.name })
      for (const tx of live.transactions.filter((t) => t.state === 'AwaitingWallet' && t.signer === 'caller')) {
        const finalized = await user.balanceTx(deserialiseUnbound(tx.unboundTx))
        await transactions.submitTransaction(callerSecret, { name: tx.name, finalizedTx: bytesToHex(finalized.serialize()) })
      }
    }

    // 4. drive to AwaitingCompletion
    await waitFor(async () => { await playWallet(); return (await getDeposit()).state === 'AwaitingCompletion' }, { every: 5_000 })

    // 5. complete, then play the wallet again until Completed
    expect((await adaptor.completeDeposit(callerSecret, { name: deposit.name, wallet })).ok).toBe(true)
    await waitFor(async () => { await playWallet(); return (await getDeposit()).state === 'Completed' }, { every: 5_000 })

    // 6. assertions on the trail
    const final = await getDeposit()
    expect(final.outcome).toBe('minted')
    const request = (await backend.midnight.ethereumErc20Vault.vaultRequestV1.repository.search({ criteria: [{ type: 'exact-text', field: 'parent', text: deposit.name }] }))[0]
    expect(request.state).toBe('Attested')
    expect(request.attestationOutputKind).toBe('executed')
    const ledger = await backend.midnight.ethereumErc20Vault.ledger.state()
    expect(ledger.depositArgsMap.member(request.inIndex)).toBe(false)       // settled
    // the user's shielded balance of the vault token grew by amount: read through user wallet state, token id from vaultTokenDomainSeparator
  }, 40 * 60_000)
})
```

- [ ] Write `waitFor`, `fundDepositAccount` (the storage-slot probe ported from the prep
      repository's `fork-funding.ts`) and `startUserWallet` as test-local helpers in
      `integration-tests/`. They may import the facade's SDK packages directly, not the facade
      module (the boundary rule).
- [ ] The expected event trail for this deposit, read from the outbox table by name, is asserted
      in order: deposit awaiting-start-transaction, transaction states for the start, deposit
      awaiting-vault-request, vault request states through attested, deposit awaiting-completion,
      the complete transaction's states, deposit completed.

Verification:

- [ ] `yarn vitest run --config vitest.integration.config.ts integration-tests/ethereum-erc20-vault-deposit.test.ts`
      passes against the running stack. Stop any leftover dev server first: its outbox relay and
      consumers compete with the test's.
- [ ] Run it a second time without cleaning the chain: a fresh caller secret and a fresh
      `inIndex` make the second deposit independent, and it must pass again.
- [ ] `yarn test:integration` passes as a whole.

## Stage 9: documentation and final checks

- [ ] `README.md`: a "Deposit lifecycle" section describing the five entities, the flusher, the
      sweep, the relayer wallet and the new environment variables, in human terms, self-contained.
      Every command quoted was run verbatim.
- [ ] `AGENTS.md`: extend the lifecycle section with the parent nudge (`{ name, parent }` in child
      events), the ledger-as-acknowledgement rule for chain steps, the rule that a vault-level
      batch (the flush) is a process and not an entity, and the relayer transaction rule
      (`signer`). Record the Stage 6 decision on where the unproven call is built.
- [ ] `docs/architecture.drawio` and `docs/deposit-state-diagram.drawio`: update the deposit and
      vault request state diagrams to the names in this plan.
- [ ] Grep the repository for every name this work invalidated (`Starting`, `AwaitingFlush` on
      the deposit, `AwaitingEVM`, `resolveDepositState`, `unsignedTx`, the old Ethereum states)
      and fix every hit.
- [ ] `yarn check` and `yarn test:integration` pass. Report warning counts honestly.

## Findings log

Append dated entries here as research items resolve and decisions are taken. Each entry names
the command, file or test that established it.

- 2026-10-09, R2: `EVM_RPC_URL` in `.env.local` answers `web3_clientVersion` with
  `anvil/v1.5.1`, so the anvil cheatcodes are available for funding the deposit account.
  Established by the curl command quoted under R2.
- 2026-10-09, stack: the running stack is the prep repository's `docker-compose.yaml`
  (`midnight-examples-fullstack-demo-prep`), not the repository `.env.local` used to name. Its
  `.env` is the source of the contract values, and the vault had been redeployed since
  `.env.local` was written: the signet address, the vault address and the MPC public key were
  all stale and are now synced. When a ledger read fails with "no contract state found", diff
  `.env.local` against that `.env` first.
- 2026-10-09, R1: the stack's test harness funds four role wallets from the genesis wallet
  (`DEPLOYER_SEED`, `USER_SEED`, `MPC_RESPONDER_SEED`, `BEARER_SEED` in the prep `.env`).
  `MIDNIGHT_RELAYER_SEED` is the bearer's seed and `MIDNIGHT_USER_SEED` the user's. The
  responder's seed is the fakenet MPC's own wallet and must not be reused.
- 2026-10-09, R3: the deployed vault allows Aave USDC, Circle USDC (`CIRCLE_USDC`) and Circle
  EURC; `initialised` is true. Read through `readVaultLedger` over
  `indexerPublicDataProvider`.
- 2026-10-09, R4: the MPC is the `fakenet-responder` container (`ghcr.io/sig-net/fakenet`)
  with no output cache configured, so the output source is `evm-node`. The fork answers
  `debug_traceTransaction` (a probe with a zero hash returns "resource not found", not
  "method not found").
- 2026-10-09, R5: the prep repository's deposit envelope is gas limit 100 000, max fee 30 gwei,
  priority fee 1 gwei (`integration-tests/src/evm-transfer.ts`). The deposit service assigns
  the same.
- 2026-10-09, R6: `createUnprovenCallTx(...).private.unprovenTx.serialize()` is accepted by
  `TransactionLedgerMidnightImpl.prove` (3144 hex chars in, 9430 out, under a second on a warm
  proof server), and `RelayerWalletSeedImpl.finalize` balances the result (15964 hex chars).
  Both proved by a script run as `NODE_OPTIONS=--conditions=react-server node_modules/.bin/tsx
--env-file=.env.local <script>.mts` from a gitignored folder inside the project (a script
  outside the project cannot resolve `node_modules`, and `.ts` outside it is treated as
  CommonJS).
- 2026-10-09, R7: `PrivateStateProvider` has thirteen members (state get, set, remove, clear,
  signing-key get, set, remove, clear, and export and import of states and keys). The in-memory
  implementation refuses the four export and import methods. `SigningKey` and
  `ContractAddress` are not exported by `@midnight-ntwrk/midnight-js/types`, so both are derived
  from the interface's own method parameters.
- 2026-10-09, R8: `nodeZkConfigRegistry` returns a `ZKConfigRegistry`, which is not a
  `ZKConfigProvider<K>`, so the call builder gets its own
  `NodeZkConfigProvider<VaultCircuitId>` over `zk-assets/ethereum-erc20-vault/` and the proof
  provider keeps the registry.
- 2026-10-09, R9: the call builder reads the wallet provider's coin and encryption public keys
  for `startDeposit` too (two calls observed), so both user circuits take the wallet's public
  keys as arguments and the permissionless ones use the relayer's.
- 2026-10-09, R10: `makeCompiledContract` in `@sig-net/midnight-contract-deploy` is three
  compact-js calls (`CompiledContract.make`, `withWitnesses`, `withCompiledFileAssets`), and
  that package drags the wallet SDK and effect platform in. The binding is written here with
  `@midnight-ntwrk/compact-js` directly, over `zk-assets/ethereum-erc20-vault/`, which holds
  `keys/`, `zkir/` and `compiler/` exactly as the package's managed directory does.
- 2026-10-09, decision: no `vault-providers.ts`. Assembling a provider set is construction, so
  the composition root builds the public data provider and the zk config provider and passes
  them in. Stage 5's `flushPending` needs a full `VaultProviders` set with the relayer's wallet
  and midnight provider slots: `RelayerWalletSeedImpl.provider()` returns both.
- 2026-10-09, decision (review): the relayer wallet lives under `src/lib/midnight/wallet/` as
  a backend-wide capability, and `startBackend()` starts it at once, since a sync can take
  minutes. One instance syncs per process by construction: Next evaluates the request graph
  separately and its backend never starts the wallet, while sharing one instance across graphs
  through `globalThis` would hand ledger objects between two copies of the wasm module.
  `finalize` on an unstarted instance throws, and the integration test's `backend.start()`
  (Stage 7) starts it the same way.
- 2026-10-09, decision: the stale attestation refusal (`Stale attestation` in the contract's
  `recordAttestation`) is not modelled as a failure state on the vault request or the deposit.
  It is reachable only by starting a request with a nonce an earlier sweep of the same deposit
  account consumed, and this backend assigns that nonce, so the deposit service keeps it
  unreachable and the vault request resolver treats it as a logged invariant violation.
- 2026-10-09, lesson: adding `parent` to the transaction event data broke the events already
  on the local Kafka topic. The consumer throws on data the schema rejects, as the rules
  require, and the hub then restarts on the same uncommitted record forever, so one stale
  record stalls every consumer. The stale records were skipped by resetting the group to the
  log end with the server stopped:
  `docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server
localhost:9092 --group full-stack-demo.events --topic full-stack-demo.events --reset-offsets
--to-latest --execute`. A change to an event's data shape is a change to events in flight:
  from here on, add fields as optional or publish under a new event type.
- 2026-10-09, tooling: `yarn vitest run --config vitest.integration.config.ts <file>` runs one
  integration file, and `docker compose exec -T postgres psql -U demo -d demo -c '\dt'` reaches
  the database. Both were run before being quoted in this plan.
