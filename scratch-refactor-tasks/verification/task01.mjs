import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as addressFormat from "@midnightntwrk/wallet-sdk-address-format";

import { loader as sourceLoader } from "./load-source.mjs";
import { runtimeStubs } from "./runtime-fixture.mjs";
const loader = (stubs = {}, globals) =>
  sourceLoader(
    { "@midnightntwrk/wallet-sdk-address-format": addressFormat, ...runtimeStubs(), ...stubs },
    globals,
  );
import { createRequire } from "node:module";
const root = process.cwd();
const localRequire = createRequire(path.join(root, "package.json"));
const React = localRequire("react");
const { renderToStaticMarkup } = localRequire("react-dom/server");
async function main() {
  const load = loader();
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL = "https://example.invalid";
  console.log(
    "Configuration and funding regression coverage executes in task02 and task04 fixtures.",
  );
  const history = load("@/lib/midnight/tx-history").midnightTxHistory;
  let state = [];
  let teardown;
  const hookLoad = loader({
    react: {
      useState: () => [
        state,
        (value) => {
          state = value;
        },
      ],
      useEffect: (fn) => {
        teardown ??= fn();
      },
    },
    "@/lib/midnight/tx-history": { midnightTxHistory: history },
  });
  const hook = hookLoad("@/hooks/use-midnight-transactions").useMidnightTransactions;
  hook();
  const fixture = {
    explorerUrl: "https://sepolia.etherscan.io",
    id: "fixture",
    type: "Deposit",
    fromSymbol: "WALLET",
    fromAmount: "0x123",
    toSymbol: "USDC",
    toAmount: "10 USDC",
    status: "pending",
    timestampRaw: 1700000000,
  };
  history.add(fixture);
  assert.equal(hook()[0].status, "pending");
  history.update("fixture", { status: "failed", failureReason: "Fixture proof failed" });
  assert.equal(hook()[0].failureReason, "Fixture proof failed");
  history.update("fixture", { status: "completed", txHash: "0xabc" });
  assert.equal(hook()[0].status, "completed");
  assert.match(hook()[0].explorerUrl, /0xabc$/);
  history.update("fixture", { status: "refunded", type: "Supply" });
  assert.equal(hook()[0].status, "refunded");
  assert.equal(hook()[0].type, "Supply");
  teardown();
  const snapshot = state;
  history.update("fixture", { status: "completed" });
  assert.equal(state, snapshot);
  console.log(
    "PASS live history replay, pending/completed/failed/refunded updates, operation labels, failure/hash mapping and unsubscribe",
  );

  const midnight = {
    connected: true,
    connecting: false,
    shieldedAddress: "fixture-midnight-address",
    depositAddress: "0x123",
    balances: { perToken: {} },
    disconnect: () => {},
  };
  const query = localRequire("@tanstack/react-query");
  const uiLoad = loader({
    "@/hooks/use-runtime-config-sections": { useRuntimeConfigSections: () => ({ sections: [] }) },
    "@/providers/evm-wallet-context": { useEvmWallet: () => ({ wallet: null }) },
    "@/providers/evm-deposit-context": { useEvmDeposit: () => ({ transfer: null }) },
    "@/providers/evm-balances-context": { useEvmBalances: () => ({}) },
    "@/providers/evm-local-funding-context": { useEvmLocalFunding: () => ({ funding: {} }) },
    "@/providers/wallet-readiness-context": {
      useWalletReadiness: () => ({ wallet: null, funding: {}, balances: {}, eligibility: {} }),
    },
    "@/providers/vault-context": { useVault: () => ({ binding: midnight }) },
    "@/providers/vault-balances-context": {
      useVaultBalances: () => ({ balances: midnight.balances }),
    },
    "@/providers/vault-operations-context": { useVaultOperations: () => ({}) },
    "@/providers/midnight-wallet-context": { useMidnightConnection: () => ({ wallet: midnight }) },
    "@/hooks/use-midnight-transactions": { useMidnightTransactions: () => hook() },
    "@/lib/midnight/env": { midnightEnv: () => ({}) },
    "@/lib/midnight/evm-swap": {
      pairKey: () => "",
      discoverSwappablePairs: async () => [],
      quoteBestFeeExactInput: async () => ({}),
    },
    "@/lib/midnight/evm-stata": { AAVE_USDC: "0xa", STATA_USDC: "0xb" },
  });
  const Home = uiLoad("@/app/page").default;
  const html = renderToStaticMarkup(
    React.createElement(
      query.QueryClientProvider,
      { client: new query.QueryClient() },
      React.createElement(Home),
    ),
  );
  for (const text of ["Activity", "Balances", "Swap", "Supply USDC", "Refunded"])
    assert.ok(html.includes(text), text);
  assert.ok(!/Solana|solscan|tx-status|tx-list/.test(html));
  fs.writeFileSync(
    path.join(root, "scratch-refactor-tasks/verification/connected-fixture.html"),
    html,
  );
  console.log("PASS connected vault root SSR with stubbed wallet and live history fixture");
  const dialogStubs = Object.fromEntries(
    ["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription"].map((name) => [
      name,
      ({ children }) => React.createElement("div", null, children),
    ]),
  );
  const Details = loader({ "@/components/ui/dialog": dialogStubs })(
    "@/components/activity-list-table/transaction-details-dialog",
  ).TransactionDetailsDialog;
  const detailHtml = renderToStaticMarkup(
    React.createElement(Details, { transaction: hook()[0], open: true, onOpenChange: () => {} }),
  );
  for (const text of [
    "Supply Details",
    "refunded",
    "Fixture proof failed",
    "View Sepolia transaction",
  ])
    assert.ok(detailHtml.includes(text), text);
  console.log(
    "PASS live activity details retain operation, refund, failure reason and explorer link",
  );
  let liveRows = [{ ...hook()[0], status: "pending", failureReason: undefined }];
  const slots = [];
  let cursor = 0;
  const componentLoad = loader({
    react: {
      ...React,
      useState: (initial) => {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = initial;
        return [
          slots[slot],
          (value) => {
            slots[slot] = value;
          },
        ];
      },
    },
    "@/providers/vault-context": { useVault: () => ({ binding: midnight }) },
    "@/providers/vault-balances-context": {
      useVaultBalances: () => ({ balances: midnight.balances }),
    },
    "@/providers/vault-operations-context": { useVaultOperations: () => ({}) },
    "@/providers/midnight-wallet-context": { useMidnightConnection: () => ({ wallet: midnight }) },
    "@/hooks/use-midnight-transactions": { useMidnightTransactions: () => liveRows },
  });
  const Table = componentLoad("@/components/activity-list-table").ActivityListTable;
  const renderTable = () => {
    cursor = 0;
    return Table({});
  };
  function elements(node) {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!node || typeof node !== "object" || !node.props) return [];
    return [node, ...elements(node.props.children)];
  }
  const row = elements(renderTable()).find(
    (node) => node.type?.name === "TableRow" && node.props.onClick,
  );
  assert.ok(row);
  row.props.onClick();
  const findDetails = (tree) =>
    elements(tree).find((node) => node.type?.name === "TransactionDetailsDialog");
  let selected = findDetails(renderTable());
  assert.equal(selected.props.open, true);
  assert.equal(selected.props.transaction.status, "pending");
  liveRows = [{ ...liveRows[0], status: "failed", failureReason: "Updated while open" }];
  selected = findDetails(renderTable());
  assert.equal(selected.props.open, true);
  assert.equal(selected.props.transaction.status, "failed");
  assert.equal(selected.props.transaction.failureReason, "Updated while open");
  assert.equal(selected.props.transaction, liveRows[0]);
  console.log(
    "PASS selected activity details stay open and receive fresh history on component rerender",
  );
  const rowKeyboard = componentLoad("@/components/ui/table").TableRow({ onClick: () => {} }).props
    .onKeyDown;
  let rowActivations = 0;
  const rowTarget = {
    click: () => {
      rowActivations++;
    },
  };
  rowKeyboard({
    key: "Enter",
    target: rowTarget,
    currentTarget: rowTarget,
    preventDefault: () => {},
  });
  assert.equal(rowActivations, 1);
  rowKeyboard({ key: "Enter", target: {}, currentTarget: rowTarget, preventDefault: () => {} });
  assert.equal(rowActivations, 1, "A nested link keeps its own Enter action");
  console.log("PASS central TableRow keyboard activates the row and preserves nested link keys");
  const token = uiLoad("@/lib/constants/token-metadata").ERC20_TOKENS[0];
  midnight.balances.perToken[token.erc20Address.toLowerCase()] = {
    decimals: 6,
    vaultUnits: 123450000n,
    depositUnits: 7654321n,
  };
  const balancesHtml = renderToStaticMarkup(
    React.createElement(
      query.QueryClientProvider,
      { client: new query.QueryClient() },
      React.createElement(uiLoad("@/components/balance-section").BalanceSection),
    ),
  );
  assert.ok(balancesHtml.includes("123.45"));
  assert.ok(balancesHtml.includes("USDC"));
  console.log("PASS non-zero Midnight balance renders exact token amount");

  const operations = [];
  const dialogSlots = [];
  let dialogCursor = 0;
  const dialogLoad = loader({
    react: {
      ...React,
      useState: (initial) => {
        const slot = dialogCursor++;
        if (!(slot in dialogSlots)) dialogSlots[slot] = initial;
        return [
          dialogSlots[slot],
          (value) => {
            dialogSlots[slot] = value;
          },
        ];
      },
    },
    "@/providers/vault-context": {
      useVault: () => ({ binding: midnight, requireBinding: () => midnight }),
    },
    "@/providers/vault-balances-context": {
      useVaultBalances: () => ({ balances: midnight.balances }),
    },
    "@/providers/midnight-wallet-context": { useMidnightConnection: () => ({ wallet: midnight }) },
    "@/providers/evm-deposit-context": { useEvmDeposit: () => ({ transfer: null }) },
    "@/providers/vault-operations-context": {
      useVaultOperations: () => ({
        deposit: async (...args) => operations.push(["deposit", ...args]),
        withdraw: async (...args) => operations.push(["withdraw", ...args]),
      }),
    },
    "@/hooks/use-midnight-progress": {
      useMidnightProgress: () => ({ active: false, message: "", error: null }),
    },
    "@/lib/midnight/flow": { flow: { reset: () => operations.push(["reset"]) } },
  });
  const Deposit = dialogLoad("@/components/deposit-dialog").DepositDialog;
  const renderDeposit = () => {
    dialogCursor = 0;
    return Deposit({ open: true, onOpenChange: (open) => operations.push(["open", open]) });
  };
  const selector = elements(renderDeposit()).find((node) => node.type?.name === "TokenSelection");
  assert.ok(selector);
  selector.props.onTokenSelect(token, {
    chain: "ethereum",
    chainName: "Ethereum",
    symbol: "ethereum",
    tokens: [token],
  });
  const depositAddress = elements(renderDeposit()).find(
    (node) => node.type?.name === "DepositAddress",
  );
  assert.ok(depositAddress);
  assert.equal(depositAddress.props.depositAddress, midnight.depositAddress);
  await depositAddress.props.onContinue();
  assert.deepEqual(operations, [
    ["deposit", token.erc20Address, 7654321n],
    ["open", false],
  ]);
  console.log(
    "PASS deposit Continue uses existing depositUnits and delegates progress ownership before close",
  );

  operations.length = 0;
  const withdrawalToken = {
    symbol: "USDC",
    name: "USD Coin",
    chain: "midnight",
    chainName: "Midnight",
    address: token.erc20Address,
    balance: "123.45",
    decimals: 6,
  };
  const Withdraw = dialogLoad("@/components/withdraw-dialog").WithdrawDialog;
  const wrapper = Withdraw({
    open: true,
    onOpenChange: (open) => operations.push(["open", open]),
    availableTokens: [withdrawalToken],
    preSelectedToken: withdrawalToken,
  });
  const content = elements(wrapper).find((node) => node.type?.name === "WithdrawDialogContent");
  assert.ok(content);
  const amountInput = elements(content.type(content.props)).find(
    (node) => node.type?.name === "AmountInput",
  );
  assert.ok(amountInput);
  const receiver = "0x" + "12".repeat(20);
  await amountInput.props.onSubmit({
    token: withdrawalToken,
    amount: "1.234567",
    receiverAddress: receiver,
  });
  assert.deepEqual(operations, [
    ["withdraw", token.erc20Address, 1234567n, receiver],
    ["open", false],
  ]);
  console.log(
    "PASS withdrawal submit dispatches selected token, exact units and receiver with stubbed wallet",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
