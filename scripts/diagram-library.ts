// Generates docs/diagram-library/<package path>/diagram-library.drawio and its rendered PNG for
// every package under src/lib that declares a provider class or an entity: one provider
// container per src/lib class a composition root builds and one entity container per repository
// resource, read from the code through the TypeScript checker. The roots are `createBackend()`
// for the server and every file under src/components for the browser, each walked into the
// functions it calls that are declared in its own files or under src/lib. A class that
// implements and adapts no src/lib interface is drawn standalone, under its own name with its
// public members. A provider's rows are its properties as `name: type`, an optional one marked
// `?`, then its methods, each kind in source order.
// `yarn diagram-library` writes them, and `yarn diagram-library:check` (part of `yarn check`)
// exits 1 when a committed file differs from a fresh generation, is missing or is not
// generated. The cells carry the palette's styles byte for byte, so an action flow copies them
// unchanged.

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  isBindingElement,
  isCallExpression,
  isClassDeclaration,
  isConstructorDeclaration,
  isFunctionDeclaration,
  isGetAccessorDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isLiteralTypeNode,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isNewExpression,
  isPrivateIdentifier,
  isPropertyAccessExpression,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isTypeAliasDeclaration,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  type ClassDeclaration,
  type InterfaceDeclaration,
  type MethodDeclaration,
  type MethodSignatureDeclaration,
  type Node,
  type PropertySignatureDeclaration,
  type SourceFile,
  SyntaxKind,
  type TypeAliasDeclaration,
  type TypeNode,
} from 'typescript/unstable/ast'
import {
  API,
  type Checker,
  type Project,
  type Symbol as TsSymbol,
  SymbolFlags,
  type Type,
  TypeFlags,
} from 'typescript/unstable/sync'

/** The library drawn from the code: everything the drawio file is generated from. */
interface DiagramLibrary {
  readonly providers: readonly Provider[]
  readonly excludedClasses: readonly ExcludedClass[]
  readonly entities: readonly Entity[]
}

type Provider = InterfaceProvider | StandaloneProvider

interface InterfaceProvider {
  readonly id: string
  readonly className: string
  readonly relation: Exclude<ProviderRelation, 'standalone'>
  /** The interface the class implements, or for an adaptor the service interface it adapts. */
  readonly interfaceName: string
  /** The package declaring the class, whose file the container is drawn in. */
  readonly packagePath: string
  readonly interfacePackagePath: string
  /** The roots that build the class, in `RUNTIMES` order, recorded for the log and never drawn. */
  readonly runtimes: readonly Runtime[]
  readonly properties: readonly ProviderProperty[]
  readonly methods: readonly ProviderMethod[]
}

interface StandaloneProvider {
  readonly id: string
  readonly className: string
  readonly relation: 'standalone'
  /** The package declaring the class, whose file the container is drawn in. */
  readonly packagePath: string
  /** The roots that build the class, in `RUNTIMES` order, recorded for the log and never drawn. */
  readonly runtimes: readonly Runtime[]
  readonly properties: readonly ProviderProperty[]
  readonly methods: readonly ProviderMethod[]
}

const RUNTIMES = ['server', 'browser'] as const

type Runtime = (typeof RUNTIMES)[number]

/**
 * An adaptor draws its own public methods and the service it adapts, a standalone class (one
 * that implements no src/lib interface outside an adaptor file) its own public methods under its
 * name alone, every other provider the interface it implements.
 */
type ProviderRelation = 'implements' | 'adapts' | 'standalone'

interface ProviderProperty {
  readonly name: string
  readonly optional: boolean
  /** The declared type as the code spells it, type parameters of an instantiated generic substituted. */
  readonly type: string
}

interface ProviderMethod {
  readonly name: string
  readonly optional: boolean
  /** Each parameter as the interface spells it, type parameters of an instantiated generic substituted. */
  readonly parameters: readonly string[]
  /** The declared return type without its `Promise<...>` wrapper. */
  readonly returnType: string
}

interface ExcludedClass {
  readonly className: string
  readonly reason: string
}

interface Entity {
  readonly id: string
  readonly typeName: string
  readonly packagePath: string
  readonly fields: readonly EntityField[]
}

