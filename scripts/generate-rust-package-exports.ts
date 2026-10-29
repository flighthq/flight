import { parseSync } from 'oxc-parser';

export interface ExportModule {
  directPublicExports?: boolean;
  fileName: string;
  mode: 'generate' | 'rust-only' | 'target-native';
  typescript?: string;
}

export interface ExportSymbolOwner {
  fileName: string;
  hasType: boolean;
  hasValue: boolean;
  isClass?: boolean;
}

interface ResolvedExports {
  types: string[];
  values: string[];
}

export interface ExternalContract {
  exportNames: ReadonlyMap<string, string>;
  module: string;
  symbols: ReadonlyMap<string, Omit<ExportSymbolOwner, 'fileName'>>;
}

export interface ResolvedExternalContractExports {
  output: string;
  symbols: Map<string, ExportSymbolOwner>;
}

// A Rust source of another package and that package's contract module.
export interface DependencySource {
  module: string;
  path: string;
}

export interface RustPublicUse {
  moduleName: string;
  name?: string;
  wildcard: boolean;
}

export function compilerAliasArguments(command: string, aliasSources: readonly string[], source?: string): string[] {
  if (command !== 'generate' && command !== 'generate-tests') return [];
  return aliasSources
    .filter((aliasSource) => aliasSource !== source)
    .flatMap((aliasSource) => ['--alias-source', aliasSource]);
}

// The crate's other Rust sources (target-native modules, the crate root, nested modules), which the
// compiler reads only for whole-crate facts: an `impl`, derive, attribute or macro in any of them can
// change what an eagerly initialized `LazyLock` runs. Only `generate` emits a module, so only it takes
// them; the emitted source and its alias sources are already read in full.
export function compilerVisibilityArguments(
  command: string,
  crateSources: readonly string[],
  aliasSources: readonly string[],
  source?: string,
): string[] {
  if (command !== 'generate') return [];
  const emitted = new Set(aliasSources);
  return crateSources
    .filter((crateSource) => crateSource !== source && !emitted.has(crateSource))
    .flatMap((crateSource) => ['--visibility-source', crateSource]);
}

// `flight-*` crates a Cargo manifest depends on: `[dependencies]`, plus `[dev-dependencies]` when the
// caller generates tests. Sorted and unique.
export function collectFlightDependencyCrates(cargoToml: string, includeDevelopment: boolean): string[] {
  const crates = new Set<string>();
  let section = '';
  for (const line of cargoToml.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      section = header[1].trim();
      continue;
    }
    if (section !== 'dependencies' && !(includeDevelopment && section === 'dev-dependencies')) continue;
    const dependency = /^\s*(flight-[a-z0-9-]+)(?:\.[A-Za-z0-9_-]+)*\s*=/.exec(line);
    if (dependency) crates.add(dependency[1]);
  }
  return [...crates].sort();
}

// The crate-internal symbols each generated module exports through `export { … };` / `export type { … };`
// lists: crate-visible Rust items a sibling module references, and module-owned runtime stores. They
// resolve intra-package imports only; the public lanes read `export <declaration>` lines alone, so these
// never reach `contract.ts` or `index.ts`.
export function collectCrateExportSymbols(modules: readonly ExportModule[]): Map<string, ExportSymbolOwner[]> {
  const symbols = new Map<string, ExportSymbolOwner[]>();
  for (const module of modules) {
    if (module.typescript === undefined) continue;
    for (const match of module.typescript.matchAll(/^export (type )?\{([^}]*)\};?$/gm)) {
      for (const specifier of match[2].split(',')) {
        const name = specifier.trim();
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) continue;
        const owners = symbols.get(name) ?? [];
        let owner = owners.find((candidate) => candidate.fileName === module.fileName);
        if (owner === undefined) {
          owner = { fileName: module.fileName, hasType: false, hasValue: false };
          owners.push(owner);
        }
        if (match[1] === undefined) owner.hasValue = true;
        owner.hasType ||= match[1] !== undefined;
        symbols.set(name, owners);
      }
    }
  }
  return symbols;
}

