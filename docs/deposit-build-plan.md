# Deposit build plan

The goal is one end-to-end deposit, driven by the backend's own lifecycle machinery and proven
by a new integration test under `integration-tests/`. This document is the whole plan: an agent
picking it up after a context clear needs nothing else beyond the repository's rules files and
the code itself. Work through the stages in order, tick each box as it is verified, and record
anything learned in the findings log at the end so the next agent does not rediscover it.

## Resume here (paused 2026-10-09)

Work stopped mid-way through a correction under Stage 8. Everything up to and including
Stage 8 is built, reviewed and committed, and `yarn check` is green. Pick up exactly here:

- **Stages 0 to 8 are done.** Each stage was implemented by a fresh agent from a hand-off
  pack, reviewed by the coordinating session (every check and both test suites re-run, the
  code read, rule violations fixed), and its report kept. The packs and reports are tracked
  under `docs/deposit-build-hand-off/` (`00-START-HERE.md`, `01-codebase-context.md`, one
  `stage-N-report.md` per stage, and the two pending task files below).
- **Stage 8b is pending and is the next piece of work:** `docs/deposit-build-hand-off/02-stage-8b-task.md`.
  The end-to-end test passed three times for its agent, and the reviewer's own run under CPU
  load exposed a defect: the Midnight node accepted and applied a `completeDeposit`
  transaction while the SDK's submit reported "Transaction submission failed" (a websocket
  closure after the bytes were sent), so the backend recorded it `Rejected`, moved the deposit
  back to `AwaitingCompletion`, and a retry could never succeed since the request had settled
  and minted on chain. The task file holds the evidence, the cause and the fix: the ledger
  implementation reports a rejection only when the node refused, errors carry their cause
  chain, and the deposit resolver reads the vault ledger before believing a failed start or
  complete. An agent was launched on it and stopped before it changed any file.
- **The live reproduction is still in the local database** and must be resolved by the fix,
  not deleted first: deposit
  `callers/70cfff4060e853cd177ba7f66d32beb10f2ecd9e075d7a6f55bc7b2840f840ef/ethereum-erc20-vault-deposits/704a3298-f32e-46c7-9c5b-1957a0595a70`
  in `AwaitingCompletion`, its vault request `Attested`, its complete transaction `Failed`
  as `Rejected`, and the ledger holding nothing for its `inIndex` (settled). After the fix a
  sweep must move it to `Completed` with outcome `minted`. Then delete that caller's rows.
- **Stage 9 follows 8b:** `docs/deposit-build-hand-off/02-stage-9-task.md` (documentation,
  the rules file, the invalidated-name grep). It needs the reviewer's own end-to-end run to
  pass first, run alone with nothing else loading the machine.
- **How each stage ran:** a fresh Fable 5.1 agent per stage, given the pack's three files, the
  previous stage's report and the plan's stage section, told never to commit or install
  globally, to verify with observed output, and to write its report. The coordinator then
  re-ran `yarn check` and `yarn test:integration`, read the code, scanned for the punctuation
  and comment rules, fixed small things, folded the report into the next pack, and launched the
  next stage. Repeat that for 8b and 9.
- **The user's own uncommitted diagramming work** (the diagram files under `docs/`,
  `drawio.config.json`, the `## Diagrams` section at the end of `AGENTS.md`) is deliberately
  left out of every commit and must stay untouched by agents.