interface EntityField {
  readonly name: string
  readonly type: string
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND_FILE = join(ROOT, 'src/server/backend.ts')
const COMPONENTS_DIRECTORY = join(ROOT, 'src/components')
const LIB_DIRECTORY = join(ROOT, 'src/lib')
const REPOSITORY_FILE = join(ROOT, 'src/lib/repository/repository.ts')
const EVENT_FILE = join(ROOT, 'src/lib/event/event.ts')
const OUTPUT_DIRECTORY = join(ROOT, 'docs/diagram-library')
const OUTPUT_NAME = 'diagram-library.drawio'
const RENDERED_NAME = `${OUTPUT_NAME}.png`
/** The `-adaptor.ts` entry of `BACKEND_SUFFIXES` in scripts/check-boundaries.ts, which runs on import, so this copy goes once that list moves to an importable module. */
const ADAPTOR_SUFFIX = '-adaptor.ts'

function readDiagramLibrary(project: Project): DiagramLibrary {
  const checker = project.checker
  const providers: Provider[] = []
  const excludedClasses: ExcludedClass[] = []
  const interfaceKeys = new Map<string, string>()
  const builtBy = new Map<string, { instantiated: Instantiated; runtimes: Runtime[] }>()
  for (const runtime of RUNTIMES) {
    for (const [key, instantiated] of instantiatedClasses(
      checker,
      compositionRoot(project, runtime),
    )) {
      const found = builtBy.get(key) ?? { instantiated, runtimes: [] }
      found.runtimes.push(runtime)
      builtBy.set(key, found)
    }
  }
  const implementations = [...builtBy.values()].map(({ instantiated, runtimes }) => {
    const found = implementation(project, instantiated)
    return 'reason' in found ? found : { ...found, runtimes }
  })
  const implementationCounts = new Map<string, number>()
  for (const found of implementations) {
    if ('reason' in found || found.relation === 'standalone') continue
    const key = `${found.interfacePackagePath}.${found.interfaceName}`
    const clash = interfaceKeys.get(found.interfaceName)
    if (clash !== undefined && clash !== key) {
      throw new Error(`Two interfaces named ${found.interfaceName}: ${clash} and ${key}`)
    }
    interfaceKeys.set(found.interfaceName, key)
    if (found.relation === 'adapts') continue
    implementationCounts.set(key, (implementationCounts.get(key) ?? 0) + 1)
  }
  for (const found of implementations) {
    if ('reason' in found) {
      excludedClasses.push(found)
      continue
    }
    if (found.relation === 'standalone') {
      providers.push({ ...found, id: `provider-${kebab(found.className)}` })
      continue
    }
    const shared =
      (implementationCounts.get(`${found.interfacePackagePath}.${found.interfaceName}`) ?? 0) > 1
    const key =
      found.relation === 'adapts'
        ? kebab(found.className)
        : shared
          ? `${kebab(found.interfaceName)}-${kebab(implementationQualifier(found))}`
          : kebab(found.interfaceName)
    providers.push({ ...found, id: `provider-${key}` })
  }
  const entities = entityTypes(project).map((alias) => readEntity(project, alias))
  return { providers, excludedClasses, entities }
}

type Implementation =
  | Omit<InterfaceProvider, 'id' | 'runtimes'>
  | Omit<StandaloneProvider, 'id' | 'runtimes'>

/** Where a root's walk starts, and the files outside src/lib whose functions it follows calls into. */
interface CompositionRoot {
  readonly entries: readonly Node[]
  readonly files: ReadonlySet<string>
}

function compositionRoot(project: Project, runtime: Runtime): CompositionRoot {
  const roots: Record<Runtime, () => CompositionRoot> = {
    server: () => {
      const entry = sourceFile(project, BACKEND_FILE).statements.find(
        (statement) => isFunctionDeclaration(statement) && statement.name?.text === 'createBackend',
      )
      if (entry === undefined) throw new Error('backend.ts declares no createBackend()')
      return { entries: [entry], files: new Set([BACKEND_FILE]) }
    },
    browser: () => {
      const files = project.program
        .getSourceFileNames()
        .filter(
          (file) =>
            isUnder(file, COMPONENTS_DIRECTORY) &&
            /\.tsx?$/.test(file) &&
            !/\.test\.tsx?$/.test(file),
        )
        .sort()
      if (files.length === 0) {
        throw new Error('src/components holds no file in the tsconfig program')
      }
      return { entries: files.map((file) => sourceFile(project, file)), files: new Set(files) }
    },
  }
  return roots[runtime]()
}

/**
 * Every class the root instantiates, keyed and in the order the walk first meets each, following
 * each call into a function declared in a root file or under src/lib.
 */
function instantiatedClasses(checker: Checker, root: CompositionRoot): Map<string, Instantiated> {
  const visited = new Set<string>(root.entries.map(nodeKey))
  const queue: Node[] = [...root.entries]
  const classes = new Map<string, Instantiated>()
  const visit = (node: Node): void => {
    if (isCallExpression(node)) {
      const callee = calledFunction(checker, node.expression)
      if (callee !== undefined && !visited.has(nodeKey(callee))) {
        const file = callee.getSourceFile().fileName
        if (root.files.has(file) || isUnder(file, LIB_DIRECTORY)) {
          visited.add(nodeKey(callee))
          queue.push(callee)
        }
      }
    }
    if (isNewExpression(node)) {
      const instantiated = classDeclarationOf(checker, node.expression)
      const key = 'globalName' in instantiated ? instantiated.globalName : nodeKey(instantiated)
      if (!classes.has(key)) classes.set(key, instantiated)
    }
    node.forEachChild(visit)
  }
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) visit(next)
  return classes
}

function nodeKey(node: Node): string {
  return `${node.getSourceFile().fileName}:${node.pos.toString()}`
}

/** The function declaration a call names directly (`f()`) or as a module member (`module.f()`), if it has a body. */
function calledFunction(checker: Checker, expression: Node): Node | undefined {
  const name = isPropertyAccessExpression(expression) ? expression.name : expression
  if (!isIdentifier(name)) return undefined
  return valueDeclarations(checker, name).find(
    (declaration) => isFunctionDeclaration(declaration) && declaration.body !== undefined,
  )
}

/** A class declaration, or a runtime global declared as a variable plus an interface (`Error`). */
type Instantiated = ClassDeclaration | { readonly globalName: string }

function classDeclarationOf(checker: Checker, expression: Node): Instantiated {
  const found = valueDeclarations(checker, expression).find(isClassDeclaration)
  return found ?? { globalName: resolvedSymbol(checker, expression).name }
}

/** The declarations of the symbol at the node, a variable's replaced by its type's, so a binding destructured from `await import(...)` reaches the export. */
function valueDeclarations(checker: Checker, node: Node): Node[] {
  const symbol = checker.getSymbolAtLocation(node)
  if (symbol === undefined) return []
  const resolved = symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
  const declarations = resolved.declarations.flatMap((handle) => handle.resolve() ?? [])
  if (!declarations.some((found) => isBindingElement(found) || isVariableDeclaration(found))) {
    return declarations
  }
  const typeSymbol = checker.getTypeAtLocation(node)?.getSymbol()
  return (typeSymbol?.declarations ?? []).flatMap((handle) => handle.resolve() ?? [])
}

/** The provider a class implements, or the reason it is left off the library. */
function implementation(
  project: Project,
  instantiated: Instantiated,
): Implementation | ExcludedClass {
  if ('globalName' in instantiated) {
    return {
      className: instantiated.globalName,
      reason: 'a runtime global with no class declaration',
    }
  }
  const declaration = instantiated
  const className = declaration.name?.text ?? '(anonymous)'
  const file = declaration.getSourceFile().fileName
  if (!isUnder(file, LIB_DIRECTORY)) {
    return { className, reason: `declared outside src/lib, in ${displayPath(file)}` }
  }
  const implemented = classChain(project, declaration).flatMap((member) =>
    (member.heritageClauses ?? [])
      .filter((clause) => clause.token === SyntaxKind.ImplementsKeyword)
      .flatMap((clause) => [...clause.types]),
  )
  const libInterfaces = new Set<InterfaceDeclaration | TypeAliasDeclaration>()
  for (const type of implemented) {
    const target = declarationOf(project.checker, type.expression)
    if (target === undefined || !isUnder(target.getSourceFile().fileName, LIB_DIRECTORY)) continue
    if (!(isInterfaceDeclaration(target) || isTypeAliasDeclaration(target))) {
      throw new Error(`${className} implements something that is neither an interface nor an alias`)
    }
    libInterfaces.add(target)
  }
  if (libInterfaces.size === 0) {
    if (implemented.length === 0 && file.endsWith(ADAPTOR_SUFFIX)) {
      return adaptation(project, declaration)
    }
    return {
      className,
      relation: 'standalone',
      packagePath: packagePathOf(file),
      properties: publicProperties(declaration).map((member) => providerProperty(project, member)),
      methods: publicMethods(declaration).map((member) => providerMethod(project, member)),
    }
  }
  const provided = [...libInterfaces].filter(
    (target) => ![...libInterfaces].some((other) => interfacesBehind(project, other).has(target)),
  )
  if (provided.length !== 1) {
    throw new Error(
      `${className} implements several src/lib interfaces, which one container cannot show`,
    )
  }
  const [target] = provided
  if (target === undefined) throw new Error(`${className} lost its implements clause`)
  const members = interfaceMembers(project, target)
  return {
    className,
    relation: 'implements',
    interfaceName: target.name.text,
    packagePath: packagePathOf(declaration.getSourceFile().fileName),
    interfacePackagePath: packagePathOf(target.getSourceFile().fileName),
    properties: members.properties.map((member) => providerProperty(project, member)),
    methods: members.methods.map((member) => providerMethod(project, member)),
  }
}

