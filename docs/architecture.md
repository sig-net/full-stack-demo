# Application ownership

The React provider tree composes configuration, wallet connections, readiness, vault identity, vault binding,
balances and operations. A connected wallet does not establish balance availability or operation
eligibility. Remote observations use React Query, with session identity included where a replacement
instance changes the meaning of a result.

## Vault identity and binding

`ConfigurationProvider` owns one store holding the applied public configuration, the validated
vault secret in page memory and local faucet eligibility. The secret is a separate section of that
store: applying it never changes the public configuration revision, and applying public
configuration never clears it. Home and toolbar editors share the applied secret, while each panel
owns a temporary draft and unique input identifiers. Closing a panel clears its draft and
feedback. The identity status indicates an applied secret. The provider clears the secret when it
unmounts.

`VaultProvider` subscribes to the store's synchronous invalidation bus. An identity change
invalidates the `identity` and `vault` scopes, so replacing or clearing the secret disposes the
captured session and removes its query before the identity action returns. Captured bindings
reject further work immediately. Wallet disconnect retains the applied identity and invalidates
the binding through the vault owner's disconnect action. Clearing identity retains the wallet.
Wallet replacement and configuration invalidation continue to guard dependent sessions.

## Vault execution

`VaultOperationsProvider` captures a binding, configuration snapshot, token decimals and operation
identity before execution. Its synchronous lock covers the readiness, metadata and funding stages
as well as transaction execution. The shared progress owner holds the identity of the operation that
started it, so only that operation publishes phases and terminals and a later operation silently
supersedes an abandoned one. Every operation that stops publishes a terminal state, whatever happened
to its captured binding, so no surface keeps reporting work in flight after the work has ended. Low-level
vault functions accept the progress capability and return a settled or refunded result, including
attested output units where available and the Midnight transaction that carried the concluding
circuit call.

Beside the phase label, an operation publishes structured checkpoints in the order its evidence
arrives: the submitted request with its predicted identifier, the request confirmed on the ledger,
the signature wait, the EVM broadcast with its transaction hash, the receipt with its block, the
attestation wait, the attested outcome and the Midnight settlement with its transaction hash and
block height. The broadcast checkpoint is published once the transaction is on the network, before
the receipt wait begins, and the same hash reaches the operation record there, so a surface can show
a pending sweep by its own hash. The progress owner also holds the time the current stage began and
the time of the most recent chain read that returned without error, which a surface reads to show
elapsed time and observation freshness.

The responder that signs the sweep reads the request from the Midnight ledger and attests the sweep
outcome from the EVM receipt at the latest block. Neither step is gated on a confirmation depth or on
a `finalized` block tag, and the installed reader API exposes no such threshold, so no required
confirmation count is claimed anywhere. While the sweep is on the network the client observes it with
its own React Query poll, reporting canonical inclusion, current depth, and whether the finalized
head covers the receipt block on endpoints that serve the tag. Inclusion is rechecked against the
canonical block at the receipt's own height, so a replaced block reports a lost inclusion with no
depth, and finality is reported only for a receipt that is canonical at its own block. A sweep proven
final while the attestation is absent says exactly that: the shielded balance is credited from the
verified attestation alone, never from chain finality.

The two MPC waits observe for twenty minutes. That limit bounds this client's own observation and not
the responder, so elapsing it reports an unfinished observation of a request that is still live on the
ledger and recoverable by its request ID, never an on-chain failure, and it never resends anything.
Polls start one second apart and back off to five seconds, publishing an observation on every read
that returns. A read that fails is retried, and a read that keeps failing is reported as itself.

History outcomes belong to the captured operation. A successful settlement remains successful if a
subsequent balance refresh fails. Replacing the visible session suppresses obsolete logs and deposit
request attribution, while preserving captured settlement evidence. Interrupted observation is
distinct from confirmed failure. Continuation uses retained request identifiers and checks the
request on the ledger.

## Deposit preparation transfer

`EvmDepositProvider` owns the preparation ERC-20 transfer separately from the later MPC-signed sweep.
Each terminal outcome is classified once into a recoverable state carrying its message, next action,
optional provider detail and the one recovery a surface may offer. The submitted/unsubmitted split is
the safety boundary: a transfer that could still settle offers a receipt recheck and never another
send, and a released local wait still accepts the late submitted hash. Continuation ownership is a
reference acquired before any await, so repeated clicks, duplicate mounts and a delayed preflight
cannot reach the sweep twice.

## Deposit from an existing address balance

The unswept ERC-20 balance at the identity-derived deposit address is read by the binding-scoped
vault balance owner, which polls while no vault operation is running and needs no EVM signing
wallet. The binding is replaced whenever the applied network, deployment or identity changes, so a
replacement session never inherits a previous observation. `describeDepositSweepBalance` turns that
observation plus the identity's pending deposit requests into one state, keeping a pending read, a
failed read, an empty address and reserved funds distinct.

The vault contract signs `transfer(vaultEvmAddress, amount)` for the exact requested amount and mints
that same amount on settlement, so a deposit may move part of the address balance and leave the rest
in place. A pending request's sweep is signed against the deposit address's current EVM nonce, so at
most one request per address can ever be mined. `runDeposit` therefore rejects a new request whenever
any request for that identity and token is still pending, after re-reading the ledger, and the
surface blocks the control and lists those requests with their IDs and amounts.

## Deposit steps and re-entry

