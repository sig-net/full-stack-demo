# Design system

The application preserves its light deployment branding through one semantic theme. Edit `src/app/globals.css` to change colours, typography families, radii and the shared density scales. `components.json` selects Radix Nova with the existing Next.js settings. Light is the supported mode, including native controls and toast portals.

## Ownership

| Concern                                       | Owner                                         | Consumers                                                                        |
| --------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| Theme roles and accessible interaction policy | `src/app/globals.css`                         | Every page, control, portal and toast                                            |
| Primitive source and bounded variants         | `src/components/ui/`                          | Wallet, identity, configuration, deposit, withdrawal, swap, lending and Activity |
| Typography and layout recipes                 | `src/components/ui/presentation.css`          | Feature text, rows, stacks, sections and density                                 |
| Feedback and status indicators                | `src/components/ui/feedback.tsx`, `badge.tsx` | Wallet connection, configuration, funding, operation errors and Activity         |
| Surface composition                           | `card.tsx`, `dialog.tsx`, `popover.tsx`       | Swap/lending panels, operation and identity dialogs, configuration and help      |
| Exact token amount handling                   | `token-amount-display.tsx`                    | Withdrawal and both swap amounts                                                 |
| Generated QR and artwork                      | Exact exception register                      | Deposit QR, token/network marks, provider images and deployment logo             |

All presentation consumers run in browser React and Next.js rendering, on local and configured deployments. The Node funding routes have no presentation consumer. Wallet, configuration, balances, identity and operation hooks retain their existing functional owners.

Use shared controls for every button, input, select, label, menu and tooltip. Features select supported variants and provide labels, values and callbacks. They must not supply palette, typography, radius, border, shadow, cursor, state or control-density utilities through `className`. This rule also covers component aliases and state-prefixed or arbitrary CSS properties.

Feature composition uses named recipes such as `ds-row`, `ds-stack-control`, `ds-stack-content`, `ds-menu-section`, `ds-section-header`, `ds-caption`, `ds-value` and semantic feedback tones. Control, content and section density resolve through three shared spacing properties. Responsive structure may choose column order, visibility, width bounds, alignment and text truncation. Repeated padding, margins and gaps use the shared density recipes. Add a composite when a second real consumer needs the same arrangement. Do not create a feature-specific stylesheet or a recipe named after a single feature.

The [exception register](design-system-exceptions.json) gives exact source locations and reasons. It permits QR encoding geometry and external artwork, plus the page, header and table's unique spatial arrangements. It does not exempt ordinary controls or permit feature colour recipes.

## Interactions

Enabled buttons, links and menu actions use a pointer. Inputs use a text cursor. Native disabled controls and Radix disabled items retain their activation constraints and visually reduced states. Focus uses the semantic ring. Button variants own default, hover, expanded, active, invalid and disabled treatment. Reduced motion follows the user's system preference.

A menu action composed with `DropdownMenuItem asChild` uses `Button variant='menu'`. The menu owns that element's appearance, highlight and focus. This variant requires the enclosing menu item and is not a standalone button style. Standalone identity uses the outline variant. Menu item actions participate in Radix keyboard navigation. Dialog and menu owners retain focus return and secret-clearing behaviour.

Use `Feedback` for inline errors, warnings and operation feedback. `StatusDot` accompanies textual status, and Activity uses semantic Badge variants. The root imports the themed local `Toaster`. Features can call Sonner's toast functions, while the local component and semantic CSS own toast rendering.

`TokenAmountDisplay` uses the shared Input and Button. Read-only computed amounts preserve token selection while hiding the maximum shortcut. Disabled amounts use native disabled inputs and disabled token selection. Maximum values keep their exact decimal string.

## Upstream sources

[Provenance](design-system-upstream.json) records retrieval date, registry URLs, source and response SHA256 hashes, resolved dependency versions, local adaptations and the demonstrated dependency compatibility exception. The six existing shadcn primitives were reconciled with the current official Radix Nova sources. Tooltip, label, native select, badge, card and Sonner were added for actual consumers. The four bespoke composites retain their application contracts.

The project pins shadcn as a development tool. Its shared CSS is imported during application compilation, so the build environment must install development dependencies before compiling. The README's full dependency installation does this. Keep Next.js, wallet and ledger dependency policies separate from UI source updates.

The installed CLI's preview was executed with:

```bash
yarn shadcn add button --dry-run
```

The preview resolves the current registry and reports proposed files/dependencies. Inspect the current official source and dependency changes before replacing a copied component. Preserve the recorded central application policy adaptations and run the verification below after upgrading. A CLI package update alone does not update component source.

## Verification

Run the maintained architecture check:

```bash
node scripts/design-system/check.mjs
```

It enumerates the actual source set and rejects ordinary feature styling, raw controls, direct Radix assembly, unthemed Toaster imports, feature CSS and unknown recipes. The check asserts a non-empty consumer set. Its planted-regression self-test temporarily changes a feature source and restores it, so run it only while browser work is paused:

```bash
node scripts/design-system/self-test.mjs
```

The focused table keyboard regression exercises the actual TableRow source and class helper:

```bash
node scripts/design-system/table.mjs
```

Run the repository checks:

```bash
yarn lint && yarn typecheck
```

The development-only `/dev/component-states` surface renders the real primitives with the compiled application theme and explicit fixture values. It is absent from product navigation. `scripts/design-system/browser.mjs` exports `verifyDesignSystem(page)` for the existing Playwright browser owner. It checks computed theme roles, contrast, pointer and hover states, keyboard focus, menu composition, disabled activation, portal rendering, exact maximum precision and a shared theme change across two independent consumers. It plants missing-accent and menu-pointer failures and restores them. The browser owner then checks real product menus and forms at desktop and 375px, preserving prepared accounts and submitted operation evidence.

The prepared Chrome capture path can change the active hover/focus state while taking a normal Playwright screenshot. Inspect computed highlight and hover before and after capture. Direct CDP `Page.captureScreenshot` preserved the measured state in this session. Use that conditional fallback only when the ordinary capture disturbs the state, and record the method with the evidence.