// The crate-internal symbols one module may import, resolved through its own Rust paths. Rust reaches a
// sibling's crate-visible item only by naming its module, so a symbol resolves to the module the source
// names in `use crate::<module>::…` / `use super::<module>::…` (directly, grouped, renamed or by glob) or
// in a `<module>::Name` path. Same-named items of other modules, and the module's own declarations, never
// resolve.
export function resolveCrateExportSymbols(
  rust: string,
  ownFileName: string,
  owners: ReadonlyMap<string, readonly ExportSymbolOwner[]>,
): Map<string, ExportSymbolOwner> {
  const qualified = new Map<string, string>();
  const globModules = new Set<string>();
  for (const match of rust.matchAll(
    /^use (?:crate|super)::([a-z0-9_]+)::(\{[^}]*\}|[A-Za-z0-9_*]+(?:\s+as\s+[A-Za-z0-9_]+)?);/gm,
  )) {
    const fileName = `${snakeToLowerCamel(match[1])}.ts`;
    const items = match[2].startsWith('{') ? match[2].slice(1, -1).split(',') : [match[2]];
    for (const item of items) {
      const original = item
        .trim()
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (!original) continue;
      if (original === '*') globModules.add(fileName);
      else qualified.set(snakeToLowerCamel(original), fileName);
    }
  }
  for (const match of rust.matchAll(/\b([a-z0-9_]+)::([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    if (match[1] === 'crate' || match[1] === 'super' || match[1] === 'self') continue;
    const name = snakeToLowerCamel(match[2]);
    if (!qualified.has(name)) qualified.set(name, `${snakeToLowerCamel(match[1])}.ts`);
  }
  const resolved = new Map<string, ExportSymbolOwner>();
  for (const [name, candidates] of owners) {
    if (candidates.some((owner) => owner.fileName === ownFileName)) continue;
    const named = qualified.get(name);
    const owner =
      named !== undefined
        ? candidates.find((candidate) => candidate.fileName === named)
        : candidates.filter((candidate) => globModules.has(candidate.fileName)).length === 1
          ? candidates.find((candidate) => globModules.has(candidate.fileName))
          : undefined;
    if (owner !== undefined) resolved.set(name, owner);
  }
  return resolved;
}

export function collectExportSymbols(modules: readonly ExportModule[]): Map<string, ExportSymbolOwner> {
  const symbols = new Map<string, ExportSymbolOwner>();
  for (const module of modules) {
    if (module.typescript === undefined) continue;
    const pattern = /^export (class|function|const|enum|interface|type) ([A-Za-z0-9_]+)/gm;
    for (const match of module.typescript.matchAll(pattern)) {
      const owner = symbols.get(match[2]) ?? {
        fileName: module.fileName,
        hasType: false,
        hasValue: false,
        isClass: false,
      };
      if (owner.fileName !== module.fileName) {
        throw new Error(`duplicate generated symbol ${match[2]} in ${owner.fileName} and ${module.fileName}`);
      }
      const kind = match[1];
      owner.hasType ||= kind === 'class' || kind === 'enum' || kind === 'interface' || kind === 'type';
      owner.hasValue ||= kind === 'class' || kind === 'const' || kind === 'enum' || kind === 'function';
      owner.isClass ||= kind === 'class';
      symbols.set(match[2], owner);
    }
  }
  return symbols;
}

// Export declarations from one TypeScript module. Star exports are resolved by the package generator,
// which owns filesystem traversal; named re-exports are classified here so a Rust dependency re-export
// keeps type-only names type-only under verbatim module syntax.
export function collectTypeScriptExportSymbols(typescript: string): Map<string, Omit<ExportSymbolOwner, 'fileName'>> {
  const symbols = new Map<string, Omit<ExportSymbolOwner, 'fileName'>>();

  function add(name: string, hasType: boolean, hasValue: boolean, isClass = false): void {
    const owner = symbols.get(name) ?? { hasType: false, hasValue: false, isClass: false };
    owner.hasType ||= hasType;
    owner.hasValue ||= hasValue;
    owner.isClass ||= isClass;
    symbols.set(name, owner);
  }

  for (const match of typescript.matchAll(/^export (class|function|const|enum|interface|type) ([A-Za-z0-9_]+)/gm)) {
    const kind = match[1];
    add(
      match[2],
      kind === 'class' || kind === 'enum' || kind === 'interface' || kind === 'type',
      kind === 'class' || kind === 'const' || kind === 'enum' || kind === 'function',
      kind === 'class',
    );
  }

  for (const match of typescript.matchAll(/^export\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+['"][^'"]+['"];?/gm)) {
    const groupTypeOnly = match[1] !== undefined;
    for (const item of match[2].split(',')) {
      const declaration = item.trim();
      if (declaration.length === 0) continue;
      const itemTypeOnly = groupTypeOnly || declaration.startsWith('type ');
      const fields = declaration.replace(/^type\s+/, '').split(/\s+as\s+/);
      const name = fields.at(-1)?.trim();
      if (name && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) add(name, itemTypeOnly, !itemTypeOnly);
    }
  }

  return symbols;
}

export function resolveExternalContractExports(
  uses: readonly RustPublicUse[],
  contracts: ReadonlyMap<string, ExternalContract>,
): ResolvedExternalContractExports {
  const resolved = new Map<string, ResolvedExports>();
  const symbols = new Map<string, ExportSymbolOwner>();

  for (const rustUse of uses.filter((candidate) => candidate.moduleName.startsWith('flight_'))) {
    const contract = contracts.get(rustUse.moduleName);
    if (!contract)
      throw new Error(`external Rust contract ${rustUse.moduleName} has no TypeScript dependency contract`);
    const names = rustUse.wildcard
      ? [...contract.symbols.keys()]
      : [resolveRustExportName(rustUse.name ?? '', dependencyOwners(contract), contract.exportNames)];
    const entry = resolved.get(contract.module) ?? { types: [], values: [] };
    for (const name of names) {
      const owner = contract.symbols.get(name);
      if (!owner) throw new Error(`external contract export ${name} is not exported by ${contract.module}`);
      const previous = symbols.get(name);
      if (previous && (previous.hasType !== owner.hasType || previous.hasValue !== owner.hasValue)) {
        throw new Error(`external contract export ${name} has conflicting declarations`);
      }
      symbols.set(name, { ...owner, fileName: 'contract.ts' });
      (owner.hasValue ? entry.values : entry.types).push(name);
    }
    resolved.set(contract.module, entry);
  }

  let output = '';
  for (const [module, exports] of [...resolved].sort(([left], [right]) => left.localeCompare(right))) {
    const values = [...new Set(exports.values)].sort();
    const types = [...new Set(exports.types)].sort();
    if (values.length > 0) output += `export { ${values.join(', ')} } from '${module}';\n`;
    if (types.length > 0) output += `export type { ${types.join(', ')} } from '${module}';\n`;
  }
  return { output, symbols };
}

function dependencyOwners(contract: ExternalContract): Map<string, ExportSymbolOwner> {
  return new Map([...contract.symbols].map(([name, owner]) => [name, { ...owner, fileName: contract.module }]));
}

export function renderCompanionContractExports(
  modules: readonly ExportModule[],
  symbols: ReadonlyMap<string, ExportSymbolOwner>,
): string {
  let output = '';
  for (const module of modules
    .filter((candidate) => candidate.directPublicExports)
    .sort((a, b) => a.fileName.localeCompare(b.fileName))) {
    const wrappers = [...symbols]
      .filter(([name, owner]) => owner.fileName === module.fileName && owner.hasType && symbols.has(`${name}Raw`))
      .sort(([left], [right]) => left.localeCompare(right));
    const values = wrappers.filter(([, owner]) => owner.hasValue).map(([name]) => name);
    const types = wrappers.filter(([, owner]) => !owner.hasValue).map(([name]) => name);
    if (values.length > 0) {
      output += `export { ${values.join(', ')} } from './${module.fileName}';\n`;
    }
    if (types.length > 0) {
      output += `export type { ${types.join(', ')} } from './${module.fileName}';\n`;
    }
  }
  return output;
}

// `//! flight-compiler: export-name <rust_item> <TypeScriptName>` directives of one Rust source. The
// compiler validates them when it generates the source; this reads the same mapping for re-exports.
export function collectRustExportNames(rust: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const match of rust.matchAll(/^\/\/!\s*flight-compiler:\s*export-name\s+(\S+)\s+(\S+)\s*$/gm)) {
    names.set(match[1], match[2]);
  }
  return names;
}

export function collectReferencedExportNames(
  typescript: string,
  ownFileName: string,
  symbols: ReadonlyMap<string, ExportSymbolOwner>,
): string[] {
  const code = referencedCode(typescript);
  const localBindings = collectLocalBindingNames(typescript);
  return [...symbols]
    .filter(([, owner]) => owner.fileName !== ownFileName)
    .filter(([name]) => !localBindings.has(name))
    .filter(([name]) => new RegExp(`\\b${name}\\b`).test(code))
    .map(([name]) => name)
    .sort();
}

export function renderGeneratedImports(
  rust: string,
  typescript: string,
  ownFileName: string,
  symbols: ReadonlyMap<string, ExportSymbolOwner>,
): string {
  const code = referencedCode(typescript);
  const importedNames = new Set(collectReferencedExportNames(typescript, ownFileName, symbols));
  const valueReferences = collectValueReferenceNames(typescript);
  const rustImports = new Set<string>();
  for (const match of rust.matchAll(/^use crate::(?:[A-Za-z0-9_]+::)?([A-Za-z0-9_]+);$/gm)) {
    rustImports.add(snakeToLowerCamel(match[1]));
  }
  for (const match of rust.matchAll(/^use crate::(?:[A-Za-z0-9_]+::)?\{([^}]+)\};$/gm)) {
    for (const name of match[1].split(',')) {
      const trimmed = name.trim();
      if (/^[A-Za-z0-9_]+$/.test(trimmed)) rustImports.add(snakeToLowerCamel(trimmed));
    }
  }
  for (const name of rustImports) {
    if (new RegExp(`\\b${name}\\b`).test(code)) importedNames.add(name);
  }

  const alreadyImported = collectImportedNames(typescript);
  const imports = new Map<string, { types: string[]; values: string[] }>();
  for (const name of importedNames) {
    if (alreadyImported.has(name)) continue;
    const owner = symbols.get(name);
    if (!owner || owner.fileName === ownFileName) continue;
    const entry = imports.get(owner.fileName) ?? { types: [], values: [] };
    // A symbol with both a value and a type (a const object paired with its union type, or a class) is
    // imported as a type when this file references it only in type positions.
    if (owner.hasValue && (!owner.hasType || valueReferences.has(name))) entry.values.push(name);
    else entry.types.push(name);
    imports.set(owner.fileName, entry);
  }

  let output = '';
  for (const [fileName, names] of [...imports].sort(([left], [right]) => left.localeCompare(right))) {
    if (names.types.length > 0) {
      output += `import type { ${names.types.sort().join(', ')} } from './${fileName}';\n`;
    }
    if (names.values.length > 0) {
      output += `import { ${names.values.sort().join(', ')} } from './${fileName}';\n`;
    }
  }
  return output.length === 0 ? output : output + '\n';
}

