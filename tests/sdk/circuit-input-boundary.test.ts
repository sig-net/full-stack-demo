import { readFile } from "node:fs/promises";

import ts from "typescript";
import { expect, it } from "vitest";

it("converts every completion/refund attestation at the generated circuit boundary", async () => {
  const source = await readFile("src/lib/midnight/vault.ts", "utf8");
  expect(source.length).toBeGreaterThan(0);
  const file = ts.createSourceFile("vault.ts", source, ts.ScriptTarget.Latest, true);
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression;
      if (
        ts.isPropertyAccessExpression(method.expression) &&
        method.expression.name.text === "callTx" &&
        /^(?:complete|refund)/.test(method.name.text)
      )
        calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  expect(calls).toHaveLength(9);
  for (const call of calls) {
    const argument = call.arguments[1];
    expect(
      argument &&
        ts.isCallExpression(argument) &&
        ts.isIdentifier(argument.expression) &&
        argument.expression.text === "respondBidirectionalEventToCircuitInput",
    ).toBe(true);
  }
});
