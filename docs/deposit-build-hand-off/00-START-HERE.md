# Hand-off pack: start here

You are implementing one stage of `docs/deposit-build-plan.md` in the repository
`sig-net/full-stack-demo`. This pack carries what the previous agent learned so you do not spend
context rediscovering it. Read the three files in order, then the plan's section for your stage,
then start.

1. `00-START-HERE.md` (this file): where, how, what to deliver.
2. `01-codebase-context.md`: the patterns and facts the code expects, with the file map.
3. `02-stage-task.md`: your stage, expanded with everything learned that bears on it.

## Where

- Worktree: `/Users/bernard/Projects/github.com/sig-net/full-stack-demo-rebuild`, branch
  `bernard/rebuild`. Run everything from there. Never touch the primary checkout.
- The local stack is up: Postgres and Kafka (`compose.yaml` in this repo), and the Midnight
  node, indexer, proof server, the fakenet MPC responder and an anvil Sepolia fork from the prep
  repository `/Users/bernard/Projects/github.com/sig-net/midnight-examples-fullstack-demo-prep`
  (`docker-compose.yaml` there). `.env.local` in this repo is already synced to that stack.
- The prep repository's `examples/erc20-vault/` holds the contract source, docs and the
  integration-test flows that this backend ports pieces from. Read there, never edit there.

## Rules that bind you

- `AGENTS.md` (project) and `~/.claude/CLAUDE.md` (global) are authoritative. Two that bite most:
  no em dashes or prose semicolons anywhere you write (code comments, docs, commit text), and
  never start a sentence with "Because". British spelling.
- Never commit or push. The user commits after review.
- Never install anything globally. Dependencies go through `yarn add` in this repo, with a real
  consumer, and only when the stage names them.
- Comments state what is, one sentence, only what a reader cannot get from the code. No history,
  no rejected alternatives, no "instead of" or "rather than".
- The file's focus declaration comes first after the imports.
- Durable claims need executed evidence. Every command you quote in a doc was run verbatim.
- A new automated guard, or an extension of one, gets a planted violation seen failing, then a
  restore and a passing rerun. Restore from a backup copy, never `git checkout` a file that has
  uncommitted edits.

## Commands

```bash
yarn typecheck      # TypeScript 7 strict. One pre-existing failure is expected, see below.
yarn lint           # oxlint
yarn format         # oxfmt, writes. `yarn format:check` verifies.
yarn boundaries     # the backend boundary guard, scripts/check-boundaries.ts
yarn test           # vitest unit tests, files *.test.ts beside the code under src/
yarn check          # typecheck, lint, format:check, boundaries, test (stops at the first failure)
yarn test:integration                                  # integration-tests/, needs the stack
yarn vitest run --config vitest.integration.config.ts integration-tests/<file>.test.ts
yarn db:generate    # drizzle-kit, writes drizzle/NNNN_<name>.sql and meta/
yarn db:migrate     # applies; it swallows SQL errors, so verify with psql
docker compose exec -T postgres psql -U demo -d demo -c '\d <table>'
```

`yarn check` is green end to end since Stage 6. Keep it so.

`yarn db:generate` prompts interactively when one schema edit drops a column and adds others to
the same table ("created or renamed from another column?") and hangs without a TTY. Avoid the
prompt by generating in two steps when you both drop and add, or run it from the user's
terminal pane. The Stage 3 agent drove it with a Python `pty` script.

The user has uncommitted work of their own in the tree: diagram files under `docs/`
(`diagramming.md`, `diagram-palette.*`, `diagram-library.*`, `transaction-state-machine.*`,
`diagram-assets/`), `drawio.config.json`, and a `## Diagrams` section at the end of
`AGENTS.md`. Leave all of it exactly as it is. When you grep for a name you invalidated and the
only hit is in one of those files, note it in your report and do not edit it.

Throwaway scripts (spikes) run from a gitignored folder inside the project, as `.mts`:

```bash
NODE_OPTIONS=--conditions=react-server node_modules/.bin/tsx --env-file=.env.local .scratch-spike/<name>.mts
```

A script outside the project cannot resolve `node_modules`, and a `.ts` file outside it is read
as CommonJS. `.scratch-spike/` already exists with spikes from Stages 2 and 3 you may copy
from (building and proving a vault circuit call, reading the vault ledger, probing anvil).

## Before a smoke test or an integration run

Make sure no dev server is running (`ps aux | grep "[n]ext dev"`). A running server's outbox
relay and consumers compete with the test's. If you use the preview tool to start one for a
check, stop it afterwards.

## What to deliver

1. The stage's code, tests and migration, with every box of the stage ticked in
   `docs/deposit-build-plan.md` after its verification ran.
2. Findings appended to the plan's findings log, dated, each naming the command, file or test
   that established it. Decisions you took that deviate from the plan go there too.
3. README.md updated where the stage adds behaviour a reader needs (a section, a table row),
   self-contained, no pointers to agent files.
4. A report at `scratch-hand-off-pack/stage-<N>-report.md`: what you built, how each claim was
   verified (with the observed output), what in this pack was wrong or missing and what you had
   to look up yourself, and what the next stage's agent must know that is not yet in the plan.
   That report is the input to the next hand-off pack, so be concrete.
5. Leave the tree uncommitted and every check green (except the known typecheck failure).
