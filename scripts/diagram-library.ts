// Generates docs/diagram-library.drawio: one provider container per service provider
// `createBackend()` builds and one entity container per repository resource, read from the code
// through the TypeScript checker. `yarn diagram-library` writes it, and `yarn diagram-library:check`
// (part of `yarn check`) exits 1 when the committed file differs from a fresh generation. The
// cells carry the palette's styles byte for byte, so an action flow copies them unchanged.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  isCallExpression,
  isClassDeclaration,
  isFunctionDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isMethodSignatureDeclaration,
  isNewExpression,
  isTypeAliasDeclaration,
  isTypeReferenceNode,
  type ClassDeclaration,
  type InterfaceDeclaration,
  type MethodSignatureDeclaration,
  type Node,
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

interface Provider {
  readonly id: string
  readonly className: string
  readonly interfaceName: string
  readonly packagePath: string
  readonly methods: readonly ProviderMethod[]
}

interface ProviderMethod {
  readonly name: string
  /** Each parameter as the interface spells it, type parameters of an aliased generic substituted. */
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
const LIB_DIRECTORY = join(ROOT, 'src/lib')
const REPOSITORY_FILE = join(ROOT, 'src/lib/repository/repository.ts')
const EVENT_FILE = join(ROOT, 'src/lib/event/event.ts')
const OUTPUT_FILE = join(ROOT, 'docs/diagram-library.drawio')

function readDiagramLibrary(project: Project): DiagramLibrary {
  const checker = project.checker
  const backend = sourceFile(project, BACKEND_FILE)
  const providers: Provider[] = []
  const excludedClasses: ExcludedClass[] = []
  const interfaceKeys = new Map<string, string>()
  const implementations = instantiatedClasses(checker, backend).map((declaration) =>
    implementation(project, declaration),
  )
  const implementationCounts = new Map<string, number>()
  for (const found of implementations) {
    if ('reason' in found) continue
    const key = `${found.packagePath}.${found.interfaceName}`
    const clash = interfaceKeys.get(found.interfaceName)
    if (clash !== undefined && clash !== key) {
      throw new Error(`Two interfaces named ${found.interfaceName}: ${clash} and ${key}`)
    }
    interfaceKeys.set(found.interfaceName, key)
    implementationCounts.set(key, (implementationCounts.get(key) ?? 0) + 1)
  }
  for (const found of implementations) {
    if ('reason' in found) {
      excludedClasses.push(found)
      continue
    }
    const shared =
      (implementationCounts.get(`${found.packagePath}.${found.interfaceName}`) ?? 0) > 1
    const key = shared
      ? `${kebab(found.interfaceName)}-${kebab(implementationQualifier(found))}`
      : kebab(found.interfaceName)
    providers.push({ ...found, id: `provider-${key}` })
  }
  const entities = entityTypes(project).map((alias) => readEntity(project, alias))
  return { providers, excludedClasses, entities }
}

type Implementation = Omit<Provider, 'id'>

/**
 * Every class `createBackend()` instantiates, following calls into the functions backend.ts
 * declares, in the order the walk first meets each class.
 */
function instantiatedClasses(checker: Checker, backend: SourceFile): Instantiated[] {
  const functions = new Map<string, Node>()
  for (const statement of backend.statements) {
    if (isFunctionDeclaration(statement) && statement.name !== undefined) {
      functions.set(statement.name.text, statement)
    }
  }
  const entry = functions.get('createBackend')
  if (entry === undefined) throw new Error('backend.ts declares no createBackend()')
  const visited = new Set<string>(['createBackend'])
  const queue: Node[] = [entry]
  const classes: Instantiated[] = []
  const seen = new Set<string>()
  const visit = (node: Node): void => {
    if (isCallExpression(node) && isIdentifier(node.expression)) {
      const callee = node.expression.text
      const declaration = functions.get(callee)
      if (declaration !== undefined && !visited.has(callee)) {
        visited.add(callee)
        queue.push(declaration)
      }
    }
    if (isNewExpression(node)) {
      const instantiated = classDeclarationOf(checker, node.expression)
      const key =
        'globalName' in instantiated
          ? instantiated.globalName
          : `${instantiated.getSourceFile().fileName}:${instantiated.pos.toString()}`
      if (!seen.has(key)) {
        seen.add(key)
        classes.push(instantiated)
      }
    }
    node.forEachChild(visit)
  }
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) visit(next)
  return classes
}

