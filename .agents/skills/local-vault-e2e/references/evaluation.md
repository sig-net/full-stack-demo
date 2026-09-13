# Forward testing

Give an independent fresh-context agent the skill path, the realistic user request and only the
raw session inputs it needs. Keep the parent as observer and browser relay if the prepared
profile is already owned. Do not provide the desired conclusions or pre-empt every decision.

## First evaluation: kept-stack readiness

Ask the agent to determine whether the current local deployment and browser are ready for a
small deposit, without changing chain state, submitting transactions or resetting services.
It should locate maintained inputs, verify the launcher and service identity, handle profile
ownership, identify the next UI action, and produce a concise evidence record. Observe unnecessary
reading, missing inputs, unsafe output and scope expansion. Correct the skill only for observed gaps.

## Full workflow evaluation

Once a deposit test is authorised, ask a fresh agent to complete one small kept-stack deposit,
verify settlement, fees, Activity and refresh/re-entry. Reuse the current deployment. A clean
reset is only a test when specifically requested, not an automatic prelude.

## Task 13 as a regression test

The EVM wallet separation task is a good second evaluation. It changes the connection, balance,
funding and deposit owners while requiring a browser smoke check. Its acceptance excludes a new
funded deposit, reset, SDK upgrade and transport investigation. The skill should adapt to those
boundaries and help verify the affected controls without silently adding full E2E work. It does
not replace task13's code census, interface design or focused lifecycle/receipt tests.

## Swap as a later test

A swap tests transfer of the diagnostic method to an operation without prior live acceptance.
It also introduces quote, liquidity, slippage and refund behaviour. A failure could be in the app,
stack or protocol rather than the skill. Use it after the known deposit workflow passes, with a
small explicit amount and a distinct swap acceptance record. Do not execute a swap merely to
validate this skill's packaging.