- **Local stack facts that matter on resume:** no dev server may run during integration tests
  (shared Kafka group), the full integration suite takes about five minutes, the end-to-end
  deposit about four, and `.env.local` is synced to the prep repository's stack.

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
      `MidnightTransactionLedger.prove` accepts (it deserialises with the markers `'signature'`,
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

- [x] R11. The `SignetRequestResponseReader` is configured per requests path. Confirm one reader
      per action (deposit uses `VAULT_DEPOSIT_REQUESTS_PATH`) is enough, and whether
      `signetEventsFromBlock` matters for a long-running stack (how far back the indexer streams).
- [x] R12. The `RespondBidirectionalEvent` fields the queue circuit input needs
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
export const midnightTransactionEventDataSchema = z.object({
  name: midnightTransactionNameSchema,
  parent: z.string().min(1),
})
// controller-impl publishEntered: MIDNIGHT_TRANSACTION_EVENT_BY_STATE[state].create(name, { name, parent })
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
      through the proof server with `MidnightTransactionLedgerImpl.prove`, and prints the unbound
      length (R6, R8, R9, R10 resolved and logged).
- [x] Unit tests: `requestStage` over every stage with fake ledger states, `VaultCircuits` is not
      unit tested (it is a thin wrapper over the SDK, covered by the integration test).
- [x] `yarn check` passes.

## Stage 3: the Ethereum transaction entity

Files: `src/lib/ethereum/transaction-v1/transaction.ts` (exists as a draft), new
`transaction-state-machine.ts`, `transaction-state-controller.ts` and impl, `transaction-ledger.ts`
and `transaction-ledger-ethers-impl.ts`, `transaction-state-resolver.ts` and impl,
`transaction-event-consumer.ts`, `transaction-fixtures.ts`, tests.

- [x] Rename the draft's states to the awaiting style and add a failure reason. A migration
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
// fields: name, parent, state, signedTx, txHash, blockNumber, expireTime, failure, error, createTime, updateTime
// unsignedTx is dropped: the MPC signs, the backend only ever holds signed bytes.
```

- [x] State machine, controller and events mirror the Midnight ones exactly (`nextState`,
      `assertConsistent`, `EXPIRABLE_STATES`, `EthereumTransactionStateConflict`, an event per state
      with type prefix `ethereum.transaction-v1.` and data `{ name, parent }`). Controller
      methods: `commitTransaction`, `recordSubmission` (name, txHash), `recordSuccess`,
      `recordFailure` (name, failure, error), `expireTransaction`.
- [x] The ledger port and its ethers impl port the prep repository's broadcast rules:

```ts
export interface EthereumTransactionLedger {
  /** Sends the signed bytes and resolves with the hash. An already-known or already-mined transaction resolves normally. */
  broadcast(signedTx: string): Promise<string>
  status(args: {
    txHash: string
    from: string
    nonce: number
  }): Promise<EthereumLedgerTransactionStatus>
}
export type EthereumLedgerTransactionStatus =
  | { outcome: 'pending' }
  | { outcome: 'mined'; blockNumber: bigint }
  | { outcome: 'reverted'; blockNumber: bigint }
  | { outcome: 'nonceConsumed' } // getTransactionCount(from, 'latest') > nonce and no receipt for txHash
```

      `broadcast`: parse with ethers `Transaction.from(signedTx)`, `getTransactionReceipt(hash)`
      first and return the hash when mined, then `broadcastTransaction`, swallowing
      `NONCE_EXPIRED` and the "already known" family of messages. `status`: the nonce check first,
      then the receipt, mined or reverted by `receipt.status`, or `nonceConsumed` when the count
      passed the nonce without a receipt, else pending.

- [x] Resolver: `AwaitingSubmission` broadcasts and records the hash (a thrown error other than
      already-known records `Rejected`), `AwaitingInclusion` maps the status, expiry first as in
      the Midnight resolver. Consumer: every Ethereum transaction event calls
      `resolveTransaction`.

Verification:

- [x] Unit tests table-driven as the Midnight ones: state machine over every pair, controller per
      action, resolver per status.
- [x] `yarn db:generate`, `yarn db:migrate`, `\d ethereum_transactions_v1`.
- [x] Integration test `integration-tests/ethereum-transaction-broadcast.test.ts`: fund a fresh
      anvil account, sign a zero-value self-transfer with ethers, commit it, resolve twice, expect
      `Succeeded` with a hash. Resolve a third time and expect no change.
- [x] `yarn check` passes (each step run on its own, since the four pre-existing `TS6133` errors in
      `deposit-state-controller-impl.ts` are the only typecheck output).

## Stage 4: the vault request entity

Files under `src/lib/midnight/ethereum-erc20-vault/vault-request-v1/`: `vault-request.ts`,
`vault-request-attestation.ts` (the codec between the row and the SDK's attestation event),
`vault-request-repository.ts` and SQL impl, `vault-request-state-machine.ts`,
`vault-request-state-controller.ts` and impl, `vault-request-state-resolver.ts` and impl,
`vault-request-event-consumer.ts`, `vault-request-fixtures.ts`, tests. Beside them under
`ethereum-erc20-vault/`: `vault-action.ts` (the action set, moved out of `vault-ledger.ts` so the
schema can import it), `respond-outcome-source.ts` with `respond-outcome-source-evm-node-impl.ts`
and `respond-outcome-source-mpc-cache-impl.ts`, `signet-readers.ts`, `vault-ledger-fixtures.ts`.
Schema and the migration `0011_vault_requests`.

- [x] The resource. `Request` alone would read as the kind of `DepositRequest`, so the entity is
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
export const ATTESTATION_OUTPUT_KINDS = [
  'executed',
  'failed',
  'unviable',
] as const satisfies readonly (keyof typeof OutputKind)[]

export const vaultRequestSchema = z.object({
  name: vaultRequestNameSchema, // callers/{caller}/ethereum-erc20-vault-requests/{uuid}
  parent: z.string().min(1), // the deposit
  action: z.enum(VAULT_ACTIONS), // from vault-action.ts
  state: vaultRequestStateSchema,
  inIndex: uint64Schema,
  depositAccount: evmAddressSchema, // the expected signer, copied from the deposit
  outIndex: hex32BytesSchema.nullable(),
  requestId: hex32BytesSchema.nullable(),
  signedTx: evmBytesSchema.nullable(), // the MPC-signed sweep, ethers Transaction.serialized
  attestationBlockHeight: uint64Schema.nullable(),
  attestationOutputKind: attestationOutputKindSchema.nullable(),
  attestationDigest: hex32BytesSchema.nullable(),
  attestationSignature: attestationSignatureSchema.nullable(), // bigR.x || bigR.y || s || recoveryId, 97 bytes
  attestationOutput: hexBytesSchema.nullable(), // the verified bytes, '' for the empty output
  createTime: z.date(),
  updateTime: z.date(),
})
```

      Table `midnight_ethereum_erc20_vault_requests_v1`, columns named as the fields, contract
      integers as `numeric(39,0)`, and the partial unique index
      `midnight_ethereum_erc20_vault_requests_v1_live` on `(parent, action)` over non-terminal
      states. The two helpers live in `vault-request-attestation.ts`, since the resource file is
      imported by the schema and drizzle-kit cannot load the Midnight packages (see the findings):
      `attestationToEvent(request)` rebuilds the `RespondBidirectionalEvent` for the circuit input
      (R12) and `attestationFields(outcome)` is its inverse. `hex32BytesSchema` and
      `evmBytesSchema` are in `src/lib/value-schemas.ts`, the latter hoisted from the Ethereum
      transaction resource at this second consumer.

- [x] State machine: `nextState(state, action)` over the actions `recordFlushed`, `recordSent`,
      `recordSignature`, `recordBroadcast`, `recordAttestation`, `recordAttestationQueued`,
      `recordAttested`, each legal from exactly one state, plus `assertConsistent` (`outIndex`
      set from `AwaitingSend`, `requestId` from `AwaitingSignature`, `signedTx` from
      `AwaitingBroadcast`, the attestation fields from `AwaitingAttestationQueue`).
- [x] Controller: `queueRequest` creates the row in `AwaitingFlush` and publishes, one method
      per action above (read with `lock: 'update'`, `nextState`, patch, `assertConsistent`,
      update, publish the event of the state entered with name and parent), and three child
      starters that read the row under `lock: 'update'`, refuse with the conflict unless it is in
      the state the step serves, and commit a child through the child's controller:

```ts
startSend({ name, unprovenTx }) // midnight tx: parent name, circuit 'sendDeposit', signer 'relayer', AwaitingProof
startBroadcast({ name }) // ethereum tx: parent name, signedTx from the row, AwaitingSubmission
startAttestationQueue({ name, unprovenTx }) // midnight tx: circuit 'queueAttestation0' | 'queueAttestation1', signer 'relayer'
// A unique violation on the child's live index means another resolver committed first: map it to VaultRequestStateConflict.
// The violation is Postgres code 23505 on the thrown error or on its `cause`; the integration test proves the shape.
```

      Event types `midnight.ethereum-erc20-vault.vault-request-v1.<kebab-state>`.

- [x] `signet-readers.ts`: `signetReaders(config)` builds one `SignetRequestResponseReader` per
      action (`SignetReaders = Record<VaultAction, SignetRequestResponseReader>`) from the vault
      address, the action's requests path, the signet address, the public data provider and
      `signetEventSourceFromIndexer({ queryUrl: indexerURL })`, without `signetEventsFromBlock`
      (R11).
- [x] `respond-outcome-source.ts`, the one genuinely new port:

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

      Both impls take the action's reader, and the backend holds one per action
      (`respondOutcomeSources: Record<VaultAction, RespondOutcomeSource>`, the kind selected by
      `RESPOND_OUTPUT_SOURCE`). The MPC cache impl checks every post over
      `MpcOutputCacheReader.fetchSerializedOutput(requestId)`. The EVM node impl ports
      `fetchAttestedRespondOutcome` and `observeExecution` from the prep repository: for a post
      declaring `executed`, find the mined transaction by rebuilding each of the request's
      signature posts with `signBidirectionalEventToSignedEvmTransaction` and asking the node for
      its receipt, trace its top frame with `debug_traceTransaction` (`callTracer`) through the
      Ethereum package's provider, and recompute the bytes with
      `executedEvmRespondOutput(schema, isEvmContractCall(tx.data), evmTraceOutputFromCallFrame(frame))`
      where the schema is `getSignatureRequest(requestId).outputDeserializationSchema` as stored.
      For `failed` or `unviable`, the candidate is the empty output. `firstVerifiedOutcome` in the
      port file keeps the first post, in emission order, that
      `verifyRespondBidirectionalSignature(candidate, post, mpcResponseKey)` accepts.

- [x] Resolver, with the loop from the overview applied per state. As built, the resolver reads
      the ledger through the `RequestLedger` port (`vault-ledger.ts`, the six request maps plus
      `mpcResponseKey`, which `VaultLedger` extends), handles `settled` in every state (recorded as
      attested from `AwaitingAttestationFlush`, logged and left alone elsewhere), treats a
      broadcast child that ended `Rejected` or `Expired` as one to replace (nothing is on chain
      for the MPC to attest) while `Succeeded`, `Reverted` and `NonceConsumed` end the step, and
      reads the ledger once per sweep. The sketch:

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
      if (!child || replaceable(child)) return this.write(() => this.controller.startBroadcast({ name }))  // none, or Failed as Rejected or Expired
      if (ETHEREUM_TERMINAL.includes(child.state)) return this.write(() => this.controller.recordBroadcast({ name }))
      return                                                           // the MPC attests a mined, reverted or nonce-consumed transaction
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

- [x] Consumer: wants the request's own lifecycle events (resolving the named request, as the
      transaction consumers do) and the Midnight and Ethereum transaction terminal events whose
      `parent` matches `vaultRequestNameSchema`, calling `resolveVaultRequest` with the parent as
      the name. The flush-succeeded nudge is Stage 5's: the flusher calls
      `resolveWaitingFlushes()` on the resolver directly.

