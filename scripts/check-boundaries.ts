// Fails when a runtime import crosses the backend boundary. `yarn boundaries` runs it, and
// `yarn check` includes it. The boundary is the future `backend` package: everything it will own
// is reachable from the app only through `src/server/backend.ts`, and from the integration tests
// only through `getBackend()`. Type-only imports are erased and may cross freely.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/** Modules the backend package will own. A module matches by directory or by file-name suffix. */
const BACKEND_DIRECTORIES = [
  'src/lib/db/',
  'src/lib/event/',
  'src/lib/kafka/',
  'src/lib/repository/',
  'src/lib/testing/',
]
const BACKEND_FILES = ['src/lib/lazy-singleton.ts', 'src/lib/caller/resolve-caller.ts']
const BACKEND_SUFFIXES = [
  '-impl.ts',
  '-repository.ts',
  '-state-controller.ts',
  '-state-machine.ts',
  '-state-resolver.ts',
  '-event-consumer.ts',
  '-ledger.ts',
  '-circuits.ts',
  'relayer-wallet.ts',
  '-adaptor.ts',
  '-fixtures.ts',
]

/** The composition root and the start-up: the app reaches the backend through these alone. */
const COMPOSITION = ['src/server/backend.ts', 'src/server/start.ts']

const SOURCE_ROOTS = ['src', 'integration-tests']

interface RuntimeImport {
  readonly specifier: string
  /** The runtime names imported, empty for a side-effect, default or namespace import. */
  readonly names: readonly string[]
}

interface Violation {
  readonly file: string
  readonly specifier: string
  readonly reason: string
}

function isBackendModule(path: string): boolean {
  return (
    BACKEND_DIRECTORIES.some((directory) => path.startsWith(directory)) ||
    BACKEND_FILES.includes(path) ||
    BACKEND_SUFFIXES.some((suffix) => path.endsWith(suffix))
  )
}

function mayReachBackend(file: string): boolean {
  return (
    isBackendModule(file) ||
    file.startsWith('src/server/') ||
    file.startsWith('integration-tests/') ||
    file.endsWith('.test.ts')
  )
}

function mayReachComposition(file: string): boolean {
  return (
    file.startsWith('src/server/') ||
    file.startsWith('integration-tests/') ||
    file === 'src/instrumentation.ts'
  )
}

function check(
  file: string,
  { specifier, names }: RuntimeImport,
  target: string,
): Violation | undefined {
  const violation = (reason: string): Violation => ({ file, specifier, reason })
  if (file.startsWith('integration-tests/')) {
    const onlyGetBackend =
      target === 'src/server/backend.ts' &&
      names.length > 0 &&
      names.every((name) => name === 'getBackend')
    if (target.startsWith('src/') && !onlyGetBackend) {
      return violation('integration tests reach the backend only through getBackend()')
    }
    return undefined
  }
  if (COMPOSITION.includes(target) && !mayReachComposition(file)) {
    return violation('the app reaches the backend only through src/server/actions')
  }
  if (isBackendModule(target) && !mayReachBackend(file)) {
    return violation('a backend module is only used inside the backend and src/server')
  }
  return undefined
}

/** Runtime imports only: `import type`, and clauses whose every specifier is `type`, are skipped. */
const IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:(\{[^}]*\}|[\w*\s,]+)\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function runtimeImports(source: string): RuntimeImport[] {
  const imports: RuntimeImport[] = []
  for (const match of source.matchAll(IMPORT)) {
    const [, typeKeyword, clause, specifier, dynamicSpecifier] = match
    if (dynamicSpecifier !== undefined) {
      imports.push({ specifier: dynamicSpecifier, names: [] })
      continue
    }
    if (specifier === undefined || typeKeyword !== undefined) continue
    const names = (clause ?? '')
      .replace(/[{}]/g, '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '' && !name.startsWith('type '))
      .map((name) => name.replace(/^(\w+)\s+as\s+\w+$/, '$1'))
    if (clause !== undefined && clause.trim() !== '' && names.length === 0) continue
    imports.push({ specifier, names })
  }
  return imports
}

function resolveTarget(file: string, specifier: string): string | undefined {
  let path: string
  if (specifier.startsWith('@/')) path = `src/${specifier.slice(2)}`
  else if (specifier.startsWith('.'))
    path = relative(process.cwd(), resolve(dirname(file), specifier))
  else return undefined
  return path.replace(/\.(ts|tsx)$/, '') + (path.endsWith('.tsx') ? '.tsx' : '.ts')
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry) ? [path] : []
  })
}

const files = SOURCE_ROOTS.flatMap(sourceFiles)
const violations: Violation[] = []
let backendImportsSeen = 0
for (const file of files) {
  for (const runtimeImport of runtimeImports(readFileSync(file, 'utf8'))) {
    const target = resolveTarget(file, runtimeImport.specifier)
    if (target === undefined) continue
    if (isBackendModule(target)) backendImportsSeen += 1
    const violation = check(file, runtimeImport, target)
    if (violation !== undefined) violations.push(violation)
  }
}

if (files.length < 50 || backendImportsSeen < 10) {
  console.error(
    `Boundary check saw ${files.length.toString()} files and ${backendImportsSeen.toString()} backend imports, too few to trust its own scan`,
  )
  process.exit(2)
}
if (violations.length > 0) {
  for (const { file, specifier, reason } of violations) {
    console.error(`${file}: imports ${specifier}, but ${reason}`)
  }
  process.exit(1)
}
console.log(
  `Boundaries hold across ${files.length.toString()} files (${backendImportsSeen.toString()} backend imports checked)`,
)
