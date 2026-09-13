# Styling migration verification

Status: complete on 2026-09-13. Implementation, parent review, maintained checks, real browser acceptance and prepared-account restoration pass.

## Fresh census and migration map

The initial source search enumerated 49 app/component files, with presentation matches in 41. The final architecture check additionally includes hooks, providers and other source files to detect style imports or toast bypasses outside component folders. All visual consumers run in browser React and Next.js rendering on local and configured deployments.

| Consumers                                                  | Initial contracts found                                                         | Central owners after migration                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Root layout and page, not-found                            | Palette background, font setup, direct Sonner, page spacing                     | Semantic root CSS, local Toaster, presentation typography/density, page structural composition |
| Navigation header, wallet-mark, midnight-logo, crypto-icon | Palette and radius utilities, external artwork and overlapping marks            | Shared presentation roles, artwork exceptions, explicit header geometry                        |
| Wallet menu, EVM and Midnight controls                     | Shared dropdown plus feature button, status and spacing recipes                 | Current DropdownMenu, Button, StatusDot, Feedback and shared menu sections                     |
| Vault identity, seed wallet dialogs                        | Mixed button/menu appearance, local form spacing, raw labels                    | Menu visual delegation, Dialog, Label, Input and shared form/action density                    |
| Configuration menu                                         | Direct Radix tooltip, native select, label/input overrides, local warning panel | Tooltip, NativeSelect, Label, Input, Feedback and bounded wide Popover                         |
| Deposit selector, network accordion, token selection       | Native button recipes, palette, borders and typography                          | Shared Button row variant, central text/surface/density                                        |
| Deposit address, transfer and recovery                     | Native help button, QR geometry, link colours, inline feedback                  | Button, Popover, Input, base link policy, Feedback and QR exception                            |
| Withdrawal dialog and amount form                          | Input density, raw label, local error state and cursor conditions               | Dialog, Input, Label, shared Feedback and Button disabled policy                               |
| Swap and lending                                           | Distinct surface recipes, native lending inputs, local type/palette             | Current Card/CardContent, Input, Button and shared typography/density                          |
| Token amount display                                       | Raw input/buttons, feature dropdown overrides, disabled input gap               | Shared Input/Button/DropdownMenu, native disabled semantics, exact amount string retained      |
| Balance section/display and balance box                    | Repeated headings/dividers, palette and density                                 | Shared semantic section, type, divider and spacing recipes                                     |
| Activity table/details                                     | Feature status badges, row cursor, palette, error feedback                      | Current Table with central keyboard/cursor policy, Badge, StatusDot, Feedback and Dialog       |
| Empty wallet/state, loading state, error boundary          | Local text/icon/surface styling, missing render fallback                        | Shared presentation roles and loading recipe, Feedback/Button render fallback                  |
| Progress toasts, truncated text, QR                        | Direct toast API, clickable span, dynamic encoded image                         | Themed Toaster, keyboard-accessible Button for copying, exact QR geometry exception            |

The six shadcn-derived primitives and six additions are accounted for individually in the tracked upstream provenance. Four bespoke composites retain their contracts. No independent generic presentation implementation was found by the initial imports/source search. Existing `cn`, Radix and CVA contracts supply the shared implementation.

## Executed static and functional checks

- `node scripts/design-system/check.mjs` passed across 122 source files and 280 presentation expressions.
- `node scripts/design-system/self-test.mjs` observed failures for palette, state-prefixed palette, arbitrary CSS property, raw control, inline style, unknown recipe, primitive appearance override, aliased primitive, direct Radix, direct Toaster, aliased Toaster and feature CSS. Every planted file change was restored, then the source guard passed.
- `yarn lint && yarn typecheck` passed with 41 existing warnings, zero lint errors and zero type errors.
- Task16 fixtures passed shared seed clearing/focus callbacks, image fallback, wallet action delegation and configuration feedback.
- Task06 fixtures passed memory/clipboard ownership, actual derivation and identity persistence guards.
- Task01 fixtures passed connected root rendering, history/details refresh, exact balances, deposit continuation and withdrawal submission. The Activity row fixture selects the actual TableRow component contract after cursor ownership moved into the primitive.
- Task08 and task13 fixtures passed wallet lifecycle, exact transfer/fee/amount policy, delayed receipt ownership, local funding and separate balance/deposit owners.
- Task14 and task15 fixtures passed both wallet kinds, connector capability/error/stale-result boundaries, typed loading, runtime invalidation and all three funding-route compatibility boundaries.
- `git diff --check` passed.