Verification:

- [x] Unit tests: state machine over every pair, controller per action including the three child
      starters and the conflict mapping, resolver over every state with a mocked `RequestLedger`
      (fake states from `vault-ledger-fixtures.ts`), mocked readers, mocked outcome source, mocked
      circuits and a pass-through unit of work, consumer matching, the attestation codec round
      trip, and both outcome sources over scripted posts with real signatures.
- [x] `yarn db:generate`, `yarn db:migrate`, `\d midnight_ethereum_erc20_vault_requests_v1`.
- [x] Integration test `integration-tests/ethereum-erc20-vault-request.test.ts`: the repository
      over Postgres, the live index refusing a second live row, `startSend` mapping the child's
      live index refusal to the conflict, the deposit reader finding no posts for a random id,
      and the resolver leaving a queued row the ledger does not hold alone.
- [x] `yarn check` (each step run on its own, since the four pre-existing `TS6133` errors and
      the two lint errors in `deposit-state-controller-impl.ts` are the only output) and
      `yarn test:integration` pass.

## Stage 5: the flusher

Files: `src/lib/midnight/ethereum-erc20-vault/flusher.ts`, `flusher-impl.ts` and
`flush-event-consumer.ts`. No entity, no row: the ledger holds the queue and `flushPending` is the
whole batch.

```ts
export interface Flusher {
  /** Flushes until nothing waits. Coalesces: a call during a run marks the run to go again. */
  flush(): Promise<void>
}

export class FlusherImpl implements Flusher {
  private running: Promise<void> | undefined
  private runAgain = false
  constructor(
    private readonly runFlush: () => Promise<number>, // flushPending over the relayer's providers
    private readonly onFlushed: () => Promise<void>, // vaultRequestStateResolver.resolveWaitingFlushes
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
      let filled: number
      try {
        filled = await this.runFlush()
      } catch (error: unknown) {
        if (!isLostRace(error)) {
          console.error('Flush failed', error)
          return
        }
        this.runAgain = true
        continue
      } // CallTxFailedError FailFallible, or a flushQueue assert
      if (filled > 0) {
        await this.onFlushed()
        this.runAgain = true
      } // more may wait behind the width
    } while (this.runAgain)
  }
}
```

- [x] `FlusherImpl` takes the two functions, so the unit test scripts the SDK without touching it.
      The composition root binds `runFlush` to the SDK's `flushPending` over the lazily assembled
      providers, the compiled contract and the vault address, and `onFlushed` to
      `vaultRequestStateResolver.resolveWaitingFlushes`.
      `isLostRace` recognises `CallTxFailedError` with status `FailFallible` and the three
      `flushQueue` assert messages (Request not queued, Attestation not queued, Identical request
      open) as the compact runtime phrases them: `failed assert: <message>`, rethrown by the build
      as a plain `Error`. `FailEntirely` is not a lost race: the guaranteed section failed, which a
      rerun would repeat, so it is logged and ends the run.
- [x] The provider set is assembled once, on the first flush, by `createVaultProviders` in
      `src/server/backend.ts`: the indexer, the vault's `NodeZkConfigProvider` and compiled contract
      (shared with the circuits), the lazy `httpClientProofProvider` (hoisted to `createMidnight`
      and shared with the Midnight transaction ledger), `relayerWallet.provider()` for the wallet
      and midnight slots (now on the `RelayerWallet` interface), and a
      `PrivateStateProviderMemoryImpl` holding `permissionlessVaultPrivateState()` (exported by the
      circuits impl, which uses it for `sendDeposit` and `queueAttestation*` too).
- [x] A `FlushEventConsumer` wants the vault request events `awaiting-flush` and
      `awaiting-attestation-flush`, parses the data with `vaultRequestEventDataSchema` and awaits
      `flusher.flush()`. Two replicas racing is handled by the chain, which is what the contract
      intends. Registered in `src/server/start.ts`, and the backend holds it as
      `ethereumErc20Vault.flushEventConsumer` beside `ethereumErc20Vault.flusher`.
- [x] Backpressure: `flushPending` proves, balances and waits for inclusion, so one run is
      minutes, and the hub waits for the handler, so every other consumer waits with it. That is
      acceptable for the demo and is why the sweep (Stage 7) also calls `flush()`. Stage 7
      reversed the wait: the consumer now detaches the flush, see its findings.
- [x] `flusher.ts` joined the boundary guard's `BACKEND_FILES`: no suffix covers it.

Verification:

- [x] `flusher-impl.test.ts`, table driven over a scripted `runFlush`: zero filled runs once and
      nudges never, filled then zero runs twice and nudges once, two full flushes run three times
      and nudge twice, each of the four lost-race shapes runs again, `FailEntirely`, another assert
      and a ledger read failure each log once and stop. Two further tests: a `flush()` during a run
      shares the promise and makes one more run, and a failed nudge rejects the flush and the next
      call starts a new run.
- [x] `flush-event-consumer.test.ts`: wants exactly the two events over all eight states, ignores
      transaction and unrelated events, flushes on a wanted event, refuses malformed data.
- [x] `integration-tests/ethereum-erc20-vault-flush.test.ts`: with nothing queued, the first flush
      starts the relayer wallet (`finalize` rejects with "was not started" before, with a
      deserialisation error after), submits nothing and leaves `globalLastSeen` and
      `vaultAccountNonce` as they were.
- [x] `yarn check` (each step run on its own, since the four pre-existing `TS6133` errors and the
      two lint errors in `deposit-state-controller-impl.ts` are the only output) and
      `yarn test:integration` pass. The planted `src/lib/planted-violation.ts` importing `Flusher`
      made `yarn boundaries` exit 1, and the rerun after its removal reports "Boundaries hold
      across 201 files (161 backend imports checked)".

## Stage 6: the deposit entity and its services

Files under `src/lib/midnight/ethereum-erc20-vault/deposit-v1/`: `deposit.ts` (exists),
`deposit-state-machine.ts`, `deposit-state-controller.ts` and impl (exist as placeholders),
`deposit-state-resolver.ts` and impl, `deposit-event-consumer.ts`, `deposit-service.ts` and impl
(exist), `deposit-service-adaptor.ts` (exists), `deposit-fixtures.ts`, tests, and
`src/server/actions/deposit-actions.ts`.

- [x] Resource changes in `deposit.ts`:

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

- [x] State machine over the actions `recordStarted`, `recordStartFailure`, `recordAttested`,
      `complete` (`AwaitingCompletion` to `AwaitingCompleteTransaction`),
      `recordCompleted`, `recordCompleteFailure` (back to `AwaitingCompletion`), with
      `assertConsistent`.
- [x] Controller. Two methods are called by the service, since the user must act, and the rest by
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

- [x] Service. The slow building of the circuit call happens before the adaptor's transaction is
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

- [x] Resolver, nudged by the children's terminal events:

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

- [x] Consumer: wants Midnight transaction terminal events and vault request terminal events
      whose `parent` matches `depositNameSchema`, calling `resolveDeposit({ name: parent })`.
- [x] Adaptor gains `completeDeposit` and `listDeposits`, actions gain the same one-liners.

Verification:

- [x] Unit tests: state machine, controller (including the child creation in `recordStarted` and
      the two commits), service (assignment, including the nonce taking the higher of the chain's
      pending count and one above the caller's live deposits, ownership refusal, wrong-state
      refusal), resolver per state, consumer matching.