/** A class declaration, or a runtime global declared as a variable plus an interface (`Error`). */
type Instantiated = ClassDeclaration | { readonly globalName: string }

function classDeclarationOf(checker: Checker, expression: Node): Instantiated {
  const symbol = resolvedSymbol(checker, expression)
  for (const handle of symbol.declarations) {
    const declaration = handle.resolve()
    if (declaration !== undefined && isClassDeclaration(declaration)) return declaration
  }
  return { globalName: symbol.name }
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
  const implemented = (declaration.heritageClauses ?? [])
    .filter((clause) => clause.token === SyntaxKind.ImplementsKeyword)
    .flatMap((clause) => [...clause.types])
  const libInterfaces = implemented.filter((type) => {
    const target = declarationOf(project.checker, type.expression)
    return target !== undefined && isUnder(target.getSourceFile().fileName, LIB_DIRECTORY)
  })
  if (libInterfaces.length === 0) {
    const named = implemented.map((type) => type.expression.getText()).join(', ')
    return {
      className,
      reason:
        named === ''
          ? 'implements no interface'
          : `implements only interfaces declared outside src/lib (${named})`,
    }
  }
  if (libInterfaces.length > 1) {
    throw new Error(
      `${className} implements several src/lib interfaces, which one container cannot show`,
    )
  }
  const [implementedType] = libInterfaces
  if (implementedType === undefined) throw new Error(`${className} lost its implements clause`)
  const target = declarationOf(project.checker, implementedType.expression)
  if (target === undefined || !(isInterfaceDeclaration(target) || isTypeAliasDeclaration(target))) {
    throw new Error(`${className} implements something that is neither an interface nor an alias`)
  }
  const { members, substitutions } = interfaceMembers(project, target)
  return {
    className,
    interfaceName: target.name.text,
    packagePath: packagePathOf(target.getSourceFile().fileName),
    methods: members.map((member) => providerMethod(project, member, substitutions)),
  }
}

/**
 * The interface's method declarations in source order, reached through a type alias of a
 * generic interface (`Repository<Deposit>`) with each type parameter mapped to its argument.
 */
function interfaceMembers(
  project: Project,
  target: InterfaceDeclaration | TypeAliasDeclaration,
): { members: MethodSignatureDeclaration[]; substitutions: Map<number, string> } {
  const substitutions = new Map<number, string>()
  let declaration: InterfaceDeclaration
  if (isTypeAliasDeclaration(target)) {
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
    declaration = resolved
    const parameters = resolved.typeParameters ?? []
    const argumentsGiven = aliased.typeArguments ?? []
    parameters.forEach((parameter, index) => {
      const argument = argumentsGiven[index]
      const symbol = project.checker.getSymbolAtLocation(parameter.name)
      if (argument !== undefined && symbol !== undefined) {
        substitutions.set(symbol.id, argument.getText())
      }
    })
  } else {
    declaration = target
  }
  return { members: ownAndInheritedMethods(project, declaration), substitutions }
}

/** The interface's own methods in source order, then each inherited method it does not redeclare. */
function ownAndInheritedMethods(
  project: Project,
  declaration: InterfaceDeclaration,
): MethodSignatureDeclaration[] {
  const own = declaration.members.map((member) => {
    if (isMethodSignatureDeclaration(member)) return member
    throw new Error(
      `${declaration.name.text} has a member that is not a method: ${member.getText()}`,
    )
  })
  const names = new Set(own.map((member) => member.name.getText()))
  const inherited = (declaration.heritageClauses ?? [])
    .flatMap((clause) => [...clause.types])
    .flatMap((type) => {
      if ((type.typeArguments ?? []).length > 0) {
        throw new Error(
          `${declaration.name.text} extends a generic interface, which the library does not instantiate`,
        )
      }
      const base = declarationOf(project.checker, type.expression)
      if (base === undefined || !isInterfaceDeclaration(base)) {
        throw new Error(`${declaration.name.text} extends something other than an interface`)
      }
      return ownAndInheritedMethods(project, base)
    })
    .filter((member) => !names.has(member.name.getText()))
  return [...own, ...inherited]
}

