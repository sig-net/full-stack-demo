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

Colours mean who performs a transition. Every transition edge carries the colour of the
actor whose code calls the state controller method, and nothing else is coloured:
structure stays neutral, default black strokes on a white background, lanes and shapes
unfilled.

| Actor    | Colour    | Performs                                                                 |
| -------- | --------- | ------------------------------------------------------------------------ |
| caller   | `#E73F74` | a transition a caller's request drives, through an adaptor and a service |
| resolver | `#3969AC` | a transition the state resolver makes after a slow external call         |
| expiry   | `#7F3C8D` | the transition the expiry sweep makes when `expireTime` passes           |

Coloured transition edges turn their corners as arcs, and the neutral call edges of an
action flow keep sharp corners, both carried by the palette's swatches.

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
- A call is one neutral edge from the calling method's row to the called method's row,
  attached at the rows' side midpoints, so the edge names exactly which method calls
  which.
- A store or broker the action reaches (Postgres, Kafka, the proof server, the indexer)
  is an actor box carrying its icon from the icon table, and the edge to it leaves the
  method row that reaches it.
- Container text uses the default font at normal weight with no icon: bold and icons
  stay with the edge labels and actor boxes.

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

[diagram-library.drawio](diagram-library.drawio) holds one provider container for every
service provider `createBackend()` builds and one entity container for every resource a
repository stores, plus the `Event` schema. `scripts/diagram-library.ts` generates it from the
code through the TypeScript checker, so it is never edited by hand:

- Regenerate it with `yarn diagram-library` and re-render its PNG whenever `src` changes an
  interface, a provider the backend builds or a resource schema.
- `yarn diagram-library:check`, part of `yarn check`, fails and names each differing cell when
  the committed file no longer matches the code.
- An action flow copies its providers and entities from the library with value and style
  byte-identical, keeping only the method rows the action calls. The proof is
  `drawio-cli diff-cells docs/diagram-library.drawio <flow>.drawio`: every shared id must
  match.
- A class the backend builds that implements no interface under `src/lib` (the service
  adaptors, `UnitOfWork`, library classes) has no container. When several classes implement
  one interface, each container id carries a qualifier taken from its class name
  (`provider-event-publisher-kafka`, `provider-event-publisher-outbox`).

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