function referencedCode(typescript: string): string {
  return typescript
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '')
    .replace(/\.\s*[A-Za-z_$][A-Za-z0-9_$]*/g, '');
}

// Names the module references in value positions. Identifiers under a type annotation, type argument or
// other type node are type references, including a `typeof` operand, which TypeScript erases and a type
// import satisfies. The expression operand of `as`, `satisfies`, `!` and instantiation stays a value.
// Property names (`a.name`, `{ name: ... }`) and import declarations are not references.
function collectValueReferenceNames(typescript: string): Set<string> {
  const parsed = parseSync('generated.ts', typescript, { lang: 'ts', sourceType: 'module' });
  if (parsed.errors.length > 0) {
    throw new Error(`could not parse generated TypeScript while resolving imports: ${parsed.errors[0]?.message}`);
  }
  const expressionTypeNodes = new Set([
    'TSAsExpression',
    'TSInstantiationExpression',
    'TSNonNullExpression',
    'TSSatisfiesExpression',
    'TSTypeAssertion',
  ]);
  const names = new Set<string>();

  function visit(value: unknown, inType: boolean): void {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, inType);
      return;
    }
    const node = value as Record<string, unknown>;
    const type = node.type as string | undefined;
    if (type === 'ImportDeclaration') return;
    if (type === 'Identifier') {
      if (!inType) names.add(node.name as string);
      visit(node.typeAnnotation, true);
      return;
    }
    if (type !== undefined && expressionTypeNodes.has(type)) {
      visit(node.expression, false);
      visit(node.typeAnnotation, true);
      visit(node.typeArguments, true);
      return;
    }
    const childInType = inType || (type !== undefined && type.startsWith('TS'));
    for (const [key, child] of Object.entries(node)) {
      if (key === 'type') continue;
      if (
        (type === 'MemberExpression' && key === 'property' && node.computed !== true) ||
        ((type === 'Property' || type === 'PropertyDefinition' || type === 'MethodDefinition') &&
          key === 'key' &&
          node.computed !== true)
      ) {
        continue;
      }
      const typeKey =
        key === 'typeAnnotation' ||
        key === 'returnType' ||
        key === 'typeParameters' ||
        key === 'typeArguments' ||
        key === 'superTypeArguments';
      visit(child, childInType || typeKey);
    }
  }

  visit(parsed.program, false);
  return names;
}

