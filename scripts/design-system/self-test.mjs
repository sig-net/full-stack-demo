import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '../..');
const target = resolve(root, 'src/components/seed-wallet-dialog.tsx');
const original = readFileSync(target, 'utf8');
const cases = [
  [
    'state palette',
    value =>
      value.replace('<form', "<form className='data-[state=open]:bg-red-500'"),
  ],
  [
    'arbitrary CSS',
    value => value.replace('<form', "<form className='[color:red]'"),
  ],
  [
    'aliased Toaster',
    value => `import { Toaster as Notifications } from 'sonner';\n${value}`,
  ],
  [
    'aliased primitive',
    value =>
      value
        .replace('import { Input }', 'import { Input as FieldInput }')
        .replace('<Input', "<FieldInput className='ds-caption'"),
  ],
  ['palette', value => value.replace('<form', "<form className='bg-red-500'")],
  ['raw control', value => value.replace('<form', '<input /><form')],
  [
    'inline style',
    value => value.replace('<form', "<form style={{ color: 'red' }}"),
  ],
  [
    'unknown recipe',
    value => value.replace('<form', "<form className='ds-unregistered'"),
  ],
  [
    'primitive override',
    value => value.replace('<Input', "<Input className='ds-caption'"),
  ],
  ['direct Radix', value => `import { Dialog } from 'radix-ui';\n${value}`],
  ['direct Toaster', value => `import { Toaster } from 'sonner';\n${value}`],
];
assert(cases.length > 0);
try {
  for (const [name, mutate] of cases) {
    writeFileSync(target, mutate(original));
    const result = spawnSync(
      process.execPath,
      ['scripts/design-system/check.mjs'],
      { cwd: root, encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0, `${name} violation must fail`);
    console.log(`Planted ${name} violation failed`);
  }
} finally {
  writeFileSync(target, original);
}
const cssTarget = resolve(root, 'src/components/design-system-violation.css');
try {
  writeFileSync(cssTarget, '.violation { color: red; }');
  assert.notEqual(
    spawnSync(process.execPath, ['scripts/design-system/check.mjs'], {
      cwd: root,
    }).status,
    0,
  );
  console.log('Planted feature CSS violation failed');
} finally {
  unlinkSync(cssTarget);
}
const final = spawnSync(process.execPath, ['scripts/design-system/check.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(final.status, 0, final.stderr);
console.log(final.stdout.trim());
