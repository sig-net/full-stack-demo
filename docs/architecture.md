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
as well as transaction execution. A captured progress capability publishes only while its operation
still owns the current presentation. Low-level vault functions accept that capability and return a
settled or refunded result, including attested output units where available.

History outcomes belong to the captured operation. A successful settlement remains successful if a
subsequent balance refresh fails. Replacing the visible session suppresses obsolete progress and logs,
while preserving captured settlement evidence. Interrupted observation is distinct from confirmed
failure. Continuation uses retained request identifiers and checks the request on the ledger.

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