// Names a module already binds through its own import declarations.
function collectImportedNames(typescript: string): Set<string> {
  const names = new Set<string>();
  for (const match of typescript.matchAll(/^import (?:type )?\{([^}]*)\} from /gm)) {
    for (const specifier of match[1].split(',')) {
      const local = specifier
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (local) names.add(local);
    }
  }
  return names;
}

function collectLocalBindingNames(typescript: string): Set<string> {
  const parsed = parseSync('generated.ts', typescript, { lang: 'ts', sourceType: 'module' });
  if (parsed.errors.length > 0) {
    throw new Error(`could not parse generated TypeScript while resolving imports: ${parsed.errors[0]?.message}`);
  }
  const bindings = new Set<string>();

  function addBinding(pattern: unknown): void {
    if (pattern === null || typeof pattern !== 'object') return;
    const node = pattern as Record<string, unknown>;
    switch (node.type) {
      case 'Identifier':
        bindings.add(node.name as string);
        return;
      case 'AssignmentPattern':
        addBinding(node.left);
        return;
      case 'RestElement':
        addBinding(node.argument);
        return;
      case 'ArrayPattern':
        for (const element of node.elements as unknown[]) addBinding(element);
        return;
      case 'ObjectPattern':
        for (const property of node.properties as Record<string, unknown>[]) {
          addBinding(property.type === 'RestElement' ? property.argument : property.value);
        }
        return;
    }
  }

  function visit(value: unknown): void {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const node = value as Record<string, unknown>;
    switch (node.type) {
      case 'ArrowFunctionExpression':
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        addBinding(node.id);
        for (const parameter of node.params as unknown[]) addBinding(parameter);
        break;
      case 'VariableDeclarator':
        addBinding(node.id);
        break;
      case 'CatchClause':
        addBinding(node.param);
        break;
    }
    for (const child of Object.values(node)) visit(child);
  }

  visit(parsed.program);
  return bindings;
}