/** An adaptor's provider: the service interface its constructor takes first, and its public instance members in source order. */
function adaptation(project: Project, declaration: ClassDeclaration): Implementation {
  const className = declaration.name?.text ?? '(anonymous)'
  const [adapted] = declaration.members.find(isConstructorDeclaration)?.parameters ?? []
  const target = adapted?.type === undefined ? undefined : adaptedInterface(project, adapted.type)
  if (target === undefined) {
    throw new Error(`${className} takes no src/lib interface as its first constructor parameter`)
  }
  return {
    className,
    relation: 'adapts',
    interfaceName: target.name.text,
    packagePath: packagePathOf(declaration.getSourceFile().fileName),
    interfacePackagePath: packagePathOf(target.getSourceFile().fileName),
    properties: publicProperties(declaration).map((member) => providerProperty(project, member)),
    methods: publicMethods(declaration).map((member) => providerMethod(project, member)),
  }
}

/** The class's own public instance methods in source order, a provider with none being an error. */
function publicMethods(declaration: ClassDeclaration): DeclaredMethod[] {
  const methods = declaration.members
    .filter(isMethodDeclaration)
    .filter(
      (member) =>
        !isPrivateIdentifier(member.name) &&
        !(member.modifiers ?? []).some((modifier) => HIDDEN_MODIFIERS.includes(modifier.kind)),
    )
  if (methods.length === 0) {
    throw new Error(`${declaration.name?.text ?? '(anonymous)'} has no public method`)
  }
  return methods.map((member) => ({ declaration: member, substitutions: new Map() }))
}

/** The class's own public instance properties in source order: fields, getters and constructor parameter properties. */
function publicProperties(declaration: ClassDeclaration): DeclaredProperty[] {
  const isPublic = (member: Node & { readonly modifiers?: readonly Node[] }): boolean =>
    !(member.modifiers ?? []).some((modifier) => HIDDEN_MODIFIERS.includes(modifier.kind))
  return declaration.members.flatMap((member): DeclaredProperty[] => {
    if (isConstructorDeclaration(member)) {
      return member.parameters
        .filter(
          (parameter) =>
            (parameter.modifiers ?? []).some((modifier) =>
              PARAMETER_PROPERTY_MODIFIERS.includes(modifier.kind),
            ) && isPublic(parameter),
        )
        .map((parameter) => ({
          name: parameter.name.getText(),
          optional: parameter.questionToken !== undefined,
          type: parameter.type,
          substitutions: new Map(),
        }))
    }
    if (!(isPropertyDeclaration(member) || isGetAccessorDeclaration(member))) return []
    if (isPrivateIdentifier(member.name) || !isPublic(member)) return []
    return [
      {
        name: member.name.getText(),
        optional: member.postfixToken?.kind === SyntaxKind.QuestionToken,
        type: member.type,
        substitutions: new Map(),
      },
    ]
  })
}

const HIDDEN_MODIFIERS: readonly SyntaxKind[] = [
  SyntaxKind.PrivateKeyword,
  SyntaxKind.ProtectedKeyword,
  SyntaxKind.StaticKeyword,
]

/** A constructor parameter carrying one of these is also a property of the class. */
const PARAMETER_PROPERTY_MODIFIERS: readonly SyntaxKind[] = [
  SyntaxKind.PublicKeyword,
  SyntaxKind.PrivateKeyword,
  SyntaxKind.ProtectedKeyword,
  SyntaxKind.ReadonlyKeyword,
]

/** The src/lib interface a parameter type names, a `| null` for an absent service dropped. */
function adaptedInterface(
  project: Project,
  type: TypeNode,
): InterfaceDeclaration | TypeAliasDeclaration | undefined {
  const named = isUnionTypeNode(type)
    ? type.types.filter(
        (member) => !(isLiteralTypeNode(member) && member.literal.kind === SyntaxKind.NullKeyword),
      )
    : [type]
  const [only] = named
  if (named.length !== 1 || only === undefined || !isTypeReferenceNode(only)) return undefined
  const target = declarationOf(project.checker, only.typeName)
  if (target === undefined || !isUnder(target.getSourceFile().fileName, LIB_DIRECTORY)) {
    return undefined
  }
  return isInterfaceDeclaration(target) || isTypeAliasDeclaration(target) ? target : undefined
}

/** The class, then each base class it extends, nearest first, up to the first base that is not a class declaration. */
function classChain(project: Project, declaration: ClassDeclaration): ClassDeclaration[] {
  const chain = [declaration]
  for (let current = declaration; ;) {
    const [base] = (current.heritageClauses ?? [])
      .filter((clause) => clause.token === SyntaxKind.ExtendsKeyword)
      .flatMap((clause) => [...clause.types])
    const target = base === undefined ? undefined : declarationOf(project.checker, base.expression)
    if (target === undefined || !isClassDeclaration(target)) return chain
    chain.push(target)
    current = target
  }
}

/**
 * Every interface the target aliases or extends, transitively, so an implemented alias
 * (`DepositRepository`) subsumes the generic interface a base class implements (`Repository`).
 */
function interfacesBehind(
  project: Project,
  target: InterfaceDeclaration | TypeAliasDeclaration,
): Set<Node> {
  const behind = new Set<Node>()
  const references = isTypeAliasDeclaration(target)
    ? isTypeReferenceNode(target.type)
      ? [target.type.typeName]
      : []
    : (target.heritageClauses ?? []).flatMap((clause) =>
        [...clause.types].map((type) => type.expression),
      )
  for (const reference of references) {
    const base = declarationOf(project.checker, reference)
    if (base === undefined || !(isInterfaceDeclaration(base) || isTypeAliasDeclaration(base))) {
      continue
    }
    behind.add(base)
    for (const further of interfacesBehind(project, base)) behind.add(further)
  }
  return behind
}

/** An interface or class method declaration with the type parameter substitutions that hold where it is declared. */
interface DeclaredMethod {
  readonly declaration: MethodSignatureDeclaration | MethodDeclaration
  readonly substitutions: ReadonlyMap<number, string>
}

