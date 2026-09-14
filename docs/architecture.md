# Application ownership

The React provider tree composes configuration, wallet connections, readiness, vault identity, vault binding,
balances and operations. A connected wallet does not establish balance availability or operation
eligibility. Remote observations use React Query, with session identity included where a replacement
instance changes the meaning of a result.

## Vault identity and binding

`VaultIdentityProvider` owns the validated applied secret in page memory and operates independently
of wallet, configuration and query providers. Home and toolbar editors share that applied value,
while each panel owns a temporary draft and unique input identifiers. Closing a panel clears its
draft and feedback. The identity status indicates an applied secret.

`VaultProvider` subscribes to synchronous identity invalidation. Replacing or clearing the secret
disposes the captured session and removes its query before the identity action returns. Captured
bindings reject further work immediately. Wallet disconnect retains the applied identity and
invalidates the binding through the vault owner's disconnect action. Clearing identity retains the
wallet. Wallet replacement and configuration invalidation continue to guard dependent sessions.

## Vault execution

`VaultOperationsProvider` captures a binding, configuration snapshot, token decimals and operation
identity before execution. Its synchronous lock covers the readiness, metadata and funding stages
as well as transaction execution. The shared progress owner holds the identity of the operation that
started it, so only that operation publishes phases and terminals and a later operation silently
supersedes an abandoned one. Every operation that stops publishes a terminal state, whatever happened
to its captured binding, so no surface keeps reporting work in flight after the work has ended. Low-level
vault functions accept the progress capability and return a settled or refunded result, including
attested output units where available.

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

## Deposit request lookup outcomes

`lookupDepositRequest` in `src/lib/midnight/vault.ts` resolves one request ID against the bound
session and returns a `DepositLookup` from `src/lib/midnight/deposit-lookup.ts`. The outcomes are
`looking-up`, `recoverable` with the exact units the request settles, `completed`, `not-found`,
`mismatched` for an identity, token or deployment the current session cannot recover, `malformed`
and `error`. `describeDepositLookup` is the single place those outcomes become words, so the
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
observations. Request IDs, transaction hashes and destinations remain available for inspection.

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