export function collectCompanionFileNames(rust: string): string[] {
  const names: string[] = [];
  for (const match of rust.matchAll(/^\/\/!\s*flight-compiler:\s*companion\s+(.+)$/gm)) {
    names.push(...match[1].split(/[\s,]+/).filter(Boolean));
  }
  return [...new Set(names)];
}

export function collectContractModuleNames(rust: string): Set<string> {
  return new Set(
    collectRustPublicUses(rust)
      .filter((rustUse) => rustUse.moduleName !== 'contract')
      .map((rustUse) => rustUse.moduleName),
  );
}

export function collectPublicRootNames(rust: string): string[] {
  return [
    ...new Set(
      collectRustPublicUses(rust).flatMap((rustUse) =>
        rustUse.name === undefined ? [] : [snakeToLowerCamel(rustUse.name)],
      ),
    ),
  ].sort();
}

export function collectRustPublicUses(rust: string): RustPublicUse[] {
  const uses: RustPublicUse[] = [];
  for (const match of rust.matchAll(/pub\s+use\s+([\s\S]*?);/g)) {
    let tree = match[1].trim();
    tree = tree.replace(/^(?:crate|super)\s*::\s*/, '');
    expandUseTree(tree, [], uses);
  }
  return uses;
}

export function collectStaleGeneratedFileNames(
  files: ReadonlyMap<string, string>,
  expected: ReadonlySet<string>,
  generatedHeader: string,
): string[] {
  return [...files]
    .filter(([fileName]) => fileName.endsWith('.ts') && !expected.has(fileName))
    .filter(([, contents]) => contents.startsWith(generatedHeader))
    .map(([fileName]) => fileName)
    .sort();
}