- [x] `yarn db:generate`, `yarn db:migrate`, `\d midnight_ethereum_erc20_vault_deposits_v1`.
- [x] `yarn check` and `yarn test:integration` pass.

## Stage 7: composition, start-up, stop and the sweep

Files: `src/server/backend.ts`, `src/server/start.ts`, `src/lib/sweep.ts`,
`src/lib/delay-unless-aborted.ts`, the two event loops under `src/lib/event`, the two transaction
resolvers, `flush-event-consumer.ts`, `integration-tests/backend-lifecycle.test.ts`.

- [x] `createBackend` builds the packages in dependency order and the lifecycle over them. What
      is built (the plan's earlier sketch dropped `ethereum.provider`, which the deposit service
      reads the pending nonce through, and listed pieces that stayed locals of their factories):

```ts
Backend {
  config, db: { pool, database, unitOfWork }, kafka: { createConsumer, producer, publisher },
  event: { publisher, consumerHub, outboxEntryV1: { repository, processor } },
  ethereum: { provider: JsonRpcProvider, transactionV1: { repository, stateController, ledger, stateResolver, eventConsumer } },
  midnight: {
    relayerWallet, publicDataProvider,
    transactionV1: { repository, stateController, ledger, stateResolver, eventConsumer, service, adaptor },
    ethereumErc20Vault: {
      circuits, ledger, signetReaders, respondOutcomeSources, flusher, flushEventConsumer,
      vaultRequestV1: { repository, stateController, stateResolver, eventConsumer },
      depositV1: { repository, stateController, stateResolver, eventConsumer, service, adaptor },
    },
  },
  start(): Promise<void>, stop(): Promise<void>
}
```

      The proof provider, the vault's zk config provider, the compiled contract and the relayer's
      provider set stay locals shared between the factories that need them.

- [x] The start-up lives on the backend object, so the integration tests reach it through the
      one import they are allowed (`getBackend`). `start()` starts the relayer wallet (logging
      the sync time), registers the five consumers, and runs the hub's Kafka loop, the outbox
      relay and the sweep under one `AbortSignal`. It runs once per instance (`lazySingleton`,
      a later call shares the promise) and resolves once the loops are running, before the
      wallet has synced. `src/server/start.ts` is `await (await getBackend()).start()`.
- [x] `stop()` aborts the signal, waits up to `STOP_TIMEOUT_MS` (30 s) for the loops to end
      (a resolve or flush mid-run finishes first, an abort ends a sweep pass after the running
      task), then closes the Kafka producer. The hub loop closes its consumer (`close(true)`
      ends the stream, and a record handled at the abort is left uncommitted for redelivery,
      since a commit on a closed consumer never settles), the relay releases its `LISTEN`
      client after the relay in flight ends. The pool is the owner's to end. A stopped backend
      never starts again. `runEventConsumerHub` and `runOutboxEntryProcessor` take the signal
      and resolve when they have ended, and `delayUnlessAborted` is the shared abort-aware delay.
- [x] The sweep (`sweep()` in `src/lib/sweep.ts`, generic over named tasks) runs every 30 s:
      `resolvePending()` on the Midnight transaction, Ethereum transaction, vault request and
      deposit resolvers, then `flusher.flush()`, each failure logged under the task's name
      without ending the loop, and logs its first pass. `resolvePending()` was added to both
      transaction resolvers (every non-terminal state in order, oldest first, one row's failure
      logged), which is where a lost event and expiry are caught.
- [x] The flush consumer no longer awaits the flush: `flusher.flush().catch(log)` and the
      handler returns, so a run of minutes holds no other consumer and the Kafka poll interval
      is safe. The flusher coalesces and the sweep flushes again, so a failed run costs at most
      one interval. This replaces the Stage 5 choice.
- [x] `setNetworkId(midnightNetwork.networkId)` once at the top of `createBackend` (Stage 5).
- [x] `scripts/check-boundaries.ts`: `src/lib/sweep.ts` and `src/lib/delay-unless-aborted.ts`
      joined `BACKEND_FILES`. The planted `src/lib/planted-violation.ts` importing both at
      runtime made `yarn boundaries` exit 1 with two "a backend module is only used inside the
      backend and src/server" lines, and the rerun after its removal prints "Boundaries hold
      across 219 files (208 backend imports checked)".

Verification:

- [x] `sweep.test.ts` (four table cases and one more: a failing task is logged and the next
      runs, an abort mid-pass ends the pass after the running task, an abort during the
      interval ends the sweep at once, an abort from the last task, an aborted signal runs
      nothing), `resolvePending` tables on both transaction resolver tests (every state searched
      in order, expiry applied, one row's failure logged and the next resolved, nothing waiting
      reads nothing), and two flush consumer tests (the handler returns before the flush ends, a
      failed flush is logged and the handler still resolved).
- [x] `integration-tests/backend-lifecycle.test.ts`: `start()` twice returns one promise, the
      relayer wallet syncs (`provider()` resolves 432 ms after start on this stack), the sweep's
      first pass logs within the test (479 ms), the relay holds one pool client, `stop()` ends
      in 2474 ms and releases it, a second `stop()` resolves, and the file exits with no open
      handle (5.35 s run, no close timeout reported).
- [x] `yarn check` passes end to end: typecheck clean, lint 0 errors and 0 warnings, format
      clean, boundaries as above, `yarn test` 28 files and 538 tests (14 new).
- [x] `yarn test:integration` with no dev server running: 8 files and 19 tests in 19.37 s.
- [x] The dev server started through the preview tool logs, in order,
      `Backend started: 5 consumers registered, sweep every 30000 ms`,
      `Relayer wallet synced in 1129 ms` and
      `Sweep ran its first pass in 1227 ms and runs every 30000 ms`, with no error line (Node's
      `DEP0169` `url.parse()` deprecation warning comes from a dependency and predates this
      stage), and was stopped afterwards.

## Stage 8: the end-to-end integration test

File: `integration-tests/ethereum-erc20-vault-deposit.test.ts`. It imports `getBackend` from
`src` and nothing else from `src` at runtime (the boundary guard enforces it), plus the packages
and `ethers` directly. The round trip takes about four minutes on the local stack (six proofs,
MPC round trips, EVM inclusion, and three legs that wait for the 30 s sweep), so the file sets
`40 * 60_000` as the timeout of its test and of both hooks. What is built:

```ts
describe('ERC20 vault deposit round trip over the local stack', () => {
  const callerSecret = randomBytes(32).toString('hex')          // a fresh deposit account and nonce 0 per run

  beforeAll: backend = await testBackend(); await backend.start()
             evm = new JsonRpcProvider(rpcURL, undefined, { cacheTimeout: -1 })
             user = await startUserWallet(userWalletSeed(), backend.config.client.midnightNetwork)
  afterAll:  delete the caller's rows from the four resource tables and the outbox,
             await user.stop(); await backend.stop(); await backend.db.pool.end()

  test('deposit from start to Completed', async () => {
    // 1. start through the adaptor with CIRCLE_USDC and 1_000_000n, read deposit.depositAccount
    // 2. fundDepositAccount(evm, depositAccount, amount): anvil_setBalance one ETH, then the USDC
    //    balance slot found by the sentinel probe and written with anvil_setStorageAt, read back
    // 3. playWallet: listTransactions under the deposit; each AwaitingWallet caller row not yet
    //    submitted is balanced by user.balance(unboundTx) and handed to submitTransaction
    // 4. waitFor (5 s polls): playWallet, log every state change of the deposit, its request and
    //    their children (a Trail), until AwaitingCompletion
    // 5. completeDeposit through the adaptor, then the same loop until Completed
    // 6. outcome minted, request Attested and executed, depositArgsMap.member(inIndex) false,
    //    the sweep transaction Succeeded, and the 23-event trail in publication order
  })
})
```