/** An interface or class property with the type parameter substitutions that hold where it is declared. */
interface DeclaredProperty {
  readonly name: string
  readonly optional: boolean
  readonly type: TypeNode | undefined
  readonly substitutions: ReadonlyMap<number, string>
}

interface DeclaredMembers {
  readonly properties: readonly DeclaredProperty[]
  readonly methods: readonly DeclaredMethod[]
}

/**
 * The interface's property and method declarations, each kind in source order, reached through a
 * type alias of a generic interface (`Repository<Deposit>`) with each type parameter mapped to its
 * argument.
 */
function interfaceMembers(
  project: Project,
  target: InterfaceDeclaration | TypeAliasDeclaration,
): DeclaredMembers {
  if (!isTypeAliasDeclaration(target)) return ownAndInheritedMembers(project, target, new Map())
  const aliased = target.type
  const resolved = isTypeReferenceNode(aliased)
    ? declarationOf(project.checker, aliased.typeName)
    : undefined
  if (
    resolved === undefined ||
    !isInterfaceDeclaration(resolved) ||
    !isTypeReferenceNode(aliased)
  ) {
    throw new Error(`${target.name.text} aliases something other than an interface`)
  }
  const substitutions = typeArgumentSubstitutions(
    project,
    target.name.text,
    resolved,
    aliased.typeArguments ?? [],
    new Map(),
  )
  return ownAndInheritedMembers(project, resolved, substitutions)
}

/** The interface's own members of each kind in source order, then each inherited member it does not redeclare. */
function ownAndInheritedMembers(
  project: Project,
  declaration: InterfaceDeclaration,
  substitutions: ReadonlyMap<number, string>,
): DeclaredMembers {
  const own = declaration.members.map((member): DeclaredMethod | PropertySignatureDeclaration => {
    if (isMethodSignatureDeclaration(member)) return { declaration: member, substitutions }
    if (isPropertySignatureDeclaration(member)) return member
    throw new Error(
      `${declaration.name.text} has a member that is neither a property nor a method: ${member.getText()}`,
    )
  })
  const ownProperties = own.flatMap((member): DeclaredProperty[] =>
    'substitutions' in member
      ? []
      : [
          {
            name: member.name.getText(),
            optional: member.postfixToken?.kind === SyntaxKind.QuestionToken,
            type: member.type,
            substitutions,
          },
        ],
  )
  const ownMethods = own.flatMap((member) => ('substitutions' in member ? [member] : []))
  const names = new Set([
    ...ownProperties.map((member) => member.name),
    ...ownMethods.map((member) => member.declaration.name.getText()),
  ])
  const inherited = (declaration.heritageClauses ?? [])
    .flatMap((clause) => [...clause.types])
    .flatMap((type) => {
      const base = declarationOf(project.checker, type.expression)
      if (base === undefined || !isInterfaceDeclaration(base)) {
        throw new Error(`${declaration.name.text} extends something other than an interface`)
      }
      const baseSubstitutions = typeArgumentSubstitutions(
        project,
        declaration.name.text,
        base,
        type.typeArguments ?? [],
        substitutions,
      )
      return ownAndInheritedMembers(project, base, baseSubstitutions)
    })
  return {
    properties: [
      ...ownProperties,
      ...inherited
        .flatMap((members) => members.properties)
        .filter((member) => !names.has(member.name)),
    ],
    methods: [
      ...ownMethods,
      ...inherited
        .flatMap((members) => members.methods)
        .filter((member) => !names.has(member.declaration.name.getText())),
    ],
  }
}

/**
 * Each type parameter of `base` mapped to the argument `referrer` instantiates it with, the
 * argument spelled under the substitutions that hold in `referrer`.
 */
function typeArgumentSubstitutions(
  project: Project,
  referrer: string,
  base: InterfaceDeclaration,
  typeArguments: readonly TypeNode[],
  outer: ReadonlyMap<number, string>,
): Map<number, string> {
  const parameters = base.typeParameters ?? []
  if (parameters.length !== typeArguments.length) {
    throw new Error(
      `${referrer} gives ${base.name.text} ${typeArguments.length.toString()} type arguments for ${parameters.length.toString()} type parameters`,
    )
  }
  const substitutions = new Map<number, string>()
  parameters.forEach((parameter, index) => {
    const argument = typeArguments[index]
    const symbol = project.checker.getSymbolAtLocation(parameter.name)
    if (argument === undefined || symbol === undefined) {
      throw new Error(`${base.name.text} type parameter ${parameter.name.text} has no symbol`)
    }
    substitutions.set(symbol.id, spellTypeNode(project.checker, argument, outer))
  })
  return substitutions
}

function providerProperty(project: Project, property: DeclaredProperty): ProviderProperty {
  const { name, optional, type, substitutions } = property
  if (type === undefined) throw new Error(`${name} declares no type`)
  return { name, optional, type: spellTypeNode(project.checker, type, substitutions) }
}

function providerMethod(project: Project, method: DeclaredMethod): ProviderMethod {
  const { declaration: member, substitutions } = method
  const name = member.name.getText()
  const optionalMethod = member.postfixToken?.kind === SyntaxKind.QuestionToken
  const spell = (type: TypeNode): string => spellTypeNode(project.checker, type, substitutions)
  const parameters = member.parameters.map((parameter) => {
    if (parameter.type === undefined) throw new Error(`${name} has an untyped parameter`)
    const optional = parameter.questionToken === undefined ? '' : '?'
    const rest = parameter.dotDotDotToken === undefined ? '' : '...'
    return `${rest}${parameter.name.getText()}${optional}: ${spell(parameter.type)}`
  })
  if (member.type === undefined) throw new Error(`${name} declares no return type`)
  return {
    name,
    optional: optionalMethod,
    parameters,
    returnType: spell(unwrapPromise(project, member.type)),
  }
}

function unwrapPromise(project: Project, type: TypeNode): TypeNode {
  if (!isTypeReferenceNode(type) || type.typeArguments?.length !== 1) return type
  const target = declarationOf(project.checker, type.typeName)
  const isPromise =
    target !== undefined &&
    project.program.isSourceFileDefaultLibrary(target.getSourceFile()) &&
    type.typeName.getText() === 'Promise'
  const [awaited] = type.typeArguments
  return isPromise && awaited !== undefined ? awaited : type
}