// The `--external-alias-source` / `--external-alias-module` pairs that hand dependency sources to the
// compiler, so it imports their `export-name` items by the owner's TypeScript names.
export function dependencyAliasArguments(sources: readonly DependencySource[]): string[] {
  return sources.flatMap((source) => [
    '--external-alias-source',
    source.path,
    '--external-alias-module',
    source.module,
  ]);
}

// Whether a Rust source declares a `//! flight-compiler: const-group <Name> <PREFIX>` directive, whose
// members a consuming package must learn about to fail closed on importing them.
export function hasRustConstGroup(rust: string): boolean {
  return /^\/\/!\s*flight-compiler:\s*const-group\s+\S+\s+\S+\s*$/m.test(rust);
}

// Public record declarations are semantic inputs for declaration-derived compiler directives in a
// consuming crate (for example a structural union whose fallback payload is dependency-owned).
export function hasRustPublicRecordDeclaration(rust: string): boolean {
  return /^\s*pub\s+struct\s+[A-Za-z_][A-Za-z0-9_]*/m.test(rust);
}

// Target-native sources are not compiled. Union declarations can still govern a generated sibling,
// and they use the ordinary alias lane because their full declarations participate in lowering.
export function hasRustSiblingGenerationSemantics(rust: string): boolean {
  return /^\/\/!\s*flight-compiler:\s*(?:data-union|string-union(?:-value)?)\b/m.test(rust);
}

// Dependency sources additionally contribute nullable Option boundary declarations. The compiler
// reads those through its lightweight external-nullability lane, which deliberately does not parse
// unrelated target-native private storage as a portable alias source.
export function hasRustGenerationSemantics(rust: string): boolean {
  return hasRustSiblingGenerationSemantics(rust) || /^\/\/!\s*flight-compiler:\s*nullable-options?\b/m.test(rust);
}

export function hasGeneratedProvenanceHeader(contents: string): boolean {
  return contents.startsWith('// Generated from crates/');
}

function expandUseTree(tree: string, prefix: string[], output: RustPublicUse[]): void {
  const value = tree.trim();
  if (value.startsWith('{') && value.endsWith('}')) {
    for (const branch of splitTopLevel(value.slice(1, -1))) expandUseTree(branch, prefix, output);
    return;
  }
  const separator = topLevelPathSeparator(value);
  if (separator !== -1) {
    const segment = value.slice(0, separator).trim();
    expandUseTree(value.slice(separator + 2), [...prefix, segment], output);
    return;
  }
  const moduleName = prefix[0];
  if (!moduleName) return;
  if (value === '*') {
    output.push({ moduleName, wildcard: true });
  } else if (/^[A-Za-z0-9_]+$/.test(value)) {
    output.push({ moduleName, name: value, wildcard: false });
  }
}

function splitTopLevel(value: string): string[] {
  const output: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (character === ',' && depth === 0) {
      output.push(value.slice(start, index));
      start = index + 1;
    }
  }
  output.push(value.slice(start));
  return output.filter((branch) => branch.trim().length > 0);
}