`describeDepositSteps` in `src/lib/midnight/deposit-steps.ts` projects the published `FlowEvent`
checkpoints onto the five steps of the deposit dialog contract. Completion comes from the event
that proves the step: `request-confirmed` for the request, a sweep transaction on the network for
the MPC signature, `evm-receipt` for the sweep, an `attestation-present` whose outcome succeeded for
the attestation, and `midnight-settled` for the Midnight settlement. `request-submitted` is absent
on a resumed or recovered run, so it takes no part in that decision. Nothing in the derivation reads
confirmation depth or finality, so observed chain progress can never tick a step. The failing step
keeps its position and reports the terminal failure, and earlier completions are retained.

Re-entry needs no separate resume path. `pollSignatureResponse` returns on its first successful read
when the verified response already exists, `broadcastEvm` looks up the receipt before broadcasting
and reuses the same serialised transaction when it must rebroadcast, and the attestation loop
returns on its first read when the attestation is present. `runDeposit` therefore resumes a request
at whatever stage its own evidence has reached, and republishes the checkpoints it reads back.
Before `completeDeposit` it resolves the request once more, so a request another session settled in
the meantime rejects and is completed exactly once.

## Deposit request lookup outcomes

`lookupDepositRequest` in `src/lib/midnight/vault.ts` resolves one request ID against the bound
session and returns a `DepositLookup` from `src/lib/midnight/deposit-lookup.ts`. The outcomes are
`looking-up`, `recoverable` with the exact units the request settles, `completed`, `not-found`,
`mismatched` for an identity, token or deployment the current session cannot recover, `malformed`
and `error`. `completed` carries no transaction of its own: `completeDeposit` removes the signature
request the sweep hash derives from, so the settled sweep is not recoverable from a chain read at
the moment that outcome becomes true. The recovery surface renders both settlement legs from the
persisted operation record instead, and shows none for a deposit settled in another browser. `describeDepositLookup` is the single place those outcomes become words, so the
recovery surface and the deposit stepper render one wording.

`completeDeposit` is the only circuit that removes a request from `depositEventMap` and
`depositSettleViews`, so an attested response for a request that has no view left on this ledger is
the evidence for `completed`. Without that response the outcome is `not-found`, which states that
the request may already be completed or may never have been created against this vault, and never
asserts that the deposit did not happen. A request ID carries no network tag, so a request created
against another network or vault contract is simply absent from this ledger and reports as
`not-found`. `runDeposit` and the operations provider both narrow the same result, so only a
`recoverable` request reaches settlement.

## History and lending attribution

History persistence validates record kinds, statuses, numeric accounting fields and optional public
metadata. Human-readable amount labels are display text, while accounting consumes separate validated
integer-unit fields. It retains bounded public records. Pending records loaded after a refresh become interrupted
observations. Request IDs, destinations and both settlement legs remain available for inspection:
each record keeps the EVM settlement hash and the Midnight transaction hash separately, and each
resolves its own explorer route from the chain captured with the record.

Lending attribution matches the public vault commitment, Midnight network, EVM chain, vault contract,
asset contracts and their decimal scales. A captured public configuration fingerprint additionally
separates configured stacks, including endpoint changes, even when their contract addresses match. Records without this scope remain visible in Activity and
cannot establish the displayed position's cost. Share reconciliation and net asset cost use integer
base units. Approximate rates and earnings belong to display and cannot establish transaction eligibility.

## EVM resources

Ethers reads and execution callbacks own their RPC provider until their work resolves or rejects,
then destroy it. Concurrent operations own separate providers. Broadcast retries and receipt checks
within one callback share its captured provider. Public viem clients capture validated chain and
endpoint inputs. Browser signing clients remain under the EVM wallet owner.

## EVM fee reserves for MPC-signed transactions

The account that pays an operation's EVM fee is determined by the request path the vault signs
under. The deposit sweep is signed for the identity's deposit address, and withdrawals, swaps,
supplies, redemptions and their one-time approvals are signed for the EVM vault address.
`MPC_OPERATION_ETH_RESERVE` in `src/lib/midnight/evm-envelope.ts` derives each requirement from the
same fixed envelope caps those transactions carry, so a requirement never depends on fee-market
data. `describeGasReserve` keeps a pending read, a failed read, an empty account and a short balance
distinct, and a failed read never becomes a satisfied requirement.

`useVaultGasReserves` observes both accounts through the applied chain configuration without a
signing session, scoped by endpoint, chain, vault binding generation and account. Surfaces derive
their condition once from it and pass that one value to both the panel and `aria-describedby`.
Enforcement is separate from observation: `requireGasReserve` performs a fresh read inside the
shared operation `execute` for every vault-address operation, and `runDeposit` requires the sweep
reserve only on the branch that signs a new request, so a resumed or recovered deposit is never
blocked by a reserve its existing sweep has already spent.

## Midnight fee readiness and funding

`MidnightReadinessProvider` observes the connected wallet's fee balances and checks its transaction
capability. It can operate with the wallet connection alone. `MidnightLocalFundingProvider` composes
that observation with server eligibility, one shared funding mutation and wallet-owned DUST
registration. Funding rechecks the captured wallet after asynchronous boundaries and exposes refresh
errors through its own mutation state. The server retains authority over privileged funding inputs.

## Swap and lending models

`useVaultSwap` and `useVaultLending` own remote queries, precise amount eligibility and action
feedback. Components render their models through the shared controls. Selections and quote output
are derived from current inputs and observations. Session and input revisions guard completion
feedback, including a value changed away and back while an operation is pending. A stale completion
cannot clear current input or report an obsolete result as current.