/** The node's source text with whitespace runs collapsed and substituted type parameters replaced. */
function spellTypeNode(
  checker: Checker,
  type: TypeNode,
  substitutions: ReadonlyMap<number, string>,
): string {
  const sourceText = type.getSourceFile().text
  const replacements: { start: number; end: number; text: string }[] = []
  const visit = (node: Node): void => {
    if (isTypeReferenceNode(node) && substitutions.size > 0) {
      const symbol = checker.getSymbolAtLocation(node.typeName)
      const replacement = symbol === undefined ? undefined : substitutions.get(symbol.id)
      if (replacement !== undefined) {
        replacements.push({ start: node.getStart(), end: node.end, text: replacement })
        return
      }
    }
    node.forEachChild(visit)
  }
  visit(type)
  let text = ''
  let cursor = type.getStart()
  for (const { start, end, text: replacement } of replacements) {
    text += sourceText.slice(cursor, start) + replacement
    cursor = end
  }
  text += sourceText.slice(cursor, type.end)
  return text.split(/\s+/).join(' ')
}

/** Every resource a `Repository<X>` alias under src/lib stores, then the `Event` schema type. */
function entityTypes(project: Project): TypeAliasDeclaration[] {
  const repository = declarationsIn(project, REPOSITORY_FILE).find(
    (statement) => isInterfaceDeclaration(statement) && statement.name.text === 'Repository',
  )
  if (repository === undefined)
    throw new Error('src/lib/repository/repository.ts declares no Repository')
  const resources: TypeAliasDeclaration[] = []
  for (const file of libFiles(project)) {
    for (const statement of declarationsIn(project, file)) {
      if (!isTypeAliasDeclaration(statement) || !isTypeReferenceNode(statement.type)) continue
      if (declarationOf(project.checker, statement.type.typeName) !== repository) continue
      const [resource] = statement.type.typeArguments ?? []
      const target =
        resource !== undefined && isTypeReferenceNode(resource)
          ? declarationOf(project.checker, resource.typeName)
          : undefined
      if (target === undefined || !isTypeAliasDeclaration(target)) {
        throw new Error(`${statement.name.text} stores something other than a schema type alias`)
      }
      resources.push(target)
    }
  }
  const event = declarationsIn(project, EVENT_FILE).find(
    (statement) => isTypeAliasDeclaration(statement) && statement.name.text === 'Event',
  )
  if (
    event !== undefined &&
    isTypeAliasDeclaration(event) &&
    isZodObjectInference(project, event)
  ) {
    resources.push(event)
  }
  return resources.sort((a, b) => a.name.text.localeCompare(b.name.text))
}

/** Whether the alias reads `z.infer<typeof schema>` over a schema whose type carries a `shape`. */
function isZodObjectInference(project: Project, alias: TypeAliasDeclaration): boolean {
  const { type } = alias
  if (!isTypeReferenceNode(type)) return false
  const [argument] = type.typeArguments ?? []
  if (argument === undefined || argument.kind !== SyntaxKind.TypeQuery) return false
  const schemaType = project.checker.getTypeAtLocation(argument)
  return (
    schemaType !== undefined && project.checker.getPropertyOfType(schemaType, 'shape') !== undefined
  )
}

function readEntity(project: Project, alias: TypeAliasDeclaration): Entity {
  const { checker } = project
  if (!isZodObjectInference(project, alias)) {
    throw new Error(`${alias.name.text} is not inferred from a zod object schema`)
  }
  const symbol = checker.getSymbolAtLocation(alias.name)
  if (symbol === undefined) throw new Error(`${alias.name.text} has no symbol`)
  const type = checker.getDeclaredTypeOfSymbol(symbol)
  const unions = literalUnionAliases(project)
  const fields = checker.getPropertiesOfType(type).map((property) => {
    const propertyType = checker.getTypeOfSymbol(property)
    if (propertyType === undefined)
      throw new Error(`${alias.name.text}.${property.name} has no type`)
    const optional = (property.flags & SymbolFlags.Optional) !== 0
    return {
      name: `${property.name}${optional ? '?' : ''}`,
      type: spellType(project, propertyType, unions, optional),
    }
  })
  return {
    id: `entity-${kebab(alias.name.text)}`,
    typeName: alias.name.text,
    packagePath: packagePathOf(alias.getSourceFile().fileName),
    fields,
  }
}

/** A field's type as the inferred type reads, a string-literal set named by its exported alias. */
function spellType(
  project: Project,
  type: Type,
  unions: ReadonlyMap<string, string>,
  optional: boolean,
): string {
  const members = unionMembers(type)
  const nullable = members.some((member) => member.flags & TypeFlags.Null)
  const rest = members.filter(
    (member) =>
      (member.flags & TypeFlags.Null) === 0 && !(optional && member.flags & TypeFlags.Undefined),
  )
  const literals = rest.flatMap((member) => stringLiteral(member) ?? [])
  if (literals.length > 0 && literals.length === rest.length) {
    const core =
      unions.get(literalKey(literals)) ?? literals.map((literal) => `'${literal}'`).join(' | ')
    return nullable ? `${core} | null` : core
  }
  // A named union of structured members (`JSONType`) reads by its name, its own null included.
  if (type.getAliasSymbol() !== undefined) return project.checker.typeToString(type)
  const booleans = rest.filter((member) => member.flags & TypeFlags.BooleanLiteral)
  const spelled = rest
    .filter((member) => booleans.length !== 2 || !booleans.includes(member))
    .map((member) => spellMember(project, member))
  const core = [...(booleans.length === 2 ? ['boolean'] : []), ...spelled].join(' | ')
  return nullable ? `${core} | null` : core
}

/** A built-in class (`Date`, `Uint8Array`) reads by its name alone, its buffer type argument dropped. */
function spellMember(project: Project, type: Type): string {
  const { checker } = project
  const symbol = type.getSymbol()
  const builtIn =
    symbol !== undefined &&
    !checker.isArrayType(type) &&
    (symbol.flags & (SymbolFlags.Class | SymbolFlags.Interface)) !== 0 &&
    symbol.declarations.some((handle) => {
      const declaration = handle.resolve()
      return (
        declaration !== undefined &&
        project.program.isSourceFileDefaultLibrary(declaration.getSourceFile())
      )
    })
  return builtIn ? symbol.name : checker.typeToString(type)
}

function unionMembers(type: Type): readonly Type[] {
  return type.isUnionType() ? type.getTypes() : [type]
}

function stringLiteral(type: Type): string | undefined {
  return type.isStringLiteralType() ? type.value : undefined
}

function literalKey(literals: readonly string[]): string {
  return [...literals].sort().join('\u0000')
}

