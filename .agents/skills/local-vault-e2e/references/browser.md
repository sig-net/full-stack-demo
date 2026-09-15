# Browser wallet verification

## Provisioning and transport

The root development dependency pins @playwright/mcp 0.0.80 and its Playwright version through
Yarn. Install with the README's project-local immutable dependency command. Use the existing
installed Chrome and prepared test profile. Select seed or extension wallets according to the task.
Seed-wallet acceptance does not require installing or unlocking MetaMask.
Do not run a global browser installer.

Configure the Playwright MCP entry in the executing agent's own MCP configuration. Its command
is the absolute path to the tested Node executable, with arguments containing the absolute UI
path to `scripts/local-vault/playwright-launcher.mjs`, then `--user-data-dir` and the explicitly
selected prepared profile path. The launcher and profile paths are machine-specific, so the entry
belongs in user-level rather than repository configuration. Find that profile from the current
session or observed Chrome process arguments. Do not guess a cache suffix or print all process
environments. Preserve other MCP settings. Updating configuration requires the user's scope to
include that change.

After restarting the connection, verify the active process arguments and MCP stderr marker:
`local-vault: Chromium Network.enable post-data cap applied`. A successful tab list alone does
not prove the patched launcher was loaded. The agent retains the existing MCP process until its
connection is restarted. If the current session exposes no restart control, ask the user to
reconnect or toggle the Playwright server through the agent's own MCP controls. Computer-use
control of the agent's own application may be blocked. Do not route around that restriction.

The launcher changes the tested Chromium Network.enable call in memory to cap captured POST data
at one byte. Version/source guards fail closed. Public 117 MB proving-key uploads otherwise
produce a CDP message larger than Node's string limit. Shorter tool calls and a separate CDP
session's cap did not solve that failure. The cap preserves HTTP uploads and network metadata,
but request-body inspection is unavailable. Do not enable interception or dump giant protocol
messages to recover those bodies. Revalidate any future tool upgrade before wallet operations.

## Browser procedure

Before a relayed browser check or deposit, agree a stable application-file window with the
implementing agent. HMR is not reliable in either direction: on some edits it clears in-memory
credentials and the applied configuration, including for a comment-only tidy-up, and on others
the open tab keeps its previous build until an explicit reload. Finish every edit before
restoring, then reload and verify which build the page is running before a funded run or any
observation you intend to record.
Wait for their acknowledgement that writes and formatting have stopped before restoring credentials.
They can continue fixture and documentation work while the browser owner checks the UI. Resume
application edits after the browser owner releases the window. HMR can
clear connections or close a dialog between steps. If that happens, inspect the current page and
coordinate before retrying, then restore the existing disposable identity privately if needed.

Discover callable Playwright tool schemas from the current environment. List tabs, select by
observed URL, and capture a fresh snapshot. Use observed role/name locators. Scope repeated
connection buttons to the banner or active dialog. A click can return before React completes its
state transition: wait for the expected control rather than interpreting an immediate false
visibility result as failure. Seed installation can close its dialog before synchronisation finishes.
Close any open Radix menu or dialog before any later role query or click, not only before
checking the banner: a modal menu hides toolbar roles from every subsequent query, the
locator then waits its full timeout before failing, and an overlay can keep intercepting
pointer events after a dialog closes with nothing left in the accessibility tree. Press
Escape first. Header wallet buttons share an accessible name with a second element, so query
them exactly and scope the query. Wait for the connected control and spendable readiness before testing connected-state
transitions or submitting a deposit.

After an arrow key in a Radix menu, wait until the expected action owns focus before pressing
Enter or Space. Roving focus can advance asynchronously, so consecutive presses in one run-code
call can activate the preceding item. Wait for a nested popover to close before sending the next
Escape to its parent menu.

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
const shot = await session.send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
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

Before restoring wallets or identity, apply the intended public deployment through Configuration.
The browser starts with undeployed Midnight and local EVM defaults. Read generated public
deployment values from the local setup output using the README field mapping and select the Midnight and EVM networks before entering endpoint
overrides. A local RPC edit clears the discovered chain. Wait for discovery or enter the generated
chain ID after the RPC, then Apply. Repeat this after a page refresh before re-entering credentials. Verify restored
on-chain balances separately from Activity history.

When full deposit or low-funds acceptance is in scope, open the local app and connect the EVM
wallet through its chooser. Verify local fork identity. Restore the Midnight seed and independent
vault secret through the product controls. For the low-funds scenario, a new wallet should
synchronise with zero funds, render the app and offer local funding. Click funding once and
observe separate ETH, ERC-20 and NIGHT faucet responses. Then click Register NIGHT for DUST
through the connected user wallet and wait for spendable DUST/readiness. Funding NIGHT does not
register it. Use explicit deposit/vault ETH funding controls when needed before the operation.

Keep the app page alive when MetaMask needs approval. Extension sidepanels may be absent from
both normal tab enumeration and `page.context().pages()`. The following bounded lookup was used
successfully inside a Playwright run-code call:

```javascript
const session = await page.context().newCDPSession(page);
const targets = await session.send("Target.getTargets");
await session.detach();
return targets.targetInfos
  .filter((t) => t.type === "page" && t.url.includes("/sidepanel.html"))
  .map((t) => ({ url: t.url }));
```