function topLevelPathSeparator(value: string): number {
  let depth = 0;
  for (let index = 0; index + 1 < value.length; index += 1) {
    const character = value[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0 && character === ':' && value[index + 1] === ':') return index;
  }
  return -1;
}

export function snakeToLowerCamel(value: string): string {
  return value.replace(/_([a-z0-9][a-z0-9]*)/g, (_, word: string) => {
    const letter = word.search(/[a-z]/);
    if (letter === -1) return word;
    return word.slice(0, letter) + word[letter].toUpperCase() + word.slice(letter + 1);
  });
}

// One package's `export-name` mappings across its sources. Two sources naming one Rust item differently
// is a deterministic error.
export function mergeRustExportNames(sources: ReadonlyMap<string, ReadonlyMap<string, string>>): Map<string, string> {
  const merged = new Map<string, string>();
  const owners = new Map<string, string>();
  for (const [fileName, names] of [...sources].sort(([left], [right]) => left.localeCompare(right))) {
    for (const [rustName, typescriptName] of names) {
      const previous = merged.get(rustName);
      if (previous !== undefined && previous !== typescriptName) {
        throw new Error(
          `export-name ${rustName} is ${previous} in ${owners.get(rustName)} and ${typescriptName} in ${fileName}`,
        );
      }
      merged.set(rustName, typescriptName);
      owners.set(rustName, fileName);
    }
  }
  return merged;
}

export function renderPublicExports(
  modules: readonly ExportModule[],
  symbols: ReadonlyMap<string, ExportSymbolOwner>,
  roots: readonly string[],
): string {
  const modulesByFileName = new Map(modules.map((module) => [module.fileName, module]));
  const resolved = new Map<string, ResolvedExports>();

  for (const name of [...new Set(roots)].sort()) {
    const owner = symbols.get(name);
    if (!owner) throw new Error(`root export ${name} has no TypeScript contract symbol`);
    const module = modulesByFileName.get(owner.fileName);
    const isDirectTargetNativeExport =
      module?.mode === 'target-native' &&
      (module.directPublicExports === true || (!name.endsWith('Raw') && symbols.has(`${name}Raw`)));
    const specifier = isDirectTargetNativeExport ? `./${owner.fileName}` : './contract.ts';
    const entry = resolved.get(specifier) ?? { types: [], values: [] };
    (owner.hasValue ? entry.values : entry.types).push(name);
    resolved.set(specifier, entry);
  }

  let output = '';
  for (const [specifier, exports] of [...resolved].sort(([left], [right]) => left.localeCompare(right))) {
    if (exports.values.length > 0) {
      output += `export {\n  ${exports.values.join(',\n  ')},\n} from '${specifier}';\n`;
    }
    if (exports.types.length > 0) {
      if (output.length > 0 && !output.endsWith('\n\n')) output += '\n';
      output += `export type { ${exports.types.join(', ')} } from '${specifier}';\n`;
    }
  }
  return output;
}

// The generated TypeScript symbol of an explicitly re-exported Rust item: its `export-name` mapping
// when one exists, otherwise its lower-camel name (or the `Raw` entity form).
export function resolveRustExportName(
  rustName: string,
  symbols: ReadonlyMap<string, ExportSymbolOwner>,
  exportNames: ReadonlyMap<string, string>,
  ownerFileName?: string,
): string {
  const mapped = exportNames.get(rustName);
  const name = snakeToLowerCamel(rustName);
  const direct = symbols.get(name);
  const candidates =
    mapped === undefined && direct?.hasValue === true && symbols.has(`${name}Raw`)
      ? [`${name}Raw`, name]
      : mapped === undefined
        ? [name, `${name}Raw`]
        : [mapped];
  for (const candidate of candidates) {
    const owner = symbols.get(candidate);
    if (owner && (ownerFileName === undefined || owner.fileName === ownerFileName)) return candidate;
  }
  const expected = mapped === undefined ? '' : ` (export-name ${mapped})`;
  throw new Error(
    `Rust export ${rustName}${expected} has no TypeScript symbol${ownerFileName ? ` in ${ownerFileName}` : ''}`,
  );
}