/** Every exported alias of a string literal or a union of them under src/lib, keyed by its member set. */
function literalUnionAliases(project: Project): ReadonlyMap<string, string> {
  const cached = unionAliasCache.get(project)
  if (cached !== undefined) return cached
  const { checker } = project
  const names = new Map<string, string[]>()
  for (const file of libFiles(project)) {
    for (const statement of declarationsIn(project, file)) {
      if (!isTypeAliasDeclaration(statement) || !isExported(statement)) continue
      const symbol = checker.getSymbolAtLocation(statement.name)
      if (symbol === undefined) continue
      const type = checker.getDeclaredTypeOfSymbol(symbol)
      const members = unionMembers(type)
      const literals = members.flatMap((member) => stringLiteral(member) ?? [])
      if (literals.length === 0 || literals.length !== members.length) continue
      const key = literalKey(literals)
      names.set(key, [...(names.get(key) ?? []), statement.name.text])
    }
  }
  const unique = new Map<string, string>()
  for (const [key, aliases] of names) {
    const [only] = aliases
    if (aliases.length === 1 && only !== undefined) unique.set(key, only)
  }
  unionAliasCache.set(project, unique)
  return unique
}

const unionAliasCache = new WeakMap<Project, ReadonlyMap<string, string>>()

function isExported(statement: TypeAliasDeclaration): boolean {
  return (statement.modifiers ?? []).some((modifier) => modifier.kind === SyntaxKind.ExportKeyword)
}

/** The library rendered as one drawio file per package, keyed by the file's absolute path. */
function renderDiagramLibrary(library: DiagramLibrary): Map<string, string> {
  const packages = new Map<string, PackageContainers>()
  const packageOf = (packagePath: string): PackageContainers => {
    const found = packages.get(packagePath) ?? { providers: [], entities: [] }
    packages.set(packagePath, found)
    return found
  }
  for (const provider of library.providers) {
    packageOf(provider.packagePath).providers.push(providerContainer(provider))
  }
  for (const entity of library.entities) {
    packageOf(entity.packagePath).entities.push(entityContainer(entity))
  }
  const files = new Map<string, string>()
  const ids = new Set<string>()
  for (const [packagePath, containers] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const output = renderPackage(packagePath, containers)
    // A flow draws from several files at once, so every id but the title's is unique library-wide.
    for (const [, id] of output.matchAll(/<mxCell id="([^"]+)"/g)) {
      if (id === undefined || id === 'library-title' || id === '0' || id === '1') continue
      if (ids.has(id)) throw new Error(`Two cells share the id ${id}`)
      ids.add(id)
    }
    files.set(join(OUTPUT_DIRECTORY, ...packagePath.split('.'), OUTPUT_NAME), output)
  }
  return files
}

interface PackageContainers {
  readonly providers: Container[]
  readonly entities: Container[]
}

function renderPackage(packagePath: string, containers: PackageContainers): string {
  const title = `Diagram library: ${packagePath}, generated by scripts/diagram-library.ts from the code, never edited by hand`
  const cells: string[] = [
    textCell(
      'library-title',
      title,
      TITLE_STYLE,
      MARGIN,
      MARGIN,
      textWidth(title, TITLE_FONT) + 20,
      30,
    ),
  ]
  let y = MARGIN + 30 + SECTION_GAP
  const section = (sectionName: string, sectionId: string, members: readonly Container[]): void => {
    if (members.length === 0) return
    const heading = `${sectionName}: ${packagePath}`
    cells.push(
      textCell(
        `heading-${sectionId}-${kebab(packagePath.replaceAll('.', '-'))}`,
        heading,
        HEADING_STYLE,
        MARGIN,
        y,
        headingWidth(heading),
        HEADING_HEIGHT,
      ),
    )
    const columns = packColumns(heading, members)
    let columnX = MARGIN
    for (const column of columns) {
      let columnY = y + HEADING_HEIGHT + HEADING_GAP
      for (const container of column) {
        cells.push(...containerCells(container, columnX, columnY))
        columnY += container.height + CONTAINER_GAP
      }
      columnX += columnWidth(column) + CONTAINER_GAP
    }
    y += HEADING_HEIGHT + HEADING_GAP + Math.max(...columns.map(columnHeight)) + SECTION_GAP
  }
  section('Service providers', 'providers', containers.providers)
  section('Entities', 'entities', containers.entities)
  return [
    '<mxfile host="drawio-cli" version="1">',
    '  <diagram name="diagram-library" id="diagram-library">',
    '    <mxGraphModel dx="1000" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">',
    '      <root>',
    '        <mxCell id="0" />',
    '        <mxCell id="1" parent="0" />',
    ...cells.map((cell) => `        ${cell}`),
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>',
    '',
  ].join('\n')
}

interface Container {
  readonly id: string
  /** The header's HTML value: plain text broken with `<br>`. */
  readonly header: string
  readonly headerHeight: number
  readonly rows: readonly { readonly id: string; readonly value: string; readonly height: number }[]
  readonly width: number
  readonly height: number
}

const MARGIN = 40
const WORKING_WIDTH = 1300
const CONTAINER_GAP = 40
const SECTION_GAP = 40
const HEADING_GAP = 10
const HEADING_HEIGHT = 20
/** The tallest column the packer tries, past any single container's height. */
const MAX_COLUMN_BUDGET = 3000
const PROVIDER_HEADER = 65
/** A header band holding the one line of a standalone class name. */
const STANDALONE_HEADER = 26
const ENTITY_HEADER = 40
const METHOD_ROW = 73
const FIELD_ROW = 30
/** A method row holds four lines in 73 units, and each further parameter line adds this. */
const EXTRA_LINE = 15
/** The row's spacingLeft and spacingRight plus draw.io's default spacing of 2 on each side. */
const ROW_PADDING = 12
/** Headroom over the advance estimate, which runs a few units off the browser's text layout. */
const WIDTH_MARGIN = 4
const CONTAINER_STYLE = (header: number): string =>
  `swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=${header.toString()};fillColor=default;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;html=1;fillStyle=solid;`
const ROW_STYLE =
  'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;'
const TITLE_STYLE = 'text;html=1;fontStyle=1;fontSize=16;'
const HEADING_STYLE = 'text;html=1;fontStyle=1;'
const BODY_FONT = { size: 12, bold: false }
const HEADING_FONT = { size: 12, bold: true }
const TITLE_FONT = { size: 16, bold: true }
const INDENT = '&nbsp; '

