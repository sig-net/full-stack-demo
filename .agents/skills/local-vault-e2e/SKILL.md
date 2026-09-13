---
name: local-vault-e2e
description: Run and diagnose the local ERC-20 vault UI with the examples stack, Playwright and a real MetaMask wallet. Use for browser regression checks, deposit acceptance, local setup, reuse and pending-deposit recovery. Choose verification scope from the requested task.
---

# Local vault browser verification

Treat the repository containing this skill as the UI checkout. Resolve the companion examples
checkout from the user's task or the UI README, then verify its actual git ref and setup entrypoint.
Do not assume the similarly named examples checkouts contain the same code.

## Select the requested scope

- **Read-only readiness:** inspect services, deployment and the prepared browser without mutations.
  Read [readiness.md](references/readiness.md), then only the relevant troubleshooting section.

- **Browser smoke:** connect, inspect balances/readiness, exercise the affected controls. Use this
  for a task such as EVM owner extraction when its acceptance excludes a funded deposit or reset.
- **Kept-stack deposit:** preserve the live deployment, complete one small UI deposit and verify
  settlement and credential re-entry. This is the default full browser acceptance test.
- **Clean-stack acceptance:** execute the README setup, scoped reset and reuse procedures, then
  the deposit. Only select this when the request includes deployment/reset verification.
- **Recovery or another operation:** inspect the operation's current stage first. Use recovery
  guidance for a pending deposit. A swap requires its own expected output and settlement evidence,
  not merely a deposit-shaped success toast.

The skill does not authorise another operation, a reset, a global installation, or a commit.
A smoke test is not full deposit evidence. A successful deposit is not swap acceptance.

## Start with the maintained sources

Read the requested task's acceptance boundary. For execution, read the UI README. Read
[stack.md](references/stack.md) when checking services, starting or resetting them.
Read [browser.md](references/browser.md) before browser interaction.
Read [diagnosis.md](references/diagnosis.md) when a stage fails or stops advancing.
Read [evaluation.md](references/evaluation.md) when testing this skill itself.
Do not read every historical task or integration test before starting.

Executable browser tooling lives in the UI's `scripts/local-vault/` directory. Its package is
pinned in the UI manifest and lockfile. The scripts resolve their dependencies relative to their
own location. From the UI root, the transport checks are:

```bash
node scripts/local-vault/chromium-post-data-cap.test.cjs
node scripts/local-vault/transport-preflight.cjs
```

Run them when provisioning or changing the launcher, or diagnosing the known transport failure.
Do not repeat the upload preflight before every browser click or after an unchanged successful run.

## Establish ownership and a session record

One agent owns the prepared browser. If the current session identifies that owner, request its
relay directly. Otherwise make one tab-list attempt. If another agent owns the profile, keep that
owner as the relay and send bounded UI steps with expected observations.
Do not terminate its browser or create a replacement wallet to avoid the lock.

Keep current operational state in a private, ignored `.local-vault/` directory at the UI root.
Read an existing `session.md` directly before collecting new context. Keep it concise, with
checkout paths/refs, service ownership, current deployment/fork identity, browser owner/profile
path, configured and active launcher paths, verification timestamp/evidence, any pending restart,
private credential-file location, operation stage and public
transaction/request identifiers. Record tests and limitations as they occur. Secrets themselves
belong in separate mode-0600 files, not the session record or tool output. Check ignore coverage
before creating private state. Never treat process IDs or request IDs in an older report as current.

Do not depend on Playwright Page memory as the only copy of an acceptance identity. Browser
restart and HMR can destroy it. Preserve disposable test credentials privately before starting a
funded operation, with the user's existing credential preferences respected.

## Evidence required for a deposit

Capture the selected token and exact amount, source account, derived destination, confirmed EVM
transfer hash, Midnight request ID, fakenet signature/attestation and sweep, final Midnight claim,
shielded balance delta, completed Activity and matching request ID. Then verify refresh requires
seed and caller-secret re-entry and that re-entry restores the balance. If teardown changed,
exercise explicit disconnect/reconnect too.

Before retrying, inspect the live request and receipts. A confirmed transfer does not prove a
claim. A failed UI read does not reverse settlement. Do not submit another transfer or sweep to
recover missing evidence. Keep fees for user start/claim separate from responder and funding fees.

After code changes run the repository's required checks and affected regressions. Use the task's
completion criteria, not a fixed QA expansion. Report what was executed, the current running
state, blockers and any remaining limitations. Keep the human README self-contained when updating it.