`integration-tests/user-wallet.ts` has `startUserWallet(seedHex, config): Promise<UserWallet>`,
built from the SDK packages as the application's seed wallet facade is (the boundary rule keeps
that module out of a test), with `publicKeys`, `balance(unboundTx)` (deserialise with the
`signature`, `proof` and `pre-binding` markers, `balanceUnboundTransaction`, `signRecipe`,
`finalizeRecipe`, serialise to hex) and `stop()`.

- [x] Write `waitFor`, `fundDepositAccount` (the storage-slot probe ported from the prep
      repository's `fork-funding.ts`) and `startUserWallet` as test-local helpers in
      `integration-tests/`. They may import the facade's SDK packages directly, not the facade
      module (the boundary rule).
- [x] The expected event trail for this deposit, read from the outbox table by event key, is
      asserted in order: deposit awaiting-start-transaction, the start transaction's five states,
      deposit awaiting-vault-request, the vault request's eight states through attested, deposit
      awaiting-completion and awaiting-complete-transaction, the complete transaction's five
      states, deposit completed. Entries are ordered by `createdAt` with a millisecond tie broken
      parent first, since a parent publishes its event before it commits the child in one unit
      of work.

Verification:

- [x] `yarn vitest run --config vitest.integration.config.ts integration-tests/ethereum-erc20-vault-deposit.test.ts`
      passes against the running stack. Stop any leftover dev server first: its outbox relay and
      consumers compete with the test's.
- [x] Run it a second time without cleaning the chain: a fresh caller secret and a fresh
      `inIndex` make the second deposit independent, and it must pass again.
- [x] `yarn test:integration` passes as a whole.

## Stage 9: documentation and final checks

- [ ] `README.md`: a "Deposit lifecycle" section describing the five entities, the flusher, the
      sweep, the relayer wallet and the new environment variables, in human terms, self-contained.
      Every command quoted was run verbatim.
- [ ] `AGENTS.md`: extend the lifecycle section with the parent nudge (`{ name, parent }` in child
      events), the ledger-as-acknowledgement rule for chain steps, the rule that a vault-level
      batch (the flush) is a process and not an entity, and the relayer transaction rule
      (`signer`). Record the Stage 6 decision on where the unproven call is built.
- [ ] `docs/deposit-state-machine.drawio` and `docs/vault-request-state-machine.drawio`: draw the
      deposit and vault request state machines as committed pairs under the conventions in
      `docs/diagramming.md`, with the names in this plan.
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
  EURC, and `initialised` is true. Read through `readVaultLedger` over
  `indexerPublicDataProvider`.
- 2026-10-09, R4: the MPC is the `fakenet-responder` container (`ghcr.io/sig-net/fakenet`)
  with no output cache configured, so the output source is `evm-node`. The fork answers
  `debug_traceTransaction` (a probe with a zero hash returns "resource not found", not
  "method not found").
- 2026-10-09, R5: the prep repository's deposit envelope is gas limit 100 000, max fee 30 gwei,
  priority fee 1 gwei (`integration-tests/src/evm-transfer.ts`). The deposit service assigns
  the same.
- 2026-10-09, R6: `createUnprovenCallTx(...).private.unprovenTx.serialize()` is accepted by
  `MidnightTransactionLedgerImpl.prove` (3144 hex chars in, 9430 out, under a second on a warm
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
- 2026-10-09, review of Stage 7: the sweep's flush task no longer awaits a flush in progress.
  `FlusherImpl.flush()` returns the running promise to a second caller, so a sweep pass that
  awaited it stalled every resolver's sweep for the length of a proving flush, minutes on this
  stack, and the two polling states of a vault request advance only on a sweep. The task fires
  the flush and returns, since the flusher coalesces and logs its own failures.
- 2026-10-09, tooling: `yarn vitest run --config vitest.integration.config.ts <file>` runs one
  integration file, and `docker compose exec -T postgres psql -U demo -d demo -c '\dt'` reaches
  the database. Both were run before being quoted in this plan.
- 2026-10-09, Stage 3 naming: the Ethereum entity's `EthereumTransactionStateController`,
  `EthereumTransactionLedger`, `EthereumTransactionStateResolver` and
  `EthereumTransactionEventConsumer` sit beside the Midnight ones in `src/server/backend.ts`, so
  the Midnight incumbents were qualified in the same change: `MidnightTransactionStateController`
  (and `Impl`), `MidnightTransactionStateConflict`, `MidnightTransactionLedger`,
  `MidnightTransactionLedgerImpl` (file name unchanged), `MidnightLedgerTransactionStatus`,
  `MidnightTransactionStateResolver` (and `Impl`), `MidnightTransactionEventConsumer`,
  `MIDNIGHT_TRANSACTION_EVENT_BY_STATE`, `MIDNIGHT_TRANSACTION_EVENTS`,
  `midnightTransactionEventDataSchema` and `MidnightTransactionEventData`. Folder-private names
  (`nextState`, `assertConsistent`, the args interfaces, the fixtures) stay unqualified in both
  folders. A whole-repository grep for the bare names finds only `docs/diagramming.md`, which is
  uncommitted work in progress and was left alone.
- 2026-10-09, Stage 3 ethers: `AbstractProvider` answers identical requests from a 250 ms cache,
  so a receipt re-read inside one `status` call returned the earlier null while the raw
  `eth_getTransactionReceipt` already had the receipt (`.scratch-spike/spike-anvil-receipt-order.mts`
  printed, for nonce 2, `raw receipt present` beside `ethers receipt NULL`). The first ledger shape
  (receipt, count, receipt again as the prep code does) therefore failed the integration test
  once with `Failed` instead of `Succeeded`. The ledger now reads the count first and the receipt
  once, and `createEthereum` builds the provider with `cacheTimeout: -1`, and the integration test
  then passed four runs of four. The same probe showed anvil never serving the count ahead of
  the receipt (three transactions, raw receipt present at the tick the count advanced).
- 2026-10-09, Stage 3 anvil: the fork runs `anvil_getAutomine` false and `anvil_getIntervalMining`
  1 (a block a second), its base fee is a few wei, and `eth_sendRawTransaction` of a second
  transaction at a used nonce answers "nonce too low", which the ledger swallows so that the
  status read decides `NonceConsumed` (integration test case two).
- 2026-10-09, Stage 3 tooling: `yarn db:generate` prompts "created or renamed from another
  column?" for each added column when a column is dropped in the same table, and hangs without a
  TTY. It was driven through a Python `pty` script answering Enter (the first option, create) per
  prompt. The generated SQL is `ALTER ... SET NOT NULL`, three `ADD COLUMN` and one
  `DROP COLUMN "unsigned_tx"`, renamed to `0010_ethereum_transaction_lifecycle`.
- 2026-10-09, Stage 3 decisions: the ledger's `nonce` is a `number`, as ethers types nonces and
  transaction counts, while the row's `blockNumber` is a `bigint` over a Postgres `bigint`
  column. `recordFailure` takes `error` and `blockNumber` as optional, since `Reverted` and
  `NonceConsumed` carry no node message and only `Reverted` carries a block. `expireTime` is
  nullable and never required by the state table, and `Expired` means the backend stopped
  waiting, not that the chain cannot include the transaction. A broadcast that throws anything
  but the already-known family ends `Rejected`, transport failures included, as the Midnight
  resolver does for `submit`. The ledger lives under `ethereum.transactionV1` in the backend, as
  the Stage 3 hand-off placed it, while the Stage 7 sketch draws it one level up.
- 2026-10-09, Stage 3 typecheck and lint: the pre-existing failure is four `TS6133` errors in
  `deposit-state-controller-impl.ts` (lines 13, 14, 21 and 25), not three, and `yarn lint`
  reports two `no-unused-vars` errors in the same file, so `yarn check` stops at typecheck and
  `yarn lint` exits non-zero before and after this stage.
- 2026-10-09, Stage 4 tooling: `yarn db:generate` loads `src/lib/db/schema.ts` through a CommonJS
  loader and failed with "Cannot find module .../@midnight-ntwrk/platform-js/dist/cjs/effect/ContractAddress.js"
  while the schema reached `@sig-net/midnight` through the vault request resource. Every resource
  module the schema imports must stay free of the Midnight packages: `VAULT_ACTIONS` moved from
  `vault-ledger.ts` to `vault-action.ts`, and the attestation codec lives in
  `vault-request-attestation.ts` beside the resource. The constraint is stated at the top of
  `schema.ts`. The migration is `drizzle/0011_vault_requests.sql` (row 12 of
  `drizzle.__drizzle_migrations`), verified with `\d midnight_ethereum_erc20_vault_requests_v1`.
- 2026-10-09, R11: one reader per action over that action's requests path is enough, built by
  `signetReaders()` from the vault address, the signet address, the public data provider and the
  indexer query URL. `getRecordsNamed` in the SDK's reader streams the singleton's whole event
  history (pages of 100, pinned to the tip of the first page) on every call unless
  `signetEventsFromBlock` bounds it, and a bound hides every post below it, while a row carries
  no block to bound by, so the readers are built without one. On this stack the singleton holds
  no events yet (`contractEvents` for its address is empty) and a read takes 4 to 17 ms
  (`.scratch-spike/spike-signet-reader-walk.mts`, three runs). The cost grows one round trip per
  100 events the singleton has ever emitted, three per request.
- 2026-10-09, R12: `respondBidirectionalEventToCircuitInput` takes the full
  `RespondBidirectionalEvent` (`requestId`, `blockHeight`, `outputKind`, `serializedOutputLength`,
  `digest`, `signature { bigR { x, y }, s, recoveryId }`), so the row stores the block height,
  the kind, the digest, the signature as `bigR.x || bigR.y || s || recoveryId` (97 bytes) and the
  verified output, and `attestationToEvent` rebuilds the event byte for byte
  (`vault-request-attestation.test.ts`). `verifyRespondBidirectionalSignature` recomputes the
  digest from the signed fields and ignores the posted `digest`, so a post with only its digest
  altered still verifies (the first forged-post fixture in
  `respond-outcome-source-evm-node-impl.test.ts` found that out).
- 2026-10-09, Stage 4 decisions: `RequestStage`'s `attestationQueued` and `attestationFlushed`
  carry `outIndex` and `lastSeen` too, so a row in `AwaitingFlush` that finds the ledger past the
  send can still record its request index. `VaultLedger` extends a `RequestLedger` port (the six
  maps plus `mpcResponseKey`), which the resolver takes and a unit test fakes. A broadcast child
  that ended `Rejected` or `Expired` put nothing on chain, so the resolver replaces it. The plan's
  sketch recorded the step on any terminal child, which would leave the request polling for an
  attestation that never comes. The consumer wants the request's own lifecycle events as well as
  its children's terminal events, as the transaction consumers do, so a recorded step nudges the
  next one without waiting for the sweep. The sweeps read the ledger once and log a row's failure
  rather than stopping. The outcome sources take `{ requestId, mpcResponseKey }` as planned, and
  the backend holds one per action. `MidnightRespondOutputConfig` is a discriminated union, so
  the `mpc-cache` branch carries its URL as a string. `EthereumBackend` exposes its ethers
  `provider` (built with `cacheTimeout: -1`) and `createMidnight` receives the Ethereum package,
  so the EVM node source traces through the same provider the ledger uses.
- 2026-10-09, Stage 4 boundary: `signet-readers.ts` joined the guard's `BACKEND_FILES`. A planted
  `src/lib/planted-violation.ts` importing `signetReaders` made `yarn boundaries` exit 1 with
  "a backend module is only used inside the backend and src/server", and after its removal the
  guard reports "Boundaries hold across 196 files (148 backend imports checked)".
- 2026-10-09, Stage 4 Postgres: the live index refusal arrives from drizzle 0.45.3 as the pg
  `DatabaseError` itself with `code === '23505'` (the integration test's `startSend` twice ends
  in `VaultRequestStateConflict`), and the guard also reads `cause`, in case a query wrapper carries
  it.
- 2026-10-09, Stage 5 lost race: a `flushQueue` build whose slot the ledger does not hold throws a
  plain `Error` (constructor `Error`, no `isCompactError`) with the message
  `failed assert: Request not queued` or `failed assert: Attestation not queued`, carrying a
  `ContractRuntimeError` cause whose own cause is the `CompactError`. The compact runtime's
  `assert` prefixes every message with `failed assert: `, and the SDK's `flushUntil` matches the
  same prefixed form. Established by `.scratch-spike/spike-flush-assert.mts` against the running
  stack (two probes, one per buffer), with `createUnprovenCallTx` over the backend's own provider
  pieces. `isLostRace` in `flusher-impl.ts` matches that regex and `CallTxFailedError` with
  status `FailFallible`. `FailEntirely` is not a lost race: `submitFlush` throws
  `CallTxFailedError` on any status but `SucceedEntirely`, and a guaranteed-section failure (the
  proof check or the fee payment) would repeat on a rerun, so it is logged and ends the run, as
  `flushUntil` rethrows it.
- 2026-10-09, Stage 5 composition: the lazy `httpClientProofProvider` moved from
  `createMidnightTransactionV1` to `createMidnight`, which hands it to both packages, and
  `createMidnightEthereumErc20Vault` keeps the `NodeZkConfigProvider` and the compiled contract as
  locals the circuits impl and the flusher share. `createVaultProviders` assembles the full
  `VaultProviders` set behind `lazySingleton`, so the first flush waits for the relayer wallet's
  sync and the registry load, and later flushes reuse the set. `RelayerWallet` gained
  `provider()` (the seed impl already had it) so the composition root reaches the wallet slots
  through the interface. The private state is `permissionlessVaultPrivateState()`, exported by
  `vault-circuits-midnight-js-impl.ts` at its second consumer, and `build` there takes a
  `VaultPrivateState`. On a cold backend the first `flush()` with nothing queued took 392 ms and
  the second 11 ms (`.scratch-spike/spike-flush-cold.mts`): the relayer wallet syncs in well under
  a second on this stack, so `finalize` rejecting with "was not started" before the flush and with
  a deserialisation error after it is the integration test's evidence that the flush started the
  wallet, since a timing bound would not distinguish a cold sync from a warm one.
- 2026-10-09, Stage 5 hub: `EventConsumerHubImpl.dispatchEvent` awaits each handler and the Kafka
  record commits after all of them, so a flush nudge holds every consumer for the run's duration
  (proving, balancing and inclusion). The consumer awaits `flush()` on purpose, as a detached run
  would hide a rejected nudge from the hub's redelivery, and the plan's backpressure bullet
  accepts the wait for the demo. Superseded by the Stage 7 flush consumer finding below.
- 2026-10-09, Stage 5 boundary: `flusher.ts` joined `BACKEND_FILES`. The planted
  `src/lib/planted-violation.ts` importing `Flusher` at runtime made `yarn boundaries` exit 1 with
  "a backend module is only used inside the backend and src/server", and the rerun after its
  removal prints "Boundaries hold across 201 files (161 backend imports checked)". `AGENTS.md`'s
  list of backend-owned files was not edited (it holds uncommitted work), so it now also lacks
  `flusher.ts`.
- 2026-10-09, Stage 5 counts: `yarn test` reports 21 files and 389 tests (25 new), and
  `yarn test:integration` with no dev server running reports 6 files and 14 tests in 11.14 s.
- 2026-10-09, Stage 6 deposit account: `deriveEvmAddress(mpcRootPublicKey, vaultAddress,
bytesToHex(pureCircuits.userCommitment(secret)))` over the prep stack's
  `VAULT_DEPLOYER_SECRET_KEY` renders `0x811841e671de49953cDBb09608932Db0Ec7F8335`, the prep
  `.env`'s `EVM_USER_ADDRESS` (`.scratch-spike/spike-deposit-account.mts`), so
  `DepositServiceImpl` derives the deposit account that way and stores it lower case. The same
  spike shows `ZswapSecretKeys.fromSeed(...).coinPublicKey` and `.encryptionPublicKey` as 64
  lower-case hex characters, so `walletPublicKeysSchema` is `hexBytesSchema` piped to length 64.
- 2026-10-09, Stage 6 decision, write boundary: a service method whose write must follow a slow
  build opens the transaction itself, after the build. `startDeposit` reads the chain's pending
  count and the caller's live deposits, builds the call, then
  `runInTransaction(() => controller.startDeposit(...))`. `completeDeposit` reads the row and its
  attested request, builds, then `runInTransaction(() => controller.completeDeposit(...))`. The
  adaptor wraps nothing and takes no `UnitOfWork`, and the read methods open none. The
  service unit test records the order (`['build', 'transaction']`) for every case. The
  transaction protects the row, the child commit and the live index, and the build's assert
  failures surface before anything is written.
- 2026-10-09, Stage 6 decision, nonce search: `SearchArgs` has no prefix criterion, so the
  caller's deposits are found by `exact-text` on `depositAccount`, which every deposit of a caller
  shares, and the non-terminal ones are filtered in code:
  `evmNonce = max(getTransactionCount(account, 'pending'), 1 + highest live evmNonce)`.
  `listDeposits` uses the same criterion ordered by `createTime desc`, and the table gained an
  index on `deposit_account`. The read runs outside the transaction, so two starts of one caller
  racing can draw the same nonce, and the vault request resolver's `AwaitingAttestationQueue` guard
  logs that case and the sweep re-checks it.
- 2026-10-09, Stage 6 circuit refusal: `adaptor.startDeposit` with `0xab..ab` as the token answers
  `{ ok: false, error: 'failed assert: ERC20 not allowed' }` in 291 ms on a warm indexer
  (`.scratch-spike/spike-deposit-refusal.mts`) with nothing written. The adaptor maps
  `DepositStateConflict` and any `Error` whose message starts with `failed assert: ` to
  `{ ok: false }`. `integration-tests/ethereum-erc20-vault-deposit-start.test.ts` asserts the
  prefix and that the caller's rows are unchanged.
- 2026-10-09, Stage 6 hoists: `isUniqueViolation` lives in `src/lib/db/unique-violation.ts` and
  `callerOf` in `src/lib/caller/caller.ts`, each hoisted at its second consumer (the deposit
  controller), and the vault request controller imports both. Neither touched the boundary
  guard's lists (`src/lib/db/` is backend-owned by directory, `caller.ts` is isomorphic), so no
  violation was planted, and `yarn boundaries` prints "Boundaries hold across 216 files (204 backend
  imports checked)".
- 2026-10-09, Stage 6 outcome rule: the resolver decides the outcome on the complete transaction's
  success from the newest vault request under the deposit: `minted` when `attestationOutputKind`
  is `executed` and `attestationOutput` is `01`, `closed` otherwise (`depositOutcome` in
  `deposit-state-resolver-impl.ts`, four resolver cases). `completeDeposit` builds with the
  request's `attestationOutput` bytes for `executed` and one zero byte otherwise (three service
  cases).
