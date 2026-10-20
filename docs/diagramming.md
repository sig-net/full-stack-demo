# Diagram style guide

Every draw.io diagram in this repository follows the
[drawio-cli style guide](https://github.com/BRBussy/draw-io-cli/blob/main/docs/style-guide.md):
the committed pair, the edge-label golden rules, the routing rules, the layered
composition, the working-size budget, the curated-layout mandate and the project layout
all bind here exactly as that page states them, and this page never restates them. This
page holds only what is specific to these diagrams: what the colours mean, the verb
table, the state-machine and action-flow conventions, and the icon bank. The palette
card at [diagram-palette.drawio.png](diagram-palette.drawio.png) shows each convention
rendered, and its source [diagram-palette.drawio](diagram-palette.drawio) is the copy
source: take styled cells from it rather than restyling by hand. Render settings and the
lint vocabulary live in [drawio.config.json](../drawio.config.json) at the repository
root.

**TIP:** If you are using a coding agent you can ask it to edit and render diagrams for
you: it can extract, edit, render, lint and visually verify the result on your behalf.

## Diagram kinds

Two kinds of diagram live here, and each has its own conventions below:

- A **state machine** per resource with a lifecycle (`transaction-state-machine`,
  `deposit-state-machine`): the states and transitions of one resource, read from its
  `*-state-machine.ts` table and its state controller.
- An **action flow** per action: the path one call takes through the backend, drawn as
  the service providers it passes through in call order, a call edge from each calling
  method to the method it calls, and the stores, brokers and events it reaches.

## Colour palette

On a state machine, colours mean who performs a transition. Every transition edge carries
the colour of the actor whose code calls the state controller method, and nothing else is
coloured: structure stays neutral, default black strokes on a white background, lanes and
shapes unfilled. An action flow colours its edges by stage instead (see the stage table
under Action flows).

| Actor    | Colour    | Performs                                                                 |
| -------- | --------- | ------------------------------------------------------------------------ |
| caller   | `#E73F74` | a transition a caller's request drives, through an adaptor and a service |
| resolver | `#3969AC` | a transition the state resolver makes after a slow external call         |
| expiry   | `#7F3C8D` | the transition the expiry sweep makes when `expireTime` passes           |

Coloured edges, state-machine transitions and action-flow calls alike, turn their
corners as arcs, carried by the palette's swatches.

## Labels

- Names come from the source: a state is spelled as its `MIDNIGHT_TRANSACTION_STATES` or
  `DEPOSIT_STATES` member, a transition's subject is the state controller method that
  makes it, a service provider is its implementation class name and the interface it
  implements, and an entity is its type name and its schema's fields.
- On a state machine, an edge label's subject is the state controller method
  (`recordProof:`, `expireTransaction:`), and its body says what that method stores or
  publishes. The subjects in use are listed in the config's `lint.subjects`, and a new
  subject lands there in the same change as its first label.
- On an action flow, a call edge's label is the call as the calling method spells it, a
  code label (`this.transactionRepository.get(args.name)`), which the format rule exempts.
  Where the argument list spans several lines or nests another call, the label keeps the
  callee exactly as written and elides the arguments (`createUnprovenCallTx(...)`), so it
  still greps. A call from one row to another carries no label, since the two rows already
  name caller and callee: labels go on the server-action calls from the browser, on calls
  through a closure the backend wires in (`this.onFlushed()`), and on every call into an
  actor box. Edges that leave one row with the same call share their first run, which
  carries the label once.
- Code text uses Menlo/Monaco monospace at 12px, the keyword in `#AF00DB`, the name in
  `#202020`. Copy the sample cell from the palette card.

### The verb table

One verb, one meaning, everywhere an edge label or note describes an action:

| Verb      | Who says it               | Means exactly                                                                    |
| --------- | ------------------------- | -------------------------------------------------------------------------------- |
| Stores    | a state controller method | writes a field the next state needs onto the row                                 |
| Deletes   | a state controller method | clears a field the state leaves behind (`unprovenTx` on leaving `AwaitingProof`) |
| Records   | a state controller method | writes the outcome of a chain step (a transaction id, a failure)                 |
| Publishes | a state controller method | emits the lifecycle event of the state entered                                   |
| Proves    | the resolver              | sends the unproven transaction to the proof server                               |
| Submits   | the resolver              | sends the finalized transaction to the node                                      |
| Watches   | the resolver              | polls the indexer for the transaction's inclusion                                |
| Expires   | the expiry sweep          | ends a transaction whose `expireTime` passed                                     |
| Creates   | an adaptor or service     | opens a resource row in its first state                                          |
| Reads     | a component               | pulls a row or a ledger value through a repository or ledger port                |
| Returns   | a component               | hands a result back to its caller                                                |
| Relays    | the outbox processor      | moves an outbox entry onto Kafka                                                 |

When no row fits an action, the table extends: a new verb lands as one row here and in
the config's `lint.verbs` (verb, who says it, exact meaning), in the same change as its
first label, keeping one verb one meaning.

## State machines

- One diagram per resource, one swimlane for the resource, titled with the resource's
  collection name as the source spells it (`midnight-transactions`).
- A state is a node box carrying the state's name, centred, and the states are laid out
  in the order a successful run visits them, top to bottom, with the terminal states
  (`Succeeded`, `Failed`) at the bottom. States are named for what the resource waits
  for, so a state's box reads as the to-do of the actor whose colour leaves it.
- The start pseudo-state (the filled circle) sits above the first state, and the end
  pseudo-state (the double circle) below the terminal states, both from the palette card.
- A transition is one edge from the state it leaves to the state it enters, in the colour
  of the actor that makes it, labelled `**<method>:** <what it stores or publishes>`. A
  method that is legal from several states draws one edge per leaving state, each with
  the same label.
- A failure transition names the `MIDNIGHT_TRANSACTION_FAILURES` member it records in its
  body (`Records the Rejected failure`), bold, since the member greps.
- The fields each state holds (the `assertConsistent` table) are a bullet list inside the
  state's box, never a floating note.

## Action flows

- One diagram per action. The service providers the action passes through are laid out
  left to right in call order, starting with the provider the server action reaches.
- A service provider is its provider container copied from the diagram library (below),
  whose format the palette card shows: the draw.io UML class construction, a stack-layout
  container whose rows each carry a port at their left and right midpoints. A provider
  carries a row for each method of its interface the action calls, in the interface's
  source order.
- An entity (a resource the action reads or writes, or an event it publishes) is an
  entity container copied whole from the diagram library, with a row per field.
- A call is one edge from the calling method's row to the called method's row, attached
  at the rows' side midpoints, so the edge names exactly which method calls which. It
  carries the colour of the stage in which the call first happens (the stage table
  below): a later stage that repeats the call reuses that edge.
- A store or broker the action reaches (Postgres, Kafka, the proof server, the indexer,
  the node) is an actor box carrying its icon from the icon table, and the edge to it
  leaves the method row that reaches it. The node carries the Midnight logo, the icon of
  the Midnight chain itself. Where one box would force two calls of the same stage to
  cross, the store is drawn once per group of callers: the deposit flow has a Postgres box
  beside each repository and two Indexer bars, one under the vault ledger and one under
  the other ports. A bar is entered from its top or bottom side.
- Container text uses the default font at normal weight with no icon: bold and icons
  stay with the edge labels and actor boxes.

### Flow stages

An action flow that spans several user actions and the event-driven work between them is
coloured by stage: every edge of a stage carries that stage's colour, one numbered circle
in that colour sits at the stage's most salient edge, edges of different stages may cross
with a jump, and edges of one stage never cross each other. Where two calls of one stage
leave the same provider or land on the same provider, they may meet at a junction of one
bus. The deposit flow ([deposit.drawio.png](ethereum-erc20-vault/deposit/deposit.drawio.png))
introduces the stages, and the palette card carries their swatches:

| Stage | Colour    | Meaning                                                                                                   |
| ----- | --------- | --------------------------------------------------------------------------------------------------------- |
| 1     | `#E68310` | the user calls `startDeposit`, which creates the deposit and its start transaction                        |
| 2     | `#11A579` | the outbox relays the lifecycle events to Kafka, the consumer hub dispatches them, the transaction proves |
| 3     | `#D62728` | the user polls the transaction, balances it in the wallet and calls `submitTransaction`                   |
| 4     | `#00A2B8` | the resolver submits the transaction to the node and watches the indexer for its inclusion                |
| 5     | `#8C564B` | the vault request is flushed, sent, signed by the MPC, broadcast on Ethereum and attested                 |
| 6     | `#B8A000` | the user calls `completeDeposit`, and the completion transaction runs to `Completed`                      |

### Provider and entity formats

- A provider's header band is 65 units tall. Its first line is the implementation class
  name, then the interface as `<package.path.InterfaceName>`, broken after a dot so a
  long path wraps (`<midnight.transaction-v1.` over `TransactionService>`).
- The package path is the interface's folder under `src/lib`, with `src/lib/` dropped
  and the slashes replaced by dots: `src/lib/midnight/transaction-v1/transaction-service.ts`
  gives `midnight.transaction-v1`.
- A method row spreads the signature over lines: `methodName(`, then one line per
  parameter, indented and spelled exactly as the code spells it (`caller: Caller,` then
  `args: SubmitTransactionArgs`), then the closing line `) (ReturnType)`. The return type
  is the resolved type with its `Promise<...>` wrapper dropped:
  `Promise<MidnightTransaction | undefined>` reads `(MidnightTransaction | undefined)`.
- A provider's property rows come before its method rows, each kind in source order. A
  property row is 30 units tall and reads `name: type`, the type spelled as the code
  spells it, and an optional member carries its `?` (`dustAddress?: string`, and on a
  method row `registerNightForDust?() (bigint)`).
- A standalone provider's header band is 26 units tall and holds its class name alone.
- An entity's header band is 40 units tall: the package path with its trailing dot
  (`event.outbox-entry-v1.`) over the type name (`OutboxEntry`).
- An entity row is 30 units tall and reads `field: type`, the fields taken from the
  resource's zod schema in source order and each type spelled as the schema's
  TypeScript type reads (`string`, `boolean`, `Date`, `Uint8Array`, a union of literals,
  an enum name, an array).
- Row values are plain text, broken with `<br>` and indented with `&nbsp;` only.
- A container is as wide as its longest line plus the row padding, and it hugs its
  rows. Every line fits without wrapping, judged on the render: lint sees no wrap at a
  space, and a row too narrow pushes its last line out of sight.

### The diagram library

The diagram library is one pair per package under `src/lib` that declares a provider
class or an entity, filed in
[diagram-library/](diagram-library) at the package's path: the providers and entities of
`src/lib/midnight/transaction-v1` are in
[diagram-library/midnight/transaction-v1/diagram-library.drawio](diagram-library/midnight/transaction-v1/diagram-library.drawio).
Each file holds a provider container for every service provider a composition root builds
whose class the package declares, whichever package declares its interface, and an entity
container for every resource a repository stores whose schema the package declares, plus
the `Event` schema in `event`.
There are two composition roots: `createBackend()` in `src/server/backend.ts` for the server,
and every `.ts` and `.tsx` file under `src/components` for the browser (`SeedWallet`,
`TokenInfoRegistry`). Each root is walked through the calls it makes into functions declared
in its own files or under `src/lib`, a module reached through `await import(...)` included, so
`DepositCallBuilder`, `WithdrawCallBuilder`, `SupplyCallBuilder` and `RedeemCallBuilder` are built by both. The generator records which roots build each provider
and prints it on the provider's log line, and the drawing does not show it.
A provider implementing an interface has a property row for each property of that interface
and a method row for each method, inherited members included. An adaptor or a standalone class
has a row for each of its own public instance properties (fields, getters and constructor
parameter properties) and public methods.
A service adaptor (a class in a `-adaptor.ts` file that a root builds) is drawn too, with a
header naming the class over the word `adapts` and the service interface its constructor takes
first, as
`DepositServiceAdaptor adapts <midnight.ethereum-erc20-vault.deposit-v1.DepositService>`, and its
id is `provider-` and its class name in kebab case (`provider-deposit-service-adaptor`).
Any other class a root builds that implements no interface under `src/lib` is drawn
standalone, under a header holding its class name alone, and an id formed as an adaptor's is
(`provider-unit-of-work`).
`scripts/diagram-library.ts` generates them from the code through the TypeScript checker, so
they are never edited by hand:

- Regenerate them with `yarn diagram-library` whenever `src` changes an interface, a provider
  a composition root builds or a resource schema. It writes every file, renders the PNG of each file
  whose pair `drawio-cli check-pair` finds stale, and deletes every pair under
  `docs/diagram-library/` that the code does not generate.
- `yarn diagram-library:check`, part of `yarn check`, fails and names the file and each
  differing cell when a committed file does not match the code, when a file is missing,
  and when `docs/diagram-library/` holds a file the code does not generate.
- An action flow copies its providers and entities from the library with value and style
  byte-identical, keeping only the method rows the action calls. Every id but the title's is
  unique across the whole library, so the proof is `drawio-cli diff-cells <library file> <flow>.drawio` for
  each package the flow draws from, for example
  `drawio-cli diff-cells docs/diagram-library/midnight/ethereum-erc20-vault/deposit-v1/diagram-library.drawio docs/ethereum-erc20-vault/deposit/deposit-v2.drawio`:
  every shared id must match, so the output holds no `differs` line. Its `only in A` and
  `only in B` lines list the cells the flow leaves out and adds, and make it exit 1.
- A class a root builds counts as implementing an interface under `src/lib` when it or
  any base class it extends implements one, so `MidnightTransactionEventConsumer` gets its
  `EventConsumer` container from `LifecycleEventConsumer`. A base class no root
  builds gets no container of its own, and an alias the class implements
  (`DepositRepository`) stands for the generic interface its base class implements
  (`Repository`). A class declared outside `src/lib` (`JsonRpcProvider`, `NodeZkConfigProvider`)
  and a class a root builds through a factory method with no `new` expression
  (`MemoryPrivateStateProvider.holding()`) have no container. When several
  classes implement one interface, each container id carries a qualifier taken from its
  class name less the interface name and `Impl` (`provider-event-publisher-kafka`,
  `provider-event-consumer-midnight-transaction`).

## Iconography

Icons are a semantic layer: one concept, one icon, wherever that concept appears, and
this table is the whole mapping.

### The icon table

| Concept        | Icon                                              | Meaning                                                                 |
| -------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Midnight lane  | Midnight logo, `diagram-assets/midnight-logo.png` | the `midnight` package's lane, and the Midnight chain itself            |
| Relayer wallet | `diagram-assets/wallet.png`                       | the backend's own Midnight wallet, whose keys sign relayer transactions |
| Postgres       | `img/lib/mscae/Database_General.svg`              | the database every repository and the outbox write to                   |
| Kafka          | `img/lib/mscae/StorageQueue.svg`                  | the broker the outbox relays events onto and consumers read from        |
| Proof server   | `img/lib/mscae/Server.svg`                        | the prover the transaction ledger sends unproven transactions to        |
| Indexer        | `img/lib/mscae/SQL_Database_generic.svg`          | the Midnight indexer, read for inclusion and ledger state               |
| Browser        | `img/lib/azure2/general/Browser.svg`              | the Next.js client, reaching the backend through server actions         |

A new icon lands as one row here plus one entry in the palette card's Iconography section,
and both land in the same change.

### The icon bank

[diagram-assets/](diagram-assets/) holds the custom icons, pre-sized for embedding. The two
PNG files are copies of the midnight-examples repository's icon bank, and the generic icons
are draw.io built-in library references. When an icon changes, update the bank file, the
palette card, and every diagram embedding it in the same change.

## Curated layouts

A diagram that carries the curation marker follows the style guide's curated-layout
mandate: change only the cells the task names and prove it with `guard-diff`.
