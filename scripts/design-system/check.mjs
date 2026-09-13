import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import ts from "typescript";
import { z } from "zod";

const root = resolve(import.meta.dirname, "../..");
/**
 * @param {string} directory - Root of the maintained source census.
 * @returns {string[]} Files beneath the directory.
 */
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(resolve(directory, entry.name)) : [resolve(directory, entry.name)],
  );
const files = walk(resolve(root, "src")).filter((file) => /\.(tsx|ts|css)$/.test(file));
assert(files.length > 0, "The source census must be non-empty");
const central = new Set(
  [
    "button",
    "input",
    "dialog",
    "dropdown-menu",
    "popover",
    "table",
    "tooltip",
    "label",
    "native-select",
    "badge",
    "card",
    "sonner",
    "feedback",
  ].map((name) => `src/components/ui/${name}.tsx`),
);
const primitive = new Set([
  "Button",
  "Input",
  "Label",
  "NativeSelect",
  "DialogContent",
  "DialogTitle",
  "DialogDescription",
  "DropdownMenuItem",
  "DropdownMenuContent",
  "TooltipContent",
  "PopoverContent",
  "Card",
  "CardContent",
]);
/** @type {unknown} */
const exceptionInput = JSON.parse(
  readFileSync(resolve(root, "docs/design-system-exceptions.json"), "utf8"),
);
const exceptions = z
  .array(z.object({ path: z.string(), kind: z.string(), reason: z.string() }))
  .parse(exceptionInput);
assert(exceptions.length > 0, "The explicit exception register must be non-empty");
for (const exception of exceptions)
  assert(
    files.some((file) => relative(root, file) === exception.path),
    `Missing exception target: ${exception.path}`,
  );
const css = readFileSync(resolve(root, "src/components/ui/presentation.css"), "utf8");
const recipes = new Set(
  [...css.matchAll(/@utility\s+(ds-[\w-]+)/g)].flatMap((match) => (match[1] ? [match[1]] : [])),
);
assert(recipes.size > 0, "Presentation recipe census must be non-empty");
/** @type {string[]} */
const failures = [];
let consumers = 0;
const appearance =
  /^(?:bg-|text-(?!left$|right$|center$|ellipsis$|wrap$|nowrap$)|font-|rounded|border(?:$|-)|shadow|ring|outline|cursor|transition|duration|animate|hover:|focus:|focus-visible:|active:|disabled:|gap-|space-[xy]-|p[xytrbl]?-[\d[]|m[xytrbl]?-[\d[]|tracking-|leading-|gradient-|underline|decoration-)/;
for (const file of files) {
  const name = relative(root, file);
  const source = readFileSync(file, "utf8");
  if (
    central.has(name) ||
    name === "src/app/globals.css" ||
    name === "src/components/ui/presentation.css"
  )
    continue;
  if (file.endsWith(".css")) {
    failures.push(`${name}: feature CSS bypasses central presentation`);
    continue;
  }
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  /** @type {Map<string, string>} */
  const aliases = new Map();
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const item of bindings.elements)
      aliases.set(item.name.text, item.propertyName?.text ?? item.name.text);
  }
  /**
   * @param {ts.Node} node - Source node rejected by the presentation boundary.
   * @param {string} detail - Specific violation.
   * @returns {number} Updated diagnostic count.
   */
  const report = (node, detail) =>
    failures.push(
      `${name}:${(tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1).toString()}: ${detail}`,
    );
  /**
   * @param {ts.Node} node - Syntax subtree inspected for boundary violations.
   * @returns {void}
   */
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /^(?:@radix-ui\/|radix-ui$)/.test(node.moduleSpecifier.text)
    )
      report(node, "Feature imports interaction primitives directly");
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "sonner"
    ) {
      const bindings = node.importClause?.namedBindings;
      if (
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.some((item) => (item.propertyName?.text ?? item.name.text) === "Toaster")
      )
        report(node, "Use the themed Toaster");
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (["button", "input", "select", "label", "textarea"].includes(node.tagName.getText(tree)))
        report(node, "Use the shared control");
    }
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(tree) === "style" &&
      !exceptions.some((item) => item.path === name && item.kind === "dynamic-qr")
    )
      report(node, "Inline appearance bypasses the theme");
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      let owner = node.parent;
      while (!ts.isJsxAttribute(owner) && !ts.isSourceFile(owner)) owner = owner.parent;
      const isClass =
        ts.isJsxAttribute(owner) &&
        ["className", "iconClassName"].includes(owner.name.getText(tree));
      const element = isClass ? owner.parent.parent : undefined;
      const tag =
        element && (ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element))
          ? element.tagName.getText(tree)
          : "";
      const tokens = node.text.split(/\s+/);
      const resemblesClasses = tokens.some((token) =>
        /^(?:ds-|text-|bg-|rounded|border-|cursor-|space-y-|gap-)/.test(token),
      );
      if (isClass || resemblesClasses) {
        consumers++;
        for (const token of tokens) {
          let depth = 0;
          let start = 0;
          for (let index = 0; index < token.length; index++) {
            if (token[index] === "[" || token[index] === "(") depth++;
            if (token[index] === "]" || token[index] === ")") depth--;
            if (token[index] === ":" && depth === 0) start = index + 1;
          }
          const unprefixed = token.slice(start);
          if (/^\[.*:/.test(unprefixed)) report(node, `Arbitrary CSS property: ${token}`);
          if (appearance.test(unprefixed)) report(node, `Feature appearance utility: ${token}`);
          if (unprefixed.startsWith("ds-") && !recipes.has(unprefixed))
            report(node, `Unknown semantic recipe: ${token}`);
          if (isClass && primitive.has(aliases.get(tag) ?? tag) && unprefixed.startsWith("ds-"))
            report(node, `Primitive appearance override: ${token}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
}
assert(consumers > 0, "The feature presentation census must be non-empty");
assert.equal(failures.length, 0, failures.join("\n"));
console.log(
  `Design-system boundary passed: ${files.length.toString()} source files, ${consumers.toString()} presentation expressions, ${recipes.size.toString()} central recipes, ${exceptions.length.toString()} exact exceptions.`,
);