function providerContainer(provider: Provider): Container {
  const header =
    provider.relation === 'standalone'
      ? [provider.className]
      : [
          provider.className,
          `${provider.relation === 'adapts' ? 'adapts ' : ''}&lt;${escapeHtml(provider.interfacePackagePath)}.`,
          `${escapeHtml(provider.interfaceName)}&gt;`,
        ]
  const propertyRows = provider.properties.map((property) => ({
    id: `${provider.id}-${kebab(property.name)}`,
    value: escapeHtml(`${property.name}${property.optional ? '?' : ''}: ${property.type}`),
    height: FIELD_ROW,
  }))
  const methodRows = provider.methods.map((method) => {
    const name = escapeHtml(`${method.name}${method.optional ? '?' : ''}`)
    const lines =
      method.parameters.length === 0
        ? [`${name}() (${escapeHtml(method.returnType)})`]
        : [
            `${name}(`,
            ...method.parameters.map(
              (parameter, index) =>
                `${INDENT}${escapeHtml(parameter)}${index < method.parameters.length - 1 ? ',' : ''}`,
            ),
            `) (${escapeHtml(method.returnType)})`,
          ]
    return {
      id: `${provider.id}-${kebab(method.name)}`,
      value: lines.join('<br>'),
      height: METHOD_ROW + Math.max(0, lines.length - 4) * EXTRA_LINE,
    }
  })
  return buildContainer(
    provider.id,
    header,
    provider.relation === 'standalone' ? STANDALONE_HEADER : PROVIDER_HEADER,
    [...propertyRows, ...methodRows],
  )
}

function entityContainer(entity: Entity): Container {
  const header = [`${escapeHtml(entity.packagePath)}.`, escapeHtml(entity.typeName)]
  const rows = entity.fields.map((field) => ({
    id: `${entity.id}-${kebab(field.name.replace('?', ''))}`,
    value: escapeHtml(`${field.name}: ${field.type}`),
    height: FIELD_ROW,
  }))
  return buildContainer(entity.id, header, ENTITY_HEADER, rows)
}

function buildContainer(
  id: string,
  header: readonly string[],
  headerHeight: number,
  rows: Container['rows'],
): Container {
  const headerWidth = Math.max(...header.map((line) => textWidth(decodeHtml(line), BODY_FONT)))
  const rowWidth = Math.max(
    0,
    ...rows.flatMap((row) =>
      row.value.split('<br>').map((line) => textWidth(decodeHtml(line), BODY_FONT)),
    ),
  )
  const width = 2 * Math.ceil((Math.max(headerWidth, rowWidth) + ROW_PADDING + WIDTH_MARGIN) / 2)
  const height = headerHeight + rows.reduce((total, row) => total + row.height, 0)
  return { id, header: header.join('<br>'), headerHeight, rows, width, height }
}

function containerCells(container: Container, x: number, y: number): string[] {
  const cells = [
    mxCell(
      container.id,
      container.header,
      CONTAINER_STYLE(container.headerHeight),
      '1',
      x,
      y,
      container.width,
      container.height,
    ),
  ]
  let rowY = container.headerHeight
  for (const row of container.rows) {
    cells.push(
      mxCell(row.id, row.value, ROW_STYLE, container.id, 0, rowY, container.width, row.height),
    )
    rowY += row.height
  }
  return cells
}

/**
 * Stacks a section's containers into columns in order, trying every column height budget and
 * keeping the shortest layout no wider than the working width, or the narrowest when none fits.
 */
function packColumns(heading: string, members: readonly Container[]): Container[][] {
  const tallest = Math.max(...members.map((container) => container.height))
  let best: { columns: Container[][]; width: number; height: number } | undefined
  for (let budget = tallest; budget <= MAX_COLUMN_BUDGET; budget += 10) {
    const columns = fillColumns(members, budget)
    const width = Math.max(
      headingWidth(heading),
      columns.reduce(
        (total, column) => total + columnWidth(column),
        CONTAINER_GAP * (columns.length - 1),
      ),
    )
    const height = Math.max(...columns.map(columnHeight))
    const fits = width <= WORKING_WIDTH
    const better =
      best === undefined ||
      (fits && (best.width > WORKING_WIDTH || height < best.height)) ||
      (!fits && best.width > WORKING_WIDTH && width < best.width)
    if (better) best = { columns, width, height }
  }
  if (best === undefined) throw new Error('No column budget fits the section')
  return best.columns
}

/** Fills columns in order, starting a new one when the next container would pass the budget. */
function fillColumns(members: readonly Container[], budget: number): Container[][] {
  const columns: Container[][] = []
  let current: Container[] = []
  for (const container of members) {
    if (current.length > 0 && columnHeight([...current, container]) > budget) {
      columns.push(current)
      current = []
    }
    current.push(container)
  }
  columns.push(current)
  return columns
}

function columnHeight(column: readonly Container[]): number {
  return column.reduce(
    (total, container) => total + container.height,
    CONTAINER_GAP * (column.length - 1),
  )
}

function columnWidth(column: readonly Container[]): number {
  return Math.max(...column.map((container) => container.width))
}

function headingWidth(heading: string): number {
  return Math.ceil(textWidth(heading, HEADING_FONT)) + 20
}

function textCell(
  id: string,
  value: string,
  style: string,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  return mxCell(id, escapeHtml(value), style, '1', x, y, Math.ceil(width), height)
}

function mxCell(
  id: string,
  htmlValue: string,
  style: string,
  parent: string,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  return `<mxCell id="${id}" value="${escapeXml(htmlValue)}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x.toString()}" y="${y.toString()}" width="${width.toString()}" height="${height.toString()}" as="geometry" /></mxCell>`
}

/** Helvetica advance widths per 1000 units of font size, from the standard AFM metrics. */
const HELVETICA: Record<string, number> = {
  ' ': 278,
  '!': 278,
  '"': 355,
  '#': 556,
  $: 556,
  '%': 889,
  '&': 667,
  "'": 191,
  '(': 333,
  ')': 333,
  '*': 389,
  '+': 584,
  ',': 278,
  '-': 333,
  '.': 278,
  '/': 278,
  ':': 278,
  ';': 278,
  '<': 584,
  '=': 584,
  '>': 584,
  '?': 556,
  '@': 1015,
  '[': 278,
  '\\': 278,
  ']': 278,
  '^': 469,
  _: 556,
  '`': 333,
  '{': 334,
  '|': 260,
  '}': 334,
  '~': 584,
  '\u00a0': 278,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
}
const HELVETICA_DIGIT = 556
/** Helvetica Bold runs about this much wider than the regular face. */
const BOLD_FACTOR = 1.1