Filter further to the observed MetaMask extension ID. Open the exact returned confirmation URL
as a tab, inspect amount, token, destination, origin and local network, then use the real approval
control (the prepared wallet used Dutch `Bevestigen`). Never invent a request ID, inject a signer
or change extension storage to manufacture approval. If locked, ask the user to unlock in the
browser without sending the password. Keep any required transaction authorisation boundary.

For a deposit, select the token, enter the exact amount, approve the EVM transfer, capture its
confirmed hash and click the explicit Midnight continuation once. Observe stage changes without
reloading during proving. A small deposit is still a real sequence of transactions.

## Controlled-state fixtures

When acceptance needs a wallet state that no disposable local wallet can safely reach (depleted
DUST, unregistered NIGHT, a failed balance read), build an ignored Vite fixture under
`.local-vault/taskNN-fixture` that imports the real widgets, the real gate wiring and the app's
global stylesheet, and aliases only the provider and remote-read modules to fixture exports. Alias
`next/image` to a plain image element, or the Next image runtime crashes with process is not
defined. Provider modules import each other by relative path, so aliases keyed on import specifiers
miss those edges and the Midnight runtime still loads. Redirect by resolved file path with a
resolveId plugin. Read the newest `taskNN-fixture-notes.md` in the ignored verification
directory before building one, and write your own notes there. Vite is a project devDependency, so nothing is
installed. Stop the fixture server when done and label its evidence as fixture evidence.

Restoring the applied deployment after a page load means refilling every field of the
Configuration dialog from the saved public deployment file, then Apply. The Contract address
field collides with Signet contract address under a non-exact role query, so use exact names.
The Configuration inputs carry generated ids and no accessible names, so map the saved deployment
file onto them by their labels and order. Inspect the current page state before assuming what a
previous task left: sessions have been found cleared with nothing in the record to say so.

A long run-code call, whether a clipboard read or a polling loop, can navigate the application
tab to about:blank and destroy page memory, including during a funded operation. A call that
combines a click with a wait did it twice. Issue one action per run-code call during funded
work and poll with repeated short calls. Grant clipboard-read on the app origin
through the browser context before reading the clipboard. The run-code tool's file option accepts only paths under its own allowed roots, so a restore
script kept in this repository is pasted inline. Capture screenshots with page.screenshot
inside a run-code call using an absolute path into the verification directory, which is
accepted. The separate screenshot tool saves by name outside the repository.

The token chooser's accessible name is the concatenation of symbol and name, and an exact role
query on it does not match. Filter the role query by visible text instead.

## Credentials and captures

Do not embed credentials in browser code, even if the caller suppresses the tool response: the
browser tool records and echoes its code. Do not print credentials in shell results, snapshots
or logs. The tested Playwright VM has neither `require` nor a dynamic-import callback.

For prepared local credential files, transfer the file with `setInputFiles` through a temporary
hidden file input, read the selected File into a local variable, remove the input, and fill the
product's password control. This keeps values out of tool arguments and results. For example:

```javascript
await page.evaluate(() => {
  const input = document.createElement("input");
  input.type = "file";
  input.id = "private-test-credential-transfer";
  input.hidden = true;
  document.body.append(input);
});
try {
  const transfer = page.locator("#private-test-credential-transfer");
  await transfer.setInputFiles(credentialFilePath);
  const secret = await transfer.evaluate(async (input) =>
    JSON.parse(await input.files[0].text()).VAULT_CALLER_SECRET,
  );
  await transfer.evaluate((input) => input.remove());
  await page.getByRole("textbox", { name: "Vault secret", exact: true }).fill(secret);
  await page.getByRole("button", { name: "Use vault secret", exact: true }).click();
} finally {
  await page.locator("#private-test-credential-transfer").evaluateAll((inputs) =>
    inputs.forEach((input) => input.remove()),
  );
}
```

Use the observed field and key for wallet seeds, and query the field by role with an exact
name: a label query matches both the dialog and its input. Keep `credentialFilePath` pointed
at the prepared ignored file. Return public status only. Capture snapshots and screenshots only after
credential fields close or clear. This transfer supplies product inputs, it does not inject
wallet state or a signer.

Store only disposable credentials required for the requested test, in ignored mode-0600 files.
Their paths may enter the session record, their values may not. A new page, MCP restart or HMR
can erase browser memory. Automatically generated `.playwright-mcp` captures remain private.

For request-ID copy/paste acceptance, wait until the recovery input contains the exact full ID.
Clipboard paste completes asynchronously after the button click. The copy success line clears
after two seconds, so click and read it inside one page evaluation, and any timed line near the
end of a wait can be lost to settlement between a text read and a screenshot, so capture it in
the same evaluation as the read. The console buffer keeps two hundred messages, so read it
immediately after an action that may raise an error. Starting a deposit from the
deposit-address entry point closes the dialog, so reopen it to capture the settlement-stage
request display, and capture promptly: successful completion can close the deposit dialog
before a queued copy action runs. A later successful copy proves the completed-state control, not the pending one.

Stop the identified UI process before deleting generated Next cache or route metadata. Clearing
`.next` while Turbopack is running produced missing SST files and wallet chunk-load failures.
After restarting, wait for hydration and the actual configuration dialog before editing fields.
