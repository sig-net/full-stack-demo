# Stage 8b: the ledger acknowledges the user's transactions too

A defect found by the reviewer's own end-to-end run after Stage 8 passed three times for its
agent. Read this file, then the last section of `scratch-hand-off-pack/stage-8-report.md`, then
the "## Protocol facts" and "## Design overview" sections of `docs/deposit-build-plan.md`.

## What happened (observed, rows still in the database)

Caller `callers/70cfff4060e853cd177ba7f66d32beb10f2ecd9e075d7a6f55bc7b2840f840ef`:

- The deposit `.../ethereum-erc20-vault-deposits/704a3298-f32e-46c7-9c5b-1957a0595a70` is in
  `AwaitingCompletion`, its vault request is `Attested` with `attestationOutputKind`
  `executed` and output `01`.
- Its `completeDeposit` transaction `.../midnight-transactions/b8008be5-e898-41a2-a82e-d3cdc995d49e`
  is `Failed`, failure `Rejected`, error `Transaction submission failed`, recorded at
  16:19:58.748 UTC.
- The node's log at the same second: `📋 Validated transaction d214837b… for mempool`, then
  `📥 Applying transaction d214837b…` two seconds later.
- The ledger now holds nothing for the deposit's `inIndex` (`depositArgsMap.member` is false,
  all six vault maps are empty). The complete settled on chain and minted.

So the backend recorded as rejected a transaction the node accepted, moved the deposit back to
`AwaitingCompletion`, and a retry can never succeed: the request is settled. The end-to-end
test then waits for `Completed` until its timeout. The reviewer's run was under CPU load from
a concurrent unit test run, which is why the race showed.

## Why

`src/lib/midnight/transaction-v1/transaction-ledger-midnight-impl.ts` `submitToNode` runs the
SDK's `NodeClient.sendMidnightTransactionAndWait(bytes, 'Submitted')`. In
`node_modules/@midnightntwrk/wallet-sdk-node-client/dist/effect/PolkadotNodeClient.js`
(`sendMidnightTransaction`, around line 75), the polkadot `send(callback)` promise's rejection
is wrapped as `SubmissionError({ message: 'Transaction submission failed', cause: err })`,
whatever `err` is. The stream disconnects the API (`Stream.ensuring(api.disconnect())`) as soon
as `Submitted` is seen, and a `send` promise still pending at that moment rejects with the
closure (the "RPC-CORE ... Normal Closure" lines on stderr during a run). Our resolver turns
any thrown error into `Rejected`, and `messageOf` drops the `cause`, so the row says nothing
about why.

## What to build

1. Submission outcome, in `transaction-ledger-midnight-impl.ts` and the port
   `transaction-ledger.ts`. `submit` resolves with the id when the bytes reached the node,
   which includes a lost acknowledgement after a send. It throws only when the node refused the
   transaction with a reason or when nothing was sent (connection failure before the send).
   Establish by reading the SDK and polkadot error shapes which `cause` means refused (an RPC
   error from the node, such as `1010: Invalid Transaction`) and which means the acknowledgement
   was lost (a closure or disconnection after the send), and classify in the ledger impl, never
   in the resolver. Prefer a shape change over message parsing if the SDK gives one. Carry the
   cause chain into every error message (a `messageOf` that walks `cause`), so a row's `error`
   says what the node said. Unit test the classification with the SDK's error classes.
2. The Midnight transaction resolver keeps its shape: a thrown submit records `Rejected`, a
   returned id records the submission, and the inclusion watch plus expiry decide the rest. A
   transaction whose acknowledgement was lost and which the node dropped expires after its TTL.
3. The deposit resolver consults the ledger before believing a child's failure, the rule the
   vault request resolver already follows:
   - `AwaitingCompleteTransaction` with a `Failed` child: read the vault ledger (through
     `VaultLedger.state()` and `requestStage` with the request's `action`, `inIndex` and
     `requestId`). Stage `settled` means the complete landed, so record completed with the
     outcome derived from the stored attestation (`minted` when `executed` and the output byte
     is `0x01`, else `closed`). Any other stage records the complete failure as today.
   - `AwaitingCompletion` with no live child: the same ledger check, so a complete that landed
     under a lost acknowledgement, or through another client, is recorded on the next sweep.
   - `AwaitingStartTransaction` with a `Failed` child: the ledger check, and if the request is
     on the ledger (`queued` or later) record started instead of the start failure.
     The deposit resolver gets the `VaultLedger` and the vault request repository it needs from
     the composition root. Table-driven cases for each branch with fake ledger views
     (`vault-ledger-fixtures.ts`).
4. The outcome derivation lives in one place: the deposit resolver already derives it on a
   succeeded complete. Reuse that function.
5. The end-to-end test: when the deposit returns to `AwaitingCompletion` after a complete
   attempt failed, call `completeDeposit` again, at most three times, logging each attempt and
   the failed transaction's `failure` and `error`. With the fixes above the retry should rarely
   be needed, and when the request is already settled the resolver completes the deposit on
   its own before the retry fires. Keep the polling as it is.

## Verification

- `yarn check` green, `yarn format` before `yarn format:check`.
- The live reproduction: with no dev server running, start the backend from a throwaway script
  in `.scratch-spike/` (`createBackend`, `start()`, wait for the first sweep, `stop()`) or run
  the lifecycle integration test, and watch the deposit above move to `Completed` with outcome
  `minted` through the ledger check. Then delete that caller's rows from the four resource
  tables and the outbox.
- The end-to-end test, run alone with the verbose reporter, passes:
  `yarn vitest run --config vitest.integration.config.ts --reporter=verbose integration-tests/ethereum-erc20-vault-deposit.test.ts`.
- `yarn test:integration` green as a whole.

## Docs and plan

README: in "Midnight transactions", what `Rejected` means now and that the deposit resolver
reads the ledger before believing a failed start or complete. Plan: a findings entry dated
today describing the defect, the node log evidence, and the fix, and tick nothing (Stage 8's
boxes stay as they are, this is a correction under Stage 8).

## Report

Write `scratch-hand-off-pack/stage-8b-report.md`: the classification you built and the SDK
evidence for it, the resolver branches, every verification with observed output, and anything
the Stage 9 agent must know.