function textWidth(text: string, font: { size: number; bold: boolean }): number {
  let units = 0
  for (const character of text) {
    units += /[0-9]/.test(character) ? HELVETICA_DIGIT : (HELVETICA[character] ?? 1000)
  }
  return (units * font.size * (font.bold ? BOLD_FACTOR : 1)) / 1000
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function decodeHtml(html: string): string {
  return html
    .replaceAll('&nbsp;', '\u00a0')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** `getTransaction` reads `get-transaction`, `SQLImpl` reads `sql-impl`. */
function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

/** What tells one implementation of a shared interface from its siblings: its class name less the interface name and `Impl`. */
function implementationQualifier(found: Omit<InterfaceProvider, 'id'>): string {
  const qualifier = found.className.replace(found.interfaceName, '').replace(/Impl$/, '')
  return qualifier === '' ? found.className : qualifier
}

function packagePathOf(file: string): string {
  return relative(LIB_DIRECTORY, dirname(file)).split('/').join('.')
}

function isUnder(file: string, directory: string): boolean {
  const path = relative(directory, file)
  return path !== '' && !path.startsWith('..') && !path.startsWith('/')
}

function displayPath(file: string): string {
  const path = relative(ROOT, file)
  if (!path.startsWith('node_modules/')) return path
  const [, scope, name] = path.split('/')
  return scope?.startsWith('@') === true ? `${scope}/${name ?? ''}` : (scope ?? path)
}

function sourceFile(project: Project, file: string): SourceFile {
  const found = project.program.getSourceFile(file)
  if (found === undefined) throw new Error(`${displayPath(file)} is not in the tsconfig program`)
  return found
}

function declarationsIn(project: Project, file: string): readonly Node[] {
  return sourceFile(project, file).statements
}

function libFiles(project: Project): string[] {
  return project.program
    .getSourceFileNames()
    .filter((file) => isUnder(file, LIB_DIRECTORY) && !file.endsWith('.test.ts'))
    .sort()
}

function resolvedSymbol(checker: Checker, node: Node): TsSymbol {
  const symbol = checker.getSymbolAtLocation(node)
  if (symbol === undefined) throw new Error(`No symbol at ${node.getText()}`)
  return symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

function declarationOf(checker: Checker, node: Node): Node | undefined {
  const [handle] = resolvedSymbol(checker, node).declarations
  return handle?.resolve()
}

function diffCells(committed: string, generated: string): string[] {
  const parse = (xml: string): Map<string, string> =>
    new Map(
      [...xml.matchAll(/<mxCell id="([^"]+)"[^\n]*/g)].flatMap(([line, id]) =>
        id === undefined ? [] : [[id, line]],
      ),
    )
  const before = parse(committed)
  const after = parse(generated)
  const differences: string[] = []
  for (const [id, line] of after) {
    const old = before.get(id)
    if (old === undefined) differences.push(`${id}: missing from the committed file`)
    else if (old !== line) differences.push(`${id}: differs`)
  }
  for (const id of before.keys()) {
    if (!after.has(id)) differences.push(`${id}: not generated from the code`)
  }
  if (differences.length === 0 && committed !== generated) {
    differences.push('the file differs outside its cells')
  }
  return differences
}

const check = process.argv.includes('--check')
const api = new API({ cwd: ROOT })
let outputs: Map<string, string>
let library: DiagramLibrary
try {
  const snapshot = api.updateSnapshot({ openProjects: [join(ROOT, 'tsconfig.json')] })
  const [project] = snapshot.getProjects()
  if (project === undefined) throw new Error('tsconfig.json opened no project')
  library = readDiagramLibrary(project)
  outputs = renderDiagramLibrary(library)
} finally {
  api.close()
}

if (library.providers.length < 10 || library.entities.length < 3) {
  console.error(
    `Diagram library found ${library.providers.length.toString()} providers and ${library.entities.length.toString()} entities, too few to trust its own scan`,
  )
  process.exit(2)
}
const generated = new Set([...outputs.keys()].flatMap((file) => [file, `${file}.png`]))
const strays = filesUnder(OUTPUT_DIRECTORY).filter((file) => !generated.has(file))
if (check) {
  const problems: string[] = []
  for (const [file, output] of outputs) {
    if (!existsSync(file)) {
      problems.push(`${displayPath(file)}: missing`)
      continue
    }
    for (const difference of diffCells(readFileSync(file, 'utf8'), output)) {
      problems.push(`${displayPath(file)}: ${difference}`)
    }
  }
  for (const stray of strays) problems.push(`${displayPath(stray)}: not generated from the code`)
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem)
    console.error(`${displayPath(OUTPUT_DIRECTORY)} is stale: run yarn diagram-library`)
    process.exit(1)
  }
  console.log(
    `${displayPath(OUTPUT_DIRECTORY)} matches the code in ${outputs.size.toString()} files`,
  )
} else {
  for (const provider of library.providers) {
    const relation =
      provider.relation === 'standalone'
        ? provider.relation
        : `${provider.relation} ${provider.interfacePackagePath}.${provider.interfaceName}`
    console.log(
      `provider ${provider.id}: ${provider.packagePath}.${provider.className} ${relation}, ${provider.properties.length.toString()} properties, ${provider.methods.length.toString()} methods, built by ${provider.runtimes.join(' and ')}`,
    )
  }
  for (const excluded of library.excludedClasses) {
    console.log(`excluded ${excluded.className}: ${excluded.reason}`)
  }
  for (const entity of library.entities) {
    console.log(
      `entity ${entity.id}: ${entity.packagePath}.${entity.typeName}, ${entity.fields.length.toString()} fields`,
    )
  }
  for (const [file, output] of outputs) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, output)
    console.log(`Wrote ${displayPath(file)}`)
    if (!pairIsFresh(file)) {
      execFileSync('drawio-cli', ['render', file], { stdio: 'ignore' })
      if (!pairIsFresh(file)) throw new Error(`${displayPath(file)} rendered a stale PNG`)
      console.log(`Rendered ${displayPath(file)}.png`)
    }
  }
  let unknown = false
  for (const stray of strays) {
    if (stray.endsWith(`/${OUTPUT_NAME}`) || stray.endsWith(`/${RENDERED_NAME}`)) {
      unlinkSync(stray)
      console.log(`Deleted ${displayPath(stray)}`)
    } else {
      console.error(`${displayPath(stray)} is not generated from the code: remove it by hand`)
      unknown = true
    }
  }
  removeEmptyDirectories(OUTPUT_DIRECTORY)
  if (unknown) process.exit(1)
}

/** Every file under the directory, an absent directory holding none. */
function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
}

/** Whether the PNG beside the file carries the file's model, as `drawio-cli check-pair` judges it. */
function pairIsFresh(file: string): boolean {
  try {
    execFileSync('drawio-cli', ['check-pair', file], { stdio: 'ignore' })
    return true
  } catch (error: unknown) {
    if (error instanceof Error && 'status' in error && error.status === 1) return false
    throw error
  }
}

function removeEmptyDirectories(directory: string): void {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirectories(join(directory, entry.name))
  }
  if (readdirSync(directory).length === 0) rmdirSync(directory)
}
