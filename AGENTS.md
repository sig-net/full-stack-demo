# Engineering rules

Apply these requirements to new and changed code. Existing violations are not precedent.
Keep setup instructions and application reference material in README.md and docs/.

## Precise types

- Preserve precise types through every application boundary. Explicitly type function parameters
  and returns, shared interfaces, context values and generic SDK specialisations. Local variables
  and contextually typed callbacks may use inference when it retains the precise type.
- Do not use `any`, explicitly or through unsafe assignments, arguments, returns, calls or member
  access. Do not use `unknown` to avoid resolving an SDK, generated contract or application type.
  Search installed declarations and existing exports. Carry generated circuit, private-state,
  provider, contract and ledger types through their consumers without widening them.
- Permit `unknown` only at designated external-input validation and caught-error handling
  boundaries. Narrow or validate it there before returning domain values. A new boundary exception
  requires explicit review and a documented reason. Do not spread `unknown` through domain APIs.
- Type assertions must have a demonstrated invariant the compiler cannot express. Never use
  double casts, non-null assertions, suppression comments or lint/configuration changes to conceal
  a mismatch. Fix the contract or validate the value. An annotation receiving `any` is not proof
  of safety. Preserve strict TypeScript and unchecked-index checking.
- Define each closed set once using an authoritative enum, literal union or constant object.
  Reuse dependency-owned sets and handle meaningful variants exhaustively. Model unavailable
  capabilities explicitly instead of implementing throwing placeholders behind a broad interface.

## Boundaries and ownership

- Before changing shared code, census its actual consumers, including browser, server, tools and
  tests. Record runtime, environment and required capabilities. Replan for unexpected consumers.
  Search dependency exports and sibling modules before creating a shared helper, type or constant.
- Keep generic capabilities independent of application policy. Configuration, wallet lifecycle,
  contract binding, balance queries, funding and operation orchestration have separate owners.
  Provider composition must respect those dependencies. Prove an extracted generic boundary can
  operate without the feature that prompted its extraction.
- Components render precise props and compose UI. Local presentation state may remain local.
  Reusable React behaviour belongs in hooks, domain mechanics in non-React modules, and shared
  operations in owners that survive individual consumer mounts. Add a provider or abstraction
  only for a demonstrated ownership need. Share code at the second real consumer.
- Keep public configuration, browser SDK assembly and server secrets separate. Shared modules
  must work in every consuming runtime. Pass validated immutable configuration into resources.
  Apply related edits atomically and invalidate only affected sessions. Browser input cannot
  redefine server funding authority or privileged configuration.
- Match names to actual responsibilities. Adding a variant reopens sibling and container names.
  Qualify both members when introducing a qualified twin. Moves, deletions and renames require a
  whole-repository search for invalidated names and updates to imports, configuration, manifests,
  tests and documentation in the same change.

## State and asynchronous work

- Use React Query for remote reads, mutations and application data caching. Do not fetch remote
  state through hand-written fetch-and-set-state effects or add a parallel application cache.
  Preserve the bounded, verified ZK prover-key cache as a specialist resource cache.
- Scope queries and resources to their actual configuration and session generation. A stable
  account or contract ID does not identify a replacement instance. Capture operation inputs,
  reject superseded results and recheck ownership after awaits before publishing or mutating.
  Disabled queries must not expose disposed bindings as ready. Keep secrets out of query keys.
- Give resource construction, synchronisation, subscriptions and transport teardown explicit
  ownership. Cover cancellation during construction as well as after connection. Dispose owned
  resources exactly once and reject late writes. Recovery must rebuild dependent bindings while
  respecting current inputs. Do not depend on memoisation for resource correctness.
- Acquire shared operation ownership before the first await. Duplicate mounts, repeated clicks
  and delayed preflight cannot submit duplicate work. Keep submitted hashes and captured account,
  network, token, destination and amount across dialog closure or session changes. Never
  automatically resend because confirmation or continuation is slow or fails.
- Verify the intended transaction and its effect, including replacements and cancellations.
  Preserve distinct settlement, refund and failure outcomes. A refresh failure after settlement
  remains a refresh failure and cannot unlock another execution of the completed operation.
- Separate connection, capability support, binding readiness, balance availability and operation
  eligibility. Gate each action on its own prerequisites and leave setup/recovery reachable.
  Failed reads remain unavailable, never zero. Fetch authoritative token decimals, reject excess
  input precision before conversion and preserve exact amounts throughout display and execution.
- User seeds and independent vault secrets stay in page memory. Clear transient secret inputs on
  close and release owned credential references on replacement or disconnect. Keep secrets out of
  persistent stores, URLs, public configuration, logs and evidence. Inspect checkpoint contents
  before treating them as safe. Browser-wallet credentials remain under extension ownership.

## Presentation and React

- Use the established shared component library and one semantic theme. Shared definitions own
  colours, typography, borders, radii, shadows, density and interaction states. Features select
  bounded variants and compose structural layout. Do not bypass this through appearance classes
  or feature stylesheets. Record genuine artwork or dynamic-geometry exceptions with their scope
  and reason. Update every consumer of a changed shared presentation contract.
- Define hover, visible keyboard focus, selected, expanded, invalid, loading and disabled states
  centrally. Enabled actions use the pointer cursor, text inputs retain the text cursor, and
  disabled controls cannot activate. Verify composed controls and portals in the final cascade.
  Never suppress an outline without visible replacement focus styling.
- Render external names as text and icons as image sources with fallbacks. Use accessible labels
  and status text, not colour alone. Surface actionable errors through the shared feedback UI.
  Global connection controls belong in the shell, with contextual entry points using the same owner.
- Do not introduce `useMemo`, `useCallback` or `React.memo`. Follow the React Compiler convention
  while keeping explicit resource ownership. Choose client-component boundaries for actual
  browser APIs, state or effects. Do not force every page into client rendering or dynamic mode.

## Changes and verification

- Add dependencies with a real consumer and keep manifest/lockfile changes together. Preserve
  required component-generator foundations. Verify compatible resolved SDK/runtime versions and
  generated code/assets, not just matching version strings. Copied component upgrades require
  reviewing source, CSS, runtime dependencies and consumer APIs separately from the CLI version.
- Keep tooling and installation caches project-local. Preserve unrelated working-tree changes,
  running services, browser ownership and submitted-operation evidence. Do not commit or push
  without explicit authorisation. Only run a production build when explicitly requested.
- Run `yarn lint && yarn typecheck` after the final edit, plus checks appropriate to the affected
  behaviour. Confirm changed files are actually covered. Do not weaken checks to get a pass.
  Report failures and warning counts honestly. A dev server or production build is not a
  substitute for typechecking.
- Test observable behaviour and costly boundaries. UI tests use roles and accessible names.
  Exercise lifecycle races and duplicate consumers when changing ownership. New automated guards
  require a non-empty input assertion and an observed failure on a planted violation before
  restoration and a passing rerun. Keep verification proportional to the authorised change.
- For presentation changes, inspect the real browser, including hover/computed styles, keyboard
  focus, disabled states, portals and narrow layouts. Static screenshots and successful clicks
  alone do not establish interaction-state correctness. Distinguish fixtures, real SDK execution,
  browser observations and funded end-to-end acceptance in the evidence.
- Inspect the final diff for unintended replacements and formatting churn. Remove unused code and
  dependencies. Prefix deliberately unused parameters with `_`. Comments state current invariants
  or non-obvious failure modes at their definition, without narrating mechanics or duplicating
  callee documentation. Keep human instructions self-contained, update stale references and verify
  durable factual claims by execution. Run documented commands verbatim before publishing them.