function providerMethod(
  project: Project,
  member: MethodSignatureDeclaration,
  substitutions: Map<number, string>,
): ProviderMethod {
  const name = member.name.getText()
  const spell = (type: TypeNode): string => spellTypeNode(project.checker, type, substitutions)
  const parameters = member.parameters.map((parameter) => {
    if (parameter.type === undefined) throw new Error(`${name} has an untyped parameter`)
    const optional = parameter.questionToken === undefined ? '' : '?'
    const rest = parameter.dotDotDotToken === undefined ? '' : '...'
    return `${rest}${parameter.name.getText()}${optional}: ${spell(parameter.type)}`
  })
  if (member.type === undefined) throw new Error(`${name} declares no return type`)
  return { name, parameters, returnType: spell(unwrapPromise(project, member.type)) }
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
  substitutions: Map<number, string>,
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

/** The library rendered as a drawio file. */
function renderDiagramLibrary(library: DiagramLibrary): string {
  const cells: string[] = [
    textCell(
      'library-title',
      TITLE,
      TITLE_STYLE,
      MARGIN,
      MARGIN,
      textWidth(TITLE, TITLE_FONT) + 20,
      30,
    ),
  ]
  let y = MARGIN + 30 + SECTION_GAP
  const section = (sectionName: string, sectionId: string, members: readonly Container[]): void => {
    const groups = [...groupByPackage(members)].sort(([a], [b]) => a.localeCompare(b))
    for (const row of packSection(sectionName, groups)) {
      let x = MARGIN
      for (const block of row) {
        const heading = `${sectionName}: ${block.packagePath}`
        cells.push(
          textCell(
            `heading-${sectionId}-${kebab(block.packagePath.replaceAll('.', '-'))}`,
            heading,
            HEADING_STYLE,
            x,
            y,
            headingWidth(heading),
            HEADING_HEIGHT,
          ),
        )
        let columnX = x
        for (const column of block.columns) {
          let columnY = y + HEADING_HEIGHT + HEADING_GAP
          for (const container of column) {
            cells.push(...containerCells(container, columnX, columnY))
            columnY += container.height + CONTAINER_GAP
          }
          columnX += columnWidth(column) + CONTAINER_GAP
        }
        x += blockWidth(block, sectionName) + CONTAINER_GAP
      }
      y += Math.max(...row.map(blockHeight)) + SECTION_GAP
    }
  }
  section('Service providers', 'providers', library.providers.map(providerContainer))
  section('Entities', 'entities', library.entities.map(entityContainer))
  const ids = new Set<string>()
  for (const [, id] of cells.join('\n').matchAll(/<mxCell id="([^"]+)"/g)) {
    if (id === undefined || ids.has(id)) throw new Error(`Two cells share the id ${id ?? ''}`)
    ids.add(id)
  }
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
  readonly packagePath: string
  /** The header's HTML value: plain text broken with `<br>`. */
  readonly header: string
  readonly headerHeight: number
  readonly rows: readonly { readonly id: string; readonly value: string; readonly height: number }[]
  readonly width: number
  readonly height: number
}

const TITLE =
  'Diagram library: generated by scripts/diagram-library.ts from the code, never edited by hand'