- 2026-10-09, Stage 6 events: the controller's `startDeposit` publishes
  `midnight.ethereum-erc20-vault.deposit-v1.awaiting-start-transaction` before it commits the
  child, so a start's outbox order is the deposit event, `midnight.transaction-v1.awaiting-proof`,
  and `awaiting-wallet` once the transaction resolver proves the call (integration test). The
  deposit consumer wants the deposit's own events, the Midnight transaction terminal events and
  the vault request `attested` event whose `parent` is a deposit name, and `start.ts` registers it.
- 2026-10-09, Stage 6 migration: `0012_deposit_lifecycle` adds `deposit_account` (not null),
  `outcome`, `failure`, `error`, `create_time`, `update_time` and the `deposit_account` index.
  `yarn db:generate` did not prompt, since the edit only adds, and `yarn db:migrate` applied it to the
  empty table and `\d midnight_ethereum_erc20_vault_deposits_v1` shows 15 columns and both
  indexes (`drizzle.__drizzle_migrations` id 13).
- 2026-10-09, Stage 6 resolver: `DepositStateResolver` has `resolveDeposit` and `resolvePending`
  (the four waiting states in order, one row's failure logged). `AwaitingCompletion` reads
  nothing. A start transaction that ends `Failed`, including `Expired` when the browser never
  finalises within the hour, ends the deposit `Failed` as `StartFailed` with the child's `error`
  or failure name: the backend cannot rebuild a caller call, so the user starts a new deposit.
- 2026-10-09, Stage 6 counts: `yarn check` passes end to end (typecheck clean, lint 0 errors and
  0 warnings, format clean, boundaries as above, `yarn test` 27 files and 524 tests, 135 new).
  `yarn test:integration` with no dev server running reports 7 files and 18 tests in 13.20 s
  (4 new, proving a real start call through the proof server).
- 2026-10-09, Stage 7 lifecycle: `Backend` gained `start()` and `stop()`, built by
  `createLifecycle` in `src/server/backend.ts` over the packages. `start()` is a `lazySingleton`
  (the integration test asserts `backend.start()` twice is one promise) and resolves before the
  relayer wallet has synced, so nothing has to await it before an adaptor call: the adaptors
  need no start at all, and only a relayer transaction's finalisation waits on the sync. The
  hub's and the relay's loops became `runEventConsumerHub(hub, createConsumer, signal)` and
  `runOutboxEntryProcessor(processor, pool, signal)`, each resolving once ended, and
  `src/lib/delay-unless-aborted.ts` is the abort-aware delay all three loops share (hoisted at
  the second consumer, with the sweep as the third). `stop()` bounds its wait at 30 s and then
  logs and goes on, so a proof in flight cannot hang a test's teardown. The Kafka producer closes
  after the loops since the relay sends through it. `integration-tests/backend-lifecycle.test.ts`
  observed: wallet synced 432 ms after start, the sweep's first pass in 479 ms, stop in 2474 ms,
  and the 119 unsent outbox entries left behind by earlier test runs relayed during the test
  (`select sent, count(*) from event_outbox_entries_v1 group by sent` went from 119 unsent to 0),
  whose stale events every consumer handled without a logged error.
- 2026-10-09, Stage 7 Kafka close: `MessagesStream.close()` pushes the end of the stream, which
  ends the hub's `for await`, but a manual `record.commit()` issued after the consumer closed
  never settles (`kAutocommit` returns early while the consumer is inactive and the waiter stays
  queued, `node_modules/@platformatic/kafka/dist/clients/consumer/messages-stream.js`), so the loop
  checks the signal after each dispatch and breaks before the commit. The record is redelivered
  on the next start, which the idempotent handlers absorb. `consumer.close(true)` is called from
  the abort listener and again in `finally`, sharing one promise.
- 2026-10-09, Stage 7 sweep: `sweep(tasks, intervalMs, signal)` in `src/lib/sweep.ts` is generic
  over `{ name, run }` tasks, logs `Sweep task <name> failed` and goes on, ends a pass after the
  running task on abort, and logs its first pass's duration once so a boot log shows the sweep is
  alive. The composition root's task order is the Midnight transaction, Ethereum transaction,
  vault request and deposit resolvers, then `flush`, so a request a sweep moved into a flush
  state is flushed in the same pass. The flush is awaited in the pass, as the plan sketched, so a
  flush of minutes delays the next pass by that much, and events still nudge the resolvers
  through the hub in the meantime.
- 2026-10-09, Stage 7 transaction sweeps: `resolvePending()` on `MidnightTransactionStateResolver`
  and `EthereumTransactionStateResolver` searches each non-terminal state in `*_STATES` order,
  oldest first, and resolves each row through the same private `resolve` that `resolveTransaction`
  uses, so expiry runs first for every swept row. A row's failure is logged as `Resolving
Midnight transaction <name> failed` and the next row still resolves (four table cases per
  resolver). A sweep and an event can prove the same `AwaitingProof` row at once, and the
  second `recordProof` is the conflict the resolver already swallows.
- 2026-10-09, Stage 7 flush consumer: `FlushEventConsumer.handleEvent` now calls
  `flusher.flush().catch(log)` and returns, reversing the Stage 5 await. With the sweep calling
  `flush()` every 30 s and `FlusherImpl` coalescing nudges, a run the hub no longer watches costs
  at most one interval when it fails, while an awaited run held every consumer and the Kafka poll
  for minutes. Two consumer tests cover the return before the flush ends and the logged failure.
- 2026-10-09, Stage 7 dev server: started with the preview tool (`.claude/launch.json`,
  `next-dev`), the boot logged `Backend started: 5 consumers registered, sweep every 30000 ms`,
  then `Relayer wallet synced in 1129 ms`, then `Sweep ran its first pass in 1227 ms and runs
every 30000 ms`, with no error line, and the server was stopped afterwards. A boot on this stack
  is ready for requests in under a second and has the wallet and the sweep's first pass done
  within about 1.3 s of `Backend started`.
- 2026-10-09, Stage 7 counts: `yarn check` passes end to end (typecheck clean, lint 0 errors and
  0 warnings, format clean, "Boundaries hold across 220 files (208 backend imports checked)"
  once the lifecycle test joined, `yarn test` 28 files and 538 tests, 14 new). `yarn test:integration` with no dev server running
  reports 8 files and 19 tests in 19.37 s (1 new). `AGENTS.md`'s list of backend-owned files
  holds uncommitted work and was not edited, so it still lacks `flusher.ts`, `sweep.ts` and
  `delay-unless-aborted.ts`.
- 2026-10-09, Stage 8 round trip, run 1: `yarn vitest run --config vitest.integration.config.ts
--reporter=verbose integration-tests/ethereum-erc20-vault-deposit.test.ts` with no dev server
  running passed in 244.11 s (the test 241 037 ms), exit 0, with no backend error line: the only
  stderr was the two `RPC-CORE ... disconnected from ws://127.0.0.1:9944/: 1000:: Normal Closure`
  lines polkadot prints when a submission's node connection closes. No defect surfaced in the
  flush, send, signature poll, broadcast, attestation, queue or complete paths, so no module was
  changed by this stage. The legs, from the test's own timestamps: start call built and stored in
  552 ms, deposit account funded on the fork in 3.3 s (the balance-slot probe found USDC's slot),
  start proven, balanced and submitted 4 s after the start, included and the deposit
  `AwaitingVaultRequest` at +34 s, the flush landed and the request `AwaitingSend` at +54 s (20 s
  for the relayer's `flushQueue` proof, balance and submission), `sendDeposit` proven and included
  and the request `AwaitingSignature` at +94 s, the MPC's signature read and `AwaitingBroadcast` at
  +124 s, the sweep mined on the fork and `AwaitingAttestationQueue` at +154 s (the attestation
  was already posted when the `awaiting-attestation` event nudged the resolver, so that state
  lasted under one poll), `queueAttestation1` included and `AwaitingAttestationFlush` at +184 s,
  the second flush landed and the request `Attested` and the deposit `AwaitingCompletion` at
  +200 s, and `completeDeposit` built, proven, balanced, submitted and included with the deposit
  `Completed` as `minted` at +241 s. Three legs waited on the 30 s sweep (`AwaitingSignature`,
  `AwaitingBroadcast` and the second `AwaitingAttestation` check), as the design says they must.
- 2026-10-09, Stage 8 round trip, run 2, without cleaning the chain: passed in 274.25 s (the test
  271 147 ms), exit 0, the same two stderr lines. The difference to run 1 is one extra sweep
  interval: the attestation was not yet posted when the `awaiting-attestation` nudge ran, so
  `AwaitingAttestation` lasted until the next sweep (30 s). The legs: `AwaitingVaultRequest` at
  +34 s, `AwaitingSend` +49 s, `AwaitingSignature` +94 s, `AwaitingBroadcast` +124 s,
  `AwaitingAttestation` +154 s, `AwaitingAttestationQueue` +184 s, `AwaitingAttestationFlush`
  +214 s, `Attested` and `AwaitingCompletion` +230 s, `Completed` +271 s.
- 2026-10-09, Stage 8 ledger and balances after the runs (`.scratch-spike/spike-ledger-open.mts`,
  `.scratch-spike/spike-wallet-dust.mts`): every vault map is empty after each run
  (`inputRequestBuffer`, `outputRequestBuffer`, `depositArgsMap`, `evictionMap`,
  `inputAttestationBuffer`, `outputAttestationBuffer` all `0n`), so no open request was left
  behind, and the user wallet's shielded balance of the vault token `96a2a81c6c63...` went from
  `1000000` after run 1 to `2000000` after run 2, the two mints. The relayer's DUST balance read
  83 758.58 DUST before run 2 and 83 792.83 after it: DUST generation on this stack outpaces the
  four relayer transactions of a deposit, so the fee cost is below the generation over the run
  and cannot be read as a difference of balances.
- 2026-10-09, Stage 8 timing of the hub path: a child's state change reaches its parent's resolver
  within the test's 5 s poll (the deposit moved `AwaitingVaultRequest` in the same poll that saw
  the start transaction `Succeeded`, the request moved `AwaitingSend` within the poll after the
  flush landed, and `Attested` and `AwaitingCompletion` landed in one poll), so an event-nudged
  step costs seconds and a sweep-only step costs up to 30 s. A relayer proof on this stack is
  fast: `sendDeposit` and `queueAttestation1` went from `AwaitingProof` to `AwaitingInclusion`
  within one or two polls (5 to 10 s), and the user's `startDeposit` was proven within 4 s.
- 2026-10-09, Stage 8 whole suite, run 3: `yarn test:integration --reporter=verbose` with no dev
  server running reports 9 files and 20 tests passed in 293.10 s, exit 0, the round trip inside it
  271 009 ms (one `AwaitingAttestation` sweep wait, as in run 2). This run is the one that
  verified the 23-event trail assertion in publication order (the first two runs asserted the
  deposit's five events only), so the trail box is ticked on it. The suite's duration rose from
  about 20 s to about five minutes with the round trip in it.
