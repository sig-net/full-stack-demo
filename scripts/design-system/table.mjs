import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as utils from '../../src/lib/utils.ts';

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL('../../src/components/ui/table.tsx', import.meta.url),
  'utf8',
);
assert(source.length > 0, 'Table source must be non-empty');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const table = {};
new Function('require', 'exports', compiled)(
  name => (name === '@/lib/utils' ? utils : require(name)),
  table,
);
const row = table.TableRow({ onClick: () => {} });
assert.equal(row.props.tabIndex, 0);
let activations = 0;
let prevented = 0;
const currentTarget = {
  click: () => {
    activations++;
  },
};
for (const key of ['Enter', ' ']) {
  row.props.onKeyDown({
    key,
    target: currentTarget,
    currentTarget,
    preventDefault: () => {
      prevented++;
    },
  });
}
assert.equal(activations, 2);
assert.equal(prevented, 2);
row.props.onKeyDown({
  key: 'Enter',
  target: {},
  currentTarget,
  preventDefault: () => {
    prevented++;
  },
});
assert.equal(activations, 2, 'Nested links keep their own keyboard action');
assert.equal(prevented, 2);
assert.equal(table.TableRow({}).props.tabIndex, undefined);
console.log(
  'Table keyboard passed: own Enter/Space activation, nested link keys and passive row semantics.',
);