const MARGIN = 40
const WORKING_WIDTH = 1300
const CONTAINER_GAP = 40
const SECTION_GAP = 40
const HEADING_GAP = 10
const HEADING_HEIGHT = 20
/** The tallest column the packer tries, past any single container's height. */
const MAX_COLUMN_BUDGET = 3000
const PROVIDER_HEADER = 65
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
  const header = [
    provider.className,
    `&lt;${escapeHtml(provider.packagePath)}.`,
    `${escapeHtml(provider.interfaceName)}&gt;`,
  ]
  const rows = provider.methods.map((method) => {
    const lines =
      method.parameters.length === 0
        ? [`${escapeHtml(method.name)}() (${escapeHtml(method.returnType)})`]
        : [
            `${escapeHtml(method.name)}(`,
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
  return buildContainer(provider.id, provider.packagePath, header, PROVIDER_HEADER, rows)
}

function entityContainer(entity: Entity): Container {
  const header = [`${escapeHtml(entity.packagePath)}.`, escapeHtml(entity.typeName)]
  const rows = entity.fields.map((field) => ({
    id: `${entity.id}-${kebab(field.name.replace('?', ''))}`,
    value: escapeHtml(`${field.name}: ${field.type}`),
    height: FIELD_ROW,
  }))
  return buildContainer(entity.id, entity.packagePath, header, ENTITY_HEADER, rows)
}

function buildContainer(
  id: string,
  packagePath: string,
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
  return { id, packagePath, header: header.join('<br>'), headerHeight, rows, width, height }
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

/** One package's containers, stacked into columns under one heading. */
interface Block {
  readonly packagePath: string
  readonly columns: readonly (readonly Container[])[]
}

/**
 * Lays a section's packages out as blocks on shelves no wider than the working width, trying
 * every column height budget and keeping the one that makes the section shortest.
 */
function packSection(
  sectionName: string,
  groups: readonly [string, readonly Container[]][],
): Block[][] {
  const tallest = Math.max(
    ...groups.flatMap(([, members]) => members.map((container) => container.height)),
  )
  let best: { rows: Block[][]; height: number } | undefined
  for (let budget = tallest; budget <= MAX_COLUMN_BUDGET; budget += 10) {
    const blocks = groups.map(([packagePath, members]) => packBlock(packagePath, members, budget))
    const rows: Block[][] = []
    let row: Block[] = []
    let width = 0
    for (const block of blocks) {
      const blockSpan = blockWidth(block, sectionName)
      if (row.length > 0 && width + CONTAINER_GAP + blockSpan > WORKING_WIDTH) {
        rows.push(row)
        row = []
        width = 0
      }
      width += (row.length > 0 ? CONTAINER_GAP : 0) + blockSpan
      row.push(block)
    }
    rows.push(row)
    const height = rows.reduce(
      (total, shelf) => total + Math.max(...shelf.map(blockHeight)) + SECTION_GAP,
      0,
    )
    if (best === undefined || height < best.height) best = { rows, height }
  }
  if (best === undefined) throw new Error('No column budget fits the section')
  return best.rows
}

/** Fills columns in order, starting a new one when the next container would pass the budget. */
function packBlock(packagePath: string, members: readonly Container[], budget: number): Block {
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
  return { packagePath, columns }
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

/** The block's columns, or its heading when that runs wider. */
function blockWidth(block: Block, sectionName: string): number {
  const columns = block.columns.reduce(
    (total, column) => total + columnWidth(column),
    CONTAINER_GAP * (block.columns.length - 1),
  )
  return Math.max(columns, headingWidth(`${sectionName}: ${block.packagePath}`))
}

function blockHeight(block: Block): number {
  return HEADING_HEIGHT + HEADING_GAP + Math.max(...block.columns.map(columnHeight))
}

function headingWidth(heading: string): number {
  return Math.ceil(textWidth(heading, HEADING_FONT)) + 20
}

function groupByPackage(containers: readonly Container[]): Map<string, Container[]> {
  const groups = new Map<string, Container[]>()
  for (const container of containers) {
    groups.set(container.packagePath, [...(groups.get(container.packagePath) ?? []), container])
  }
  return groups
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
function implementationQualifier(found: Implementation): string {
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
let output: string
let library: DiagramLibrary
try {
  const snapshot = api.updateSnapshot({ openProjects: [join(ROOT, 'tsconfig.json')] })
  const [project] = snapshot.getProjects()
  if (project === undefined) throw new Error('tsconfig.json opened no project')
  library = readDiagramLibrary(project)
  output = renderDiagramLibrary(library)
} finally {
  api.close()
}

if (library.providers.length < 10 || library.entities.length < 3) {
  console.error(
    `Diagram library found ${library.providers.length.toString()} providers and ${library.entities.length.toString()} entities, too few to trust its own scan`,
  )
  process.exit(2)
}
if (check) {
  let committed = ''
  try {
    committed = readFileSync(OUTPUT_FILE, 'utf8')
  } catch (error: unknown) {
    console.error(`Cannot read ${displayPath(OUTPUT_FILE)}`, error)
    process.exit(1)
  }
  const differences = diffCells(committed, output)
  if (differences.length > 0) {
    for (const difference of differences) console.error(difference)
    console.error(`${displayPath(OUTPUT_FILE)} is stale: run yarn diagram-library`)
    process.exit(1)
  }
  console.log(`${displayPath(OUTPUT_FILE)} matches the code`)
} else {
  for (const provider of library.providers) {
    console.log(
      `provider ${provider.id}: ${provider.className} implements ${provider.packagePath}.${provider.interfaceName}, ${provider.methods.length.toString()} methods`,
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
  writeFileSync(OUTPUT_FILE, output)
  console.log(`Wrote ${displayPath(OUTPUT_FILE)}`)
}