No production build, funded operation, deployment reset, new acceptance identity, global install, commit or push was performed. CLAUDE.md was already modified at entry and is preserved.

- `node scripts/design-system/table.mjs` reproduced a nested-link keyboard interception, then passed after TableRow limited Enter/Space activation to its own focused element. The updated task01 fixture also passed.

## Browser evidence

The maintained browser harness passed 37 observations through the prepared owner relay. All eight semantic text contrast pairs measured at least 5.21:1. Default, outline, ghost, destructive and secondary variants had visible hover changes, pointer cursors and actual keyboard focus-visible styling. Disabled button and menu activation stayed unchanged. The real compiled theme failed planted missing-accent and menu-pointer violations, then passed after restoration. Menu composition, checked state, delayed focus return, tooltip and toast portals, exact maximum amount precision, read-only/disabled distinctions and a shared theme change across two independent consumers passed.

Real 375px measurements placed Configuration at x132 with width32, Midnight at x168 with width105 and EVM at x278 with width80. All fit. The 343px configuration panel remained scrollable. Invalid Apply and Discard, seed Escape clearing/focus and identity Enter/Escape focus passed. The executing agent inspected the narrow configuration and header screenshots.

The first real browser pass reproduced two migration defects: disabled Button retained a pointer because its utility outranked base CSS, and a full-width wallet trigger plus oversized header gap overflowed the header. Both were corrected centrally and the subsequent harness and narrow bounds passed. The parent restored the prepared Midnight seed, independent vault identity and MetaMask wallet. Both chains reported ready and the shielded balance remained 0.1 USDC. Ethereum/USDC deposit selection showed 15.09 USDC and the expected derived address. An empty amount disabled submission, and 0.01 enabled it after React rendered. No send occurred. The completed 0.1 USDC Activity row opened its details through keyboard Enter. Swap input was editable, quoted output read-only, and both lending inputs retained text cursors. Connected 375px document scrollWidth was 360px with every header action inside the viewport. The final browser viewport was restored to 1728 by 947. The maintained browser harness uses actual components and compiled CSS, with computed interaction states and controlled fixtures clearly separate from real wallet/product checks. The parent cannot dynamically import modules inside the Playwright MCP run-code VM, so it reads the maintained source, wraps the exported function in the run-code callback and invokes it with the provided page.

Initial harness execution exposed a verifier parsing assumption: compiled CSS serialised one colour as the named colour `snow`. The harness converts browser-computed RGB channels before calculating contrast. This was a fixture correction, not a theme compatibility exception.

A controlled probe of the actual ErrorBoundary fallback branch rendered an alert and reload control using explicit primitive doubles. This is component fixture evidence, separate from the real browser checks.

The final root probe found all 25 semantic roles non-empty, including foreground pairs, link and overlay. Normal Playwright capture changed a real hovered menu's highlight/focus state. Direct CDP Page.captureScreenshot preserved both the green highlight and actual hover afterwards. The executing agent inspected `02-identity-hover.png` and confirmed the visible shared identity highlight.

## Final captures and reconciliation

The executing agent and parent inspected the accepted captures under `scratch-refactor-tasks/verification/screenshots/task17/`:

| Capture                 | Verified state                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `02-identity-hover.png` | Actual green identity menu highlight preserved by direct CDP capture                                                |
| `03-config-narrow.png`  | Legible, scrollable configuration at 375px                                                                          |
| `04-header-narrow.png`  | All chain labels and controls visible at 375px                                                                      |
| `05-deposit.png`        | Correct token balance, enabled 0.01 input, native focus ring, pending recovery and QR/address in a scrolling dialog |
| `06-connected.png`      | Restored ready wallets, unchanged 0.1 shielded USDC, completed Activity, shared swap and lending surfaces           |

The initial `01-disconnected.png` is an investigation capture. Final header acceptance uses `04-header-narrow.png` and the final connected bounds.

Every census group is reconciled with a central owner. All twelve current registry sources and the exact supporting dependency exception are recorded. Feature styling guards, planted failures, amount/keyboard contracts and functional-owner regressions pass. The parent independently reran architecture self-tests, the table keyboard check, lint and typecheck. No required work remains. The separate pre-existing CLAUDE.md change and concurrent external AGENTS.md rewrite are preserved and are not owned by this implementation.
