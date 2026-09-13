# Browser wallet verification

## Provisioning and transport

The root development dependency pins @playwright/mcp 0.0.80 and its Playwright version through
Yarn. Install with the README's project-local immutable dependency command. Use the existing
installed Chrome and prepared disposable MetaMask profile. Do not run a global browser installer.

Configure the Playwright MCP command as the absolute path to the tested Node executable, with
arguments containing the absolute UI path to `scripts/local-vault/playwright-launcher.cjs`, then
`--user-data-dir` and the explicitly selected prepared profile path. Find that profile from the
current session or observed Chrome process arguments. Do not guess a cache suffix or print all
process environments. Preserve other MCP settings. Updating configuration requires the user's
scope to include that change.

After restarting the connection, verify the active process arguments and MCP stderr marker:
`local-vault: Chromium Network.enable post-data cap applied`. A successful tab list alone does
not prove the patched launcher was loaded. Codex can retain the existing MCP until its connection
is restarted. If no restart tool is available, ask the user to toggle Playwright off and on.
Computer-use control of Codex itself may be blocked. Do not route around that restriction.

The launcher changes the tested Chromium Network.enable call in memory to cap captured POST data
at one byte. Version/source guards fail closed. Public 117 MB proving-key uploads otherwise
produce a CDP message larger than Node's string limit. Shorter tool calls and a separate CDP
session's cap did not solve that failure. The cap preserves HTTP uploads and network metadata,
but request-body inspection is unavailable. Do not enable interception or dump giant protocol
messages to recover those bodies. Revalidate any future tool upgrade before wallet operations.

## Browser procedure

Before a relayed smoke check, agree a stable application-file window with the implementing agent.
Wait for their acknowledgement that writes and formatting have stopped before restoring credentials.
They can continue fixture and documentation work while the browser owner checks the UI. Resume
application edits after the browser owner releases the window. HMR can
clear connections or close a dialog between steps. If that happens, inspect the current page and
coordinate before retrying, then restore the existing disposable identity privately if needed.

Discover callable Playwright tool schemas from the current environment. List tabs, select by
observed URL, and capture a fresh snapshot. Use observed role/name locators. Scope repeated
connection buttons to the banner or active dialog. A click can return before React completes its
state transition: wait for the expected control rather than interpreting an immediate false
visibility result as failure.

For wallet-menu presentation changes, traverse every actionable item with the keyboard, including
identity and balance actions embedded in menu content. Ordinary buttons inside a Radix menu were
skipped by arrow navigation during task16. After a menu opens a dialog, wait for its close animation
to finish before checking focus return and reopen it to verify seed clearing. Inspect a narrow
viewport visually as well as by bounds: two identical wallet icons with hidden chain labels fitted
at 375 pixels but did not distinguish the chains. Save screenshots under the ignored verification
directory explicitly, as relative screenshot names can land in the repository root.

For styling acceptance, use the actual components with the compiled application theme. Compare
computed cursor, background and focus treatment before and after hover or keyboard highlighting,
and capture the active state. A successful click, a highlighted DOM attribute or a static image
does not establish a visible interaction state: the wallet menu highlighted while its missing
accent token left its background unchanged. Include composed menu/button elements because their
merged recipes can change the cursor and override the highlight. Primitive doubles cannot verify
the CSS cascade. Keep these checks scoped to styling changes.

If screenshot capture clears a measured hover or focus state, compare computed state immediately
before and after capture. In the prepared Chromium session, both the screenshot tool and
`page.screenshot()` cleared menu hover, including within one run-code call. Direct CDP capture
preserved the measured highlight. Use this fallback only after observing that capture issue:

```javascript
const session = await page.context().newCDPSession(page);
const shot = await session.send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: false,
});
await session.detach();
```

Transfer `shot.data` privately to an ignored PNG and recheck the element state after capture.
Do not print the base64 payload. Capture only after credential fields close or clear.

For a browser smoke check, reuse the available authorised wallet and identity where possible.
Inspect connection, balance, readiness and the affected controls. Fund, create a fresh identity or
submit a transaction only when the task's acceptance explicitly includes that operation. A visible
funding button can be smoke evidence without clicking it.

For adapter checks, inspect injection on the app's actual origin and record the observed wallet
keys and public metadata. An absent `window.midnight` proves that this page exposes no Midnight
connector, not that Lace is absent from the whole laptop. Keep controlled connector fixtures
separate from real extension observations. A public derivation vector can check seed connection,
address and form clearing without funding it. Restore the prepared account after replacement.

Choose signing interactions from the connected adapter kind. EVM seed wallets sign in the app,
so they do not require a MetaMask approval step. The extension procedure below applies to browser
wallets. Connecting either kind does not add a transfer to a smoke test's acceptance scope.

When full deposit or low-funds acceptance is in scope, open the local app and connect the EVM
wallet through its chooser. Verify local fork identity. Restore the Midnight seed and independent
vault secret through the product controls. For the low-funds scenario, a new wallet should
synchronise with zero funds, render the app and offer local funding. Click funding once and wait
for spendable DUST/readiness. Do not infer readiness from NIGHT alone.

Keep the app page alive when MetaMask needs approval. Extension sidepanels may be absent from
both normal tab enumeration and `page.context().pages()`. The following bounded lookup was used
successfully inside a Playwright run-code call:

```javascript
const session = await page.context().newCDPSession(page);
const targets = await session.send('Target.getTargets');
await session.detach();
return targets.targetInfos
  .filter(t => t.type === 'page' && t.url.includes('/sidepanel.html'))
  .map(t => ({ url: t.url }));
```

Filter further to the observed MetaMask extension ID. Open the exact returned confirmation URL
as a tab, inspect amount, token, destination, origin and local network, then use the real approval
control (the prepared wallet used Dutch `Bevestigen`). Never invent a request ID, inject a signer
or change extension storage to manufacture approval. If locked, ask the user to unlock in the
browser without sending the password. Keep any required transaction authorisation boundary.

For a deposit, select the token, enter the exact amount, approve the EVM transfer, capture its
confirmed hash and click the explicit Midnight continuation once. Observe stage changes without
reloading during proving. A small deposit is still a real sequence of transactions.

## Credentials and captures

Do not print credentials in shell results, code echoes, snapshots or logs. In a functions-style
orchestrator, a private credential read can be parsed into its store without calling text on the
result. Likewise, forward a browser fill result as a success boolean rather than emitting the
MCP response, which can echo the code and secret argument. Capture snapshots only after secret
fields close or clear. Other runtimes need an equivalent private transfer mechanism.

Store only disposable credentials required for the requested test, in ignored mode-0600 files.
Their paths may enter the session record, their values may not. A new page, MCP restart or HMR
can erase browser memory. Automatically generated `.playwright-mcp` captures remain private.
