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
  nullableFields?: string[];
  stringUnionValues?: string[];
}

interface ResolvedExports {
  types: string[];
  values: string[];
}

interface ExportedFunctionTypes {
  parameters: Record<string, unknown>[];
  returnType?: Record<string, unknown>;
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
  targetNativeSources: readonly string[] = [],
): string[] {
  // Test generation reads every non-alias crate source as visibility-only input, matching production
  // generation. Target-native sources remain visible even when their directive metadata also makes
  // them alias inputs: nullable parameters and explicit TypeScript representations need their actual
  // declarations, but none of these sources become emitted test code.
  if (command === 'generate-tests') {
    const targetNative = new Set(targetNativeSources);
    const emitted = new Set(aliasSources);
    return crateSources
      .filter((crateSource) => targetNative.has(crateSource) || !emitted.has(crateSource))
      .flatMap((crateSource) => ['--visibility-source', crateSource]);
  }
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
    const pattern = /^export (?:async )?(class|function|const|enum|interface|type) ([A-Za-z0-9_]+)/gm;
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
    for (const match of module.typescript.matchAll(/^export\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+['"][^'"]+['"];?/gm)) {
      const groupTypeOnly = match[1] !== undefined;
      for (const item of match[2].split(',')) {
        const declaration = item.trim();
        if (declaration.length === 0) continue;
        const itemTypeOnly = groupTypeOnly || declaration.startsWith('type ');
        const name = declaration
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)
          .at(-1)
          ?.trim();
        if (!name || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) continue;
        const owner = symbols.get(name) ?? {
          fileName: module.fileName,
          hasType: false,
          hasValue: false,
          isClass: false,
        };
        if (owner.fileName !== module.fileName) {
          throw new Error(`duplicate generated symbol ${name} in ${owner.fileName} and ${module.fileName}`);
        }
        owner.hasType ||= itemTypeOnly;
        owner.hasValue ||= !itemTypeOnly;
        symbols.set(name, owner);
      }
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

  for (const match of typescript.matchAll(
    /^export (?:async )?(class|function|const|enum|interface|type) ([A-Za-z0-9_]+)/gm,
  )) {
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

  for (const match of typescript.matchAll(/^export\s+(type\s+)?\{([^}]*)\};?$/gm)) {
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

// Pure string-literal aliases have a type binding but no runtime value. Return only direct exported
// declarations: barrels are traversed by the package generator, which keeps the canonical module
// owner alongside these representation facts.
export function collectTypeScriptStringUnions(typescript: string): Map<string, string[]> {
  const parsed = parseSync('contract.ts', typescript, { lang: 'ts', sourceType: 'module' });
  if (parsed.errors.length > 0) {
    throw new Error(`could not parse TypeScript contract while resolving string unions: ${parsed.errors[0]?.message}`);
  }
  const unions = new Map<string, string[]>();
  for (const statement of parsed.program.body as unknown as Record<string, unknown>[]) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = statement.declaration as Record<string, unknown> | null;
    if (declaration?.type !== 'TSTypeAliasDeclaration') continue;
    const annotation = declaration.typeAnnotation as Record<string, unknown>;
    if (annotation.type !== 'TSUnionType') continue;
    const values: string[] = [];
    for (const member of annotation.types as Record<string, unknown>[]) {
      const literal = member.literal as Record<string, unknown> | undefined;
      if (member.type !== 'TSLiteralType' || literal?.type !== 'Literal' || typeof literal.value !== 'string') {
        values.length = 0;
        break;
      }
      values.push(literal.value);
    }
    const identifier = declaration.id as Record<string, unknown>;
    if (values.length > 0 && identifier.type === 'Identifier') {
      unions.set(identifier.name as string, values);
    }
  }
  return unions;
}

// Direct exported interface fields whose contract admits `null` but not `undefined`. Optional fields
// are excluded: their absence representation remains `undefined` even when their payload also admits
// `null`.
export function collectTypeScriptNullableOptionFields(typescript: string): Map<string, string[]> {
  const parsed = parseSync('contract.ts', typescript, { lang: 'ts', sourceType: 'module' });
  if (parsed.errors.length > 0) {
    throw new Error(
      `could not parse TypeScript contract while resolving nullable fields: ${parsed.errors[0]?.message}`,
    );
  }
  const owners = new Map<string, string[]>();
  for (const statement of parsed.program.body as unknown as Record<string, unknown>[]) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = statement.declaration as Record<string, unknown> | null;
    if (declaration?.type !== 'TSInterfaceDeclaration') continue;
    const identifier = declaration.id as Record<string, unknown>;
    if (identifier.type !== 'Identifier' || typeof identifier.name !== 'string') continue;
    const body = declaration.body as Record<string, unknown>;
    const fields: string[] = [];
    for (const member of body.body as Record<string, unknown>[]) {
      if (member.type !== 'TSPropertySignature' || member.optional === true || member.computed === true) continue;
      const key = member.key as Record<string, unknown>;
      const annotation = member.typeAnnotation as Record<string, unknown> | null;
      const fieldType = annotation?.typeAnnotation as Record<string, unknown> | undefined;
      if (key.type !== 'Identifier' || typeof key.name !== 'string' || fieldType?.type !== 'TSUnionType') continue;
      const members = fieldType.types as Record<string, unknown>[];
      if (
        members.some((candidate) => candidate.type === 'TSNullKeyword') &&
        !members.some((candidate) => candidate.type === 'TSUndefinedKeyword')
      ) {
        fields.push(key.name);
      }
    }
    if (fields.length > 0) owners.set(identifier.name, fields.sort());
  }
  return owners;
}

// Existing imports identify the canonical external contract owner. Only that owner's direct,
// type-only string-union declaration becomes compiler representation metadata; ordinary type aliases
// and runtime enums produce no argument.
export function typeScriptStringUnionArguments(
  existingTypescript: string,
  importedContractSymbols: ReadonlyMap<string, ReadonlyMap<string, Omit<ExportSymbolOwner, 'fileName'>>>,
): string[] {
  const unions = new Map<string, { module: string; values: string[] }>();
  for (const match of existingTypescript.matchAll(
    /^import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+['"](@flighthq\/[^/'"]+\/contract)['"];?/gm,
  )) {
    const module = match[2];
    const symbols = importedContractSymbols.get(module);
    if (symbols === undefined) continue;
    for (const item of match[1].split(',')) {
      const fields = item
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/);
      const imported = fields[0]?.trim();
      const local = fields.at(-1)?.trim();
      if (!imported || !local) continue;
      const owner = symbols.get(imported);
      if (owner?.hasType !== true || owner.hasValue || owner.stringUnionValues === undefined) continue;
      const previous = unions.get(local);
      if (previous !== undefined && previous.module !== module) {
        throw new Error(`TypeScript string union ${local} is imported from both ${previous.module} and ${module}`);
      }
      unions.set(local, { module, values: owner.stringUnionValues });
    }
  }
  return [...unions]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, union]) => [
      '--typescript-string-union',
      `${union.module}#${name}=${JSON.stringify(union.values)}`,
    ]);
}

interface TypeScriptTypeAliasOwner {
  module?: string;
  name: string;
}

// Existing exported signatures are the authority for Rust aliases whose target-language
// representation is already owned elsewhere. The match is deliberately structural: only a bare
// generated type at the same position in the same exported function can become a canonical imported
// contract type (or the intrinsic `unknown`). Alias spelling never participates in the decision.
export function typeScriptTypeAliasArguments(
  existingTypescript: string,
  generatedTypescript: string,
  importedContractSymbols: ReadonlyMap<string, ReadonlyMap<string, Omit<ExportSymbolOwner, 'fileName'>>>,
): string[] {
  const existing = parseSync('existing.ts', existingTypescript, { lang: 'ts', sourceType: 'module' });
  if (existing.errors.length > 0) {
    throw new Error(
      `could not parse existing TypeScript contract while resolving type aliases: ${existing.errors[0]?.message}`,
    );
  }
  const generated = parseSync('generated.ts', generatedTypescript, { lang: 'ts', sourceType: 'module' });
  if (generated.errors.length > 0) {
    throw new Error(
      `could not parse generated TypeScript contract while resolving type aliases: ${generated.errors[0]?.message}`,
    );
  }

  const canonicalTypes = new Map<string, TypeScriptTypeAliasOwner>();
  const ambiguousCanonicalTypes = new Set<string>();
  for (const statement of existing.program.body as unknown as Record<string, unknown>[]) {
    if (statement.type !== 'ImportDeclaration') continue;
    const source = statement.source as Record<string, unknown>;
    const module = typeof source.value === 'string' ? source.value : undefined;
    if (module === undefined) continue;
    const symbols = importedContractSymbols.get(module);
    for (const specifier of statement.specifiers as Record<string, unknown>[]) {
      if (specifier.type !== 'ImportSpecifier') continue;
      const imported = specifier.imported as Record<string, unknown>;
      const local = specifier.local as Record<string, unknown>;
      const importedName = typeof imported.name === 'string' ? imported.name : undefined;
      const localName = typeof local.name === 'string' ? local.name : undefined;
      const relativeTypeImport =
        /^\.{1,2}\//.test(module) && (statement.importKind === 'type' || specifier.importKind === 'type');
      // Keeping renamed imports would require a second target binding in the compiler metadata. The
      // direct-name lane covers established owners without inventing a new local public name.
      if (
        importedName === undefined ||
        localName !== importedName ||
        ambiguousCanonicalTypes.has(localName) ||
        (!relativeTypeImport && symbols?.get(importedName)?.hasType !== true)
      ) {
        continue;
      }
      const previous = canonicalTypes.get(localName);
      if (previous !== undefined && previous.module !== module) {
        canonicalTypes.delete(localName);
        ambiguousCanonicalTypes.add(localName);
      } else {
        canonicalTypes.set(localName, { module, name: importedName });
      }
    }
  }

  const aliases = new Map<string, TypeScriptTypeAliasOwner>();
  const existingFunctions = exportedFunctionTypes(existing.program.body as unknown as Record<string, unknown>[]);
  const generatedFunctions = exportedFunctionTypes(generated.program.body as unknown as Record<string, unknown>[]);

  function record(alias: string, owner: TypeScriptTypeAliasOwner): void {
    const previous = aliases.get(alias);
    if (previous !== undefined && (previous.module !== owner.module || previous.name !== owner.name)) {
      throw new Error(
        `Rust type alias ${alias} has conflicting TypeScript representations ${renderTypeAliasOwner(previous)} and ${renderTypeAliasOwner(owner)}`,
      );
    }
    aliases.set(alias, owner);
  }

  function align(
    existingType: Record<string, unknown>,
    generatedType: Record<string, unknown>,
    allowIntrinsic = true,
  ): void {
    const generatedName = bareTypeReferenceName(generatedType);
    if (generatedName !== undefined) {
      const existingName = bareTypeReferenceName(existingType);
      const owner =
        existingName === undefined && allowIntrinsic
          ? intrinsicTypeAliasOwner(existingType)
          : existingName === undefined
            ? undefined
            : canonicalTypes.get(existingName);
      if (owner !== undefined && generatedName !== existingName) {
        record(generatedName, owner);
        return;
      }
      if (existingType.type === 'TSUnknownKeyword') {
        record(generatedName, { name: 'unknown' });
        return;
      }
    }
    if (existingType.type !== generatedType.type) return;
    if (existingType.type === 'TSTypeReference') {
      if (typeName(existingType) !== typeName(generatedType)) return;
      alignTypeLists(typeParameters(existingType), typeParameters(generatedType));
      return;
    }
    if (existingType.type === 'TSArrayType') {
      align(existingType.elementType as Record<string, unknown>, generatedType.elementType as Record<string, unknown>);
      return;
    }
    if (existingType.type === 'TSTypeOperator' || existingType.type === 'TSParenthesizedType') {
      if (existingType.type === 'TSTypeOperator' && existingType.operator !== generatedType.operator) return;
      align(
        existingType.typeAnnotation as Record<string, unknown>,
        generatedType.typeAnnotation as Record<string, unknown>,
      );
      return;
    }
    if (existingType.type === 'TSUnionType' || existingType.type === 'TSIntersectionType') {
      // A different sibling member changes the representation of the whole union. Do not infer a
      // primitive alias from one coincidentally aligned member of such a mismatched container.
      alignTypeLists(
        existingType.types as Record<string, unknown>[],
        generatedType.types as Record<string, unknown>[],
        false,
      );
    }
  }

  function alignTypeLists(
    existingTypes: readonly Record<string, unknown>[],
    generatedTypes: readonly Record<string, unknown>[],
    allowIntrinsic = true,
  ): void {
    if (existingTypes.length !== generatedTypes.length) return;
    for (let index = 0; index < existingTypes.length; index += 1) {
      align(existingTypes[index], generatedTypes[index], allowIntrinsic);
    }
  }

  for (const [name, generatedFunction] of generatedFunctions) {
    const existingFunction = existingFunctions.get(name);
    if (existingFunction === undefined || existingFunction.parameters.length !== generatedFunction.parameters.length) {
      continue;
    }
    alignTypeLists(existingFunction.parameters, generatedFunction.parameters);
    if (existingFunction.returnType !== undefined && generatedFunction.returnType !== undefined) {
      align(existingFunction.returnType, generatedFunction.returnType);
    }
  }

  return [...aliases]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([alias, owner]) => [
      '--typescript-type-alias',
      `${alias}=${owner.module === undefined ? owner.name : `${owner.module}#${owner.name}`}`,
    ]);
}

function intrinsicTypeAliasOwner(type: Record<string, unknown>): TypeScriptTypeAliasOwner | undefined {
  switch (type.type) {
    case 'TSBooleanKeyword':
      return { name: 'boolean' };
    case 'TSNumberKeyword':
      return { name: 'number' };
    case 'TSStringKeyword':
      return { name: 'string' };
    default:
      return undefined;
  }
}

// Canonical imported interfaces prove the absence representation of their fields. Carry only fields
// the generated function actually reads or writes through a parameter of that exact owner type; no
// owner or field spelling is inferred from Rust names.
export function typeScriptNullableOptionFieldArguments(
  existingTypescript: string,
  generatedTypescript: string,
  importedContractSymbols: ReadonlyMap<string, ReadonlyMap<string, Omit<ExportSymbolOwner, 'fileName'>>>,
): string[] {
  const existing = parseSync('existing.ts', existingTypescript, { lang: 'ts', sourceType: 'module' });
  if (existing.errors.length > 0) {
    throw new Error(
      `could not parse existing TypeScript contract while resolving nullable fields: ${existing.errors[0]?.message}`,
    );
  }
  const generated = parseSync('generated.ts', generatedTypescript, { lang: 'ts', sourceType: 'module' });
  if (generated.errors.length > 0) {
    throw new Error(
      `could not parse generated TypeScript contract while resolving nullable fields: ${generated.errors[0]?.message}`,
    );
  }

  const canonicalOwners = new Map<string, { fields: ReadonlySet<string>; module: string; owner: string }>();
  const ambiguous = new Set<string>();
  for (const statement of existing.program.body as unknown as Record<string, unknown>[]) {
    if (statement.type !== 'ImportDeclaration') continue;
    const source = statement.source as Record<string, unknown>;
    const module = typeof source.value === 'string' ? source.value : undefined;
    if (module === undefined || !/^@flighthq\/[^/]+\/contract$/.test(module)) continue;
    const symbols = importedContractSymbols.get(module);
    if (symbols === undefined) continue;
    for (const specifier of statement.specifiers as Record<string, unknown>[]) {
      if (specifier.type !== 'ImportSpecifier') continue;
      const imported = specifier.imported as Record<string, unknown>;
      const local = specifier.local as Record<string, unknown>;
      const owner = typeof imported.name === 'string' ? imported.name : undefined;
      const localName = typeof local.name === 'string' ? local.name : undefined;
      const fields = owner === undefined ? undefined : symbols.get(owner)?.nullableFields;
      if (owner === undefined || localName !== owner || fields === undefined || ambiguous.has(localName)) continue;
      const previous = canonicalOwners.get(localName);
      if (previous !== undefined && previous.module !== module) {
        canonicalOwners.delete(localName);
        ambiguous.add(localName);
      } else {
        canonicalOwners.set(localName, { fields: new Set(fields), module, owner });
      }
    }
  }

  const positions = new Set<string>();
  for (const statement of generated.program.body as unknown as Record<string, unknown>[]) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = statement.declaration as Record<string, unknown> | null;
    if (declaration?.type !== 'FunctionDeclaration') continue;
    const parameters = new Map<string, { fields: ReadonlySet<string>; module: string; owner: string }>();
    for (const parameter of declaration.params as Record<string, unknown>[]) {
      const pattern = (parameter.pattern as Record<string, unknown> | undefined) ?? parameter;
      const annotation =
        (parameter.typeAnnotation as Record<string, unknown> | null) ??
        (pattern.typeAnnotation as Record<string, unknown> | null);
      const rustType = annotation?.typeAnnotation as Record<string, unknown> | undefined;
      const owner = rustType === undefined ? undefined : bareTypeReferenceName(rustType);
      const canonical = owner === undefined ? undefined : canonicalOwners.get(owner);
      if (pattern.type === 'Identifier' && typeof pattern.name === 'string' && canonical !== undefined) {
        parameters.set(pattern.name, canonical);
      }
    }
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (value === null || typeof value !== 'object') return;
      const node = value as Record<string, unknown>;
      if (node.type === 'StaticMemberExpression' || node.type === 'MemberExpression') {
        const object = node.object as Record<string, unknown> | undefined;
        const property = node.property as Record<string, unknown> | undefined;
        if (object?.type === 'Identifier' && property?.type === 'Identifier') {
          const canonical = parameters.get(object.name as string);
          const field = property.name as string;
          if (canonical?.fields.has(field)) {
            positions.add(`${canonical.module}#${canonical.owner}.${field}`);
          }
        }
      }
      for (const [key, child] of Object.entries(node)) {
        if (key !== 'type' && key !== 'span') visit(child);
      }
    };
    visit(declaration.body);
  }

  return [...positions].sort().flatMap((position) => ['--typescript-nullable-option-field', position]);
}

// Exact exported function and parameter names prove the established absence representation. A
// generated optional or `undefined`-union parameter becomes nullable only when the corresponding
// established position directly admits `null` and not `undefined`; established optional and
// defaulted parameters remain ordinary Options because this metadata does not encode defaults.
export function typeScriptNullableOptionParameterArguments(
  existingTypescript: string,
  generatedTypescript: string,
): string[] {
  const existing = parseSync('existing.ts', existingTypescript, { lang: 'ts', sourceType: 'module' });
  if (existing.errors.length > 0) {
    throw new Error(
      `could not parse existing TypeScript contract while resolving nullable parameters: ${existing.errors[0]?.message}`,
    );
  }
  const generated = parseSync('generated.ts', generatedTypescript, { lang: 'ts', sourceType: 'module' });
  if (generated.errors.length > 0) {
    throw new Error(
      `could not parse generated TypeScript contract while resolving nullable parameters: ${generated.errors[0]?.message}`,
    );
  }

  const existingFunctions = exportedFunctionParameterTypes(
    existing.program.body as unknown as Record<string, unknown>[],
  );
  const generatedFunctions = exportedFunctionParameterTypes(
    generated.program.body as unknown as Record<string, unknown>[],
  );
  const positions: string[] = [];
  for (const [owner, existingParameters] of existingFunctions) {
    const generatedParameters = generatedFunctions.get(owner);
    if (generatedParameters === undefined || existingParameters.length !== generatedParameters.length) continue;
    for (let index = 0; index < existingParameters.length; index += 1) {
      const existingParameter = existingParameters[index];
      const generatedParameter = generatedParameters[index];
      if (
        existingParameter.name !== generatedParameter.name ||
        existingParameter.optional ||
        existingParameter.defaulted ||
        !typeUnionHasOnlyAbsence(existingParameter.type, 'TSNullKeyword') ||
        !(
          (generatedParameter.optional && !typeHasAbsence(generatedParameter.type, 'TSNullKeyword')) ||
          typeUnionHasOnlyAbsence(generatedParameter.type, 'TSUndefinedKeyword')
        )
      ) {
        continue;
      }
      positions.push(`${owner}.${existingParameter.name}`);
    }
  }
  return positions.sort().flatMap((position) => ['--typescript-nullable-option-parameter', position]);
}

// A literal `null` default is a distinct established contract from both an optional parameter and a
// required nullable parameter. Match the exact exported function position, require its type to admit
// only `null`, and require the generated position to be an ordinary Option before preserving it.
export function typeScriptDefaultNullOptionParameterArguments(
  existingTypescript: string,
  generatedTypescript: string,
): string[] {
  const existing = parseSync('existing.ts', existingTypescript, { lang: 'ts', sourceType: 'module' });
  if (existing.errors.length > 0) {
    throw new Error(
      `could not parse existing TypeScript contract while resolving default-null parameters: ${existing.errors[0]?.message}`,
    );
  }
  const generated = parseSync('generated.ts', generatedTypescript, { lang: 'ts', sourceType: 'module' });
  if (generated.errors.length > 0) {
    throw new Error(
      `could not parse generated TypeScript contract while resolving default-null parameters: ${generated.errors[0]?.message}`,
    );
  }

  const existingFunctions = exportedFunctionParameterTypes(
    existing.program.body as unknown as Record<string, unknown>[],
  );
  const generatedFunctions = exportedFunctionParameterTypes(
    generated.program.body as unknown as Record<string, unknown>[],
  );
  const positions: string[] = [];
  for (const [owner, existingParameters] of existingFunctions) {
    const generatedParameters = generatedFunctions.get(owner);
    if (generatedParameters === undefined || existingParameters.length !== generatedParameters.length) continue;
    for (let index = 0; index < existingParameters.length; index += 1) {
      const existingParameter = existingParameters[index];
      const generatedParameter = generatedParameters[index];
      if (
        existingParameter.name !== generatedParameter.name ||
        existingParameter.optional ||
        !existingParameter.defaultNull ||
        !typeUnionHasOnlyAbsence(existingParameter.type, 'TSNullKeyword') ||
        generatedParameter.defaulted ||
        !(
          (generatedParameter.optional && !typeHasAbsence(generatedParameter.type, 'TSNullKeyword')) ||
          typeUnionHasOnlyAbsence(generatedParameter.type, 'TSUndefinedKeyword')
        )
      ) {
        continue;
      }
      positions.push(`${owner}.${existingParameter.name}`);
    }
  }
  return positions.sort().flatMap((position) => ['--typescript-default-null-option-parameter', position]);
}

// The same exported function position in the established and generated modules proves its Option
// absence representation. A direct `null`-only absence union becomes explicit metadata; functions
// whose established contract admits `undefined` retain ordinary Option lowering.
export function typeScriptNullableOptionReturnArguments(
  existingTypescript: string,
  generatedTypescript: string,
): string[] {
  const existing = parseSync('existing.ts', existingTypescript, { lang: 'ts', sourceType: 'module' });
  if (existing.errors.length > 0) {
    throw new Error(
      `could not parse existing TypeScript contract while resolving nullable returns: ${existing.errors[0]?.message}`,
    );
  }
  const generated = parseSync('generated.ts', generatedTypescript, { lang: 'ts', sourceType: 'module' });
  if (generated.errors.length > 0) {
    throw new Error(
      `could not parse generated TypeScript contract while resolving nullable returns: ${generated.errors[0]?.message}`,
    );
  }

  const existingFunctions = exportedFunctionTypes(existing.program.body as unknown as Record<string, unknown>[]);
  const generatedFunctions = exportedFunctionTypes(generated.program.body as unknown as Record<string, unknown>[]);
  const positions: string[] = [];
  for (const [name, existingFunction] of existingFunctions) {
    const generatedFunction = generatedFunctions.get(name);
    if (
      generatedFunction === undefined ||
      !typeUnionHasOnlyAbsence(existingFunction.returnType, 'TSNullKeyword') ||
      !typeUnionHasOnlyAbsence(generatedFunction.returnType, 'TSUndefinedKeyword')
    ) {
      continue;
    }
    positions.push(name);
  }
  return positions.sort().flatMap((name) => ['--typescript-nullable-option-return', name]);
}

function typeUnionHasOnlyAbsence(
  type: Record<string, unknown> | undefined,
  absence: 'TSNullKeyword' | 'TSUndefinedKeyword',
): boolean {
  if (type?.type !== 'TSUnionType') return false;
  const types = type.types as Record<string, unknown>[];
  const otherAbsence = absence === 'TSNullKeyword' ? 'TSUndefinedKeyword' : 'TSNullKeyword';
  return (
    types.some((candidate) => candidate.type === absence) && !types.some((candidate) => candidate.type === otherAbsence)
  );
}

function typeHasAbsence(type: Record<string, unknown> | undefined, absence: 'TSNullKeyword' | 'TSUndefinedKeyword') {
  return (
    type?.type === absence ||
    (type?.type === 'TSUnionType' &&
      (type.types as Record<string, unknown>[]).some((candidate) => candidate.type === absence))
  );
}

function exportedFunctionParameterTypes(
  body: readonly Record<string, unknown>[],
): Map<
  string,
  { defaulted: boolean; defaultNull: boolean; name: string; optional: boolean; type?: Record<string, unknown> }[]
> {
  const functions = new Map<
    string,
    { defaulted: boolean; defaultNull: boolean; name: string; optional: boolean; type?: Record<string, unknown> }[]
  >();
  for (const statement of body) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = statement.declaration as Record<string, unknown> | null;
    if (declaration?.type !== 'FunctionDeclaration') continue;
    const identifier = declaration.id as Record<string, unknown> | null;
    if (identifier?.type !== 'Identifier' || typeof identifier.name !== 'string') continue;
    const parameters = (declaration.params as Record<string, unknown>[]).map((parameter) => {
      const pattern = parameter.type === 'AssignmentPattern' ? (parameter.left as Record<string, unknown>) : parameter;
      const annotation = pattern.typeAnnotation as Record<string, unknown> | null;
      return {
        defaulted: parameter.type === 'AssignmentPattern',
        defaultNull:
          parameter.type === 'AssignmentPattern' &&
          (parameter.right as Record<string, unknown> | undefined)?.type === 'Literal' &&
          (parameter.right as Record<string, unknown>).value === null,
        name: pattern.type === 'Identifier' && typeof pattern.name === 'string' ? pattern.name : '',
        optional: parameter.optional === true || pattern.optional === true,
        type: annotation?.typeAnnotation as Record<string, unknown> | undefined,
      };
    });
    if (parameters.some((parameter) => parameter.name === '' || parameter.type === undefined)) continue;
    functions.set(identifier.name, parameters);
  }
  return functions;
}

function exportedFunctionTypes(body: readonly Record<string, unknown>[]): Map<string, ExportedFunctionTypes> {
  const functions = new Map<string, ExportedFunctionTypes>();
  for (const statement of body) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = statement.declaration as Record<string, unknown> | null;
    if (declaration?.type !== 'FunctionDeclaration') continue;
    const identifier = declaration.id as Record<string, unknown> | null;
    if (identifier?.type !== 'Identifier' || typeof identifier.name !== 'string') continue;
    const parameters = (declaration.params as Record<string, unknown>[])
      .map((parameter) =>
        parameter.type === 'AssignmentPattern' ? (parameter.left as Record<string, unknown>) : parameter,
      )
      .map((parameter) => parameter.typeAnnotation as Record<string, unknown> | null)
      .map((annotation) => annotation?.typeAnnotation as Record<string, unknown> | undefined);
    if (parameters.some((parameter) => parameter === undefined)) continue;
    const returnAnnotation = declaration.returnType as Record<string, unknown> | null;
    functions.set(identifier.name, {
      parameters: parameters as Record<string, unknown>[],
      returnType: returnAnnotation?.typeAnnotation as Record<string, unknown> | undefined,
    });
  }
  return functions;
}

function renderTypeAliasOwner(owner: TypeScriptTypeAliasOwner): string {
  return owner.module === undefined ? owner.name : `${owner.module}#${owner.name}`;
}

// Existing exported signatures are the authority for unnamed TypeScript representations. Match only
// the same exported function position and the same enclosing generic types; the compiler then verifies
// that each inferred literal set exactly represents the visible unit Rust enum before using it.
export function typeScriptInlineStringUnionArguments(
  existingTypescript: string,
  generatedTypescript: string,
): string[] {
  const existingFunctions = exportedFunctionTypesFromSource(existingTypescript, 'existing TypeScript contract');
  const generatedFunctions = exportedFunctionTypesFromSource(generatedTypescript, 'generated TypeScript contract');
  const unions = new Map<string, string[]>();

  function align(existing: Record<string, unknown>, generated: Record<string, unknown>): void {
    const generatedName = bareTypeReferenceName(generated);
    const values = stringLiteralUnionValues(existing);
    if (generatedName !== undefined && values !== undefined) {
      const previous = unions.get(generatedName);
      if (previous !== undefined && !sameStringValues(previous, values)) {
        throw new Error(`inline TypeScript string union ${generatedName} has conflicting contract signatures`);
      }
      unions.set(generatedName, values);
      return;
    }
    if (existing.type !== generated.type) return;
    if (existing.type === 'TSTypeReference') {
      if (typeName(existing) !== typeName(generated)) return;
      const existingParameters = typeParameters(existing);
      const generatedParameters = typeParameters(generated);
      if (existingParameters.length !== generatedParameters.length) return;
      for (let index = 0; index < existingParameters.length; index += 1) {
        align(existingParameters[index], generatedParameters[index]);
      }
    }
  }

  for (const [name, generated] of generatedFunctions) {
    const existing = existingFunctions.get(name);
    if (existing === undefined || existing.parameters.length !== generated.parameters.length) continue;
    for (let index = 0; index < existing.parameters.length; index += 1) {
      align(existing.parameters[index], generated.parameters[index]);
    }
    if (existing.returnType !== undefined && generated.returnType !== undefined) {
      align(existing.returnType, generated.returnType);
    }
  }

  return [...unions]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, values]) => ['--typescript-inline-string-union', `${name}=${JSON.stringify(values)}`]);
}

function bareTypeReferenceName(node: Record<string, unknown>): string | undefined {
  if (node.type !== 'TSTypeReference' || typeParameters(node).length !== 0) return undefined;
  const name = node.typeName as Record<string, unknown> | undefined;
  return name?.type === 'Identifier' && typeof name.name === 'string' ? name.name : undefined;
}

function exportedFunctionTypesFromSource(typescript: string, identity: string): Map<string, ExportedFunctionTypes> {
  const parsed = parseSync('contract.ts', typescript, { lang: 'ts', sourceType: 'module' });
  if (parsed.errors.length > 0) {
    throw new Error(`could not parse ${identity} while resolving inline string unions: ${parsed.errors[0]?.message}`);
  }
  return exportedFunctionTypes(parsed.program.body as unknown as Record<string, unknown>[]);
}

function sameStringValues(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value))
  );
}

function stringLiteralUnionValues(node: Record<string, unknown>): string[] | undefined {
  if (node.type !== 'TSUnionType') return undefined;
  const values: string[] = [];
  for (const member of node.types as Record<string, unknown>[]) {
    const literal = member.literal as Record<string, unknown> | undefined;
    if (member.type !== 'TSLiteralType' || literal?.type !== 'Literal' || typeof literal.value !== 'string') {
      return undefined;
    }
    values.push(literal.value);
  }
  return values.length > 0 ? values : undefined;
}

function typeName(node: Record<string, unknown>): string | undefined {
  const name = node.typeName as Record<string, unknown> | undefined;
  if (name?.type === 'Identifier' && typeof name.name === 'string') return name.name;
  return undefined;
}

function typeParameters(node: Record<string, unknown>): Record<string, unknown>[] {
  const arguments_ = node.typeArguments as Record<string, unknown> | null;
  return (arguments_?.params as Record<string, unknown>[] | undefined) ?? [];
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
  // The compiler emits TypeScript's intrinsic `Record<K, V>` for `flight_entity::Record`. A
  // crate-local compatibility type with the same name is not its owner in that explicit case.
  const usesIntrinsicRecord = /^use flight_entity::Record;$/m.test(rust);
  const importedNames = new Set(
    collectReferencedExportNames(typescript, ownFileName, symbols).filter(
      (name) => name !== 'Record' || !usesIntrinsicRecord,
    ),
  );
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

// An established implementation or test may already import a dependency-owned symbol through its
// canonical TypeScript contract even when Rust names the declaration through the current crate's
// contract or another crate's re-export barrel. Reuse that established owner in generated output so
// promotion does not introduce a new package edge or pull the re-exporting package's source across
// the consumer's project boundary.
export function canonicalizeGeneratedContractImports(existingTypescript: string, generatedTypescript: string): string {
  const canonicalOwners = new Map<string, { module: string; specifier: string }>();
  const ambiguous = new Set<string>();
  // A specifier list never contains braces. `[^{}]*` keeps each match inside one declaration: a lazy
  // `[\s\S]*?` would extend across an earlier import (`vitest`) to reach a later contract module.
  const importPattern = /^import\s+(?:type\s+)?\{([^{}]*)\}\s+from\s+['"](@flighthq\/[^/'"]+\/contract)['"];?/gm;

  for (const match of existingTypescript.matchAll(importPattern)) {
    for (const item of match[1].split(',')) {
      const specifier = item.trim().replace(/^type\s+/, '');
      const local = specifier
        .split(/\s+as\s+/)
        .at(-1)
        ?.trim();
      if (!local || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(local) || ambiguous.has(local)) continue;
      const previous = canonicalOwners.get(local);
      if (previous !== undefined && previous.module !== match[2]) {
        canonicalOwners.delete(local);
        ambiguous.add(local);
        continue;
      }
      canonicalOwners.set(local, { module: match[2], specifier });
    }
  }

  const generatedImportPattern =
    /^import\s+(type\s+)?\{([^{}]*)\}\s+from\s+['"](@flighthq\/[^/'"]+\/contract|\.\/contract(?:\.ts)?)['"];?/gm;
  return generatedTypescript.replace(generatedImportPattern, (_declaration, groupType, body, module: string) => {
    const imports = new Map<string, { types: string[]; values: string[] }>();
    for (const item of (body as string).split(',')) {
      const declaration = item.trim();
      if (declaration.length === 0) continue;
      const itemTypeOnly = groupType !== undefined || declaration.startsWith('type ');
      const generatedSpecifier = declaration.replace(/^type\s+/, '');
      const local = generatedSpecifier
        .split(/\s+as\s+/)
        .at(-1)
        ?.trim();
      const canonical = local === undefined ? undefined : canonicalOwners.get(local);
      const targetModule = canonical?.module ?? module;
      const entry = imports.get(targetModule) ?? { types: [], values: [] };
      (itemTypeOnly ? entry.types : entry.values).push(canonical?.specifier ?? generatedSpecifier);
      imports.set(targetModule, entry);
    }

    let output = '';
    for (const [targetModule, names] of [...imports].sort(([left], [right]) => left.localeCompare(right))) {
      if (names.types.length > 0) {
        output += `import type { ${names.types.sort().join(', ')} } from '${targetModule}';\n`;
      }
      if (names.values.length > 0) {
        output += `import { ${names.values.sort().join(', ')} } from '${targetModule}';\n`;
      }
    }
    return output.trimEnd();
  });
}

// Imports are part of a target-native module's symbol ownership record. During strict promotion the
// Rust source replaces that implementation, but crate-local rust-only declarations may still be owned
// by a transitional external TypeScript contract. Retain only imports the generated body references;
// local declarations and stale imports stay out of the generated module.
export function renderReferencedImports(
  existingTypescript: string,
  generatedTypescript: string,
  importedContractSymbols: ReadonlyMap<string, ReadonlyMap<string, Omit<ExportSymbolOwner, 'fileName'>>> = new Map(),
): string {
  const code = referencedCode(generatedTypescript);
  const localBindings = collectLocalBindingNames(generatedTypescript);
  const alreadyImported = collectImportedNames(generatedTypescript);
  const valueReferences = collectValueReferenceNames(generatedTypescript);
  const imports = new Map<string, Map<string, { specifier: string; typeOnly: boolean }>>();

  for (const match of existingTypescript.matchAll(/^import\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/gm)) {
    const groupTypeOnly = match[1] !== undefined;
    const module = match[3];
    const entries = imports.get(module) ?? new Map<string, { specifier: string; typeOnly: boolean }>();
    for (const item of match[2].split(',')) {
      const declaration = item.trim();
      if (declaration.length === 0) continue;
      const typeOnly = groupTypeOnly || declaration.startsWith('type ');
      const specifier = declaration.replace(/^type\s+/, '');
      const local = specifier
        .split(/\s+as\s+/)
        .at(-1)
        ?.trim();
      if (!local || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(local)) continue;
      if (localBindings.has(local) || alreadyImported.has(local) || !new RegExp(`\\b${local}\\b`).test(code)) continue;
      const previous = entries.get(local);
      if (previous === undefined || (previous.typeOnly && !typeOnly)) entries.set(local, { specifier, typeOnly });
    }
    if (entries.size > 0) imports.set(module, entries);
  }

  const inferredOwners = new Map<string, string>();
  for (const [module, symbols] of importedContractSymbols) {
    const entries = imports.get(module) ?? new Map<string, { specifier: string; typeOnly: boolean }>();
    for (const [name, owner] of symbols) {
      if (entries.has(name) || localBindings.has(name) || alreadyImported.has(name)) continue;
      if (!new RegExp(`\\b${name}\\b`).test(code)) continue;
      const previousModule = inferredOwners.get(name);
      if (previousModule !== undefined && previousModule !== module) {
        throw new Error(`generated symbol ${name} is exported by both ${previousModule} and ${module}`);
      }
      inferredOwners.set(name, module);
      const typeOnly = !owner.hasValue || (owner.hasType && !valueReferences.has(name));
      entries.set(name, { specifier: name, typeOnly });
    }
    if (entries.size > 0) imports.set(module, entries);
  }

  let output = '';
  for (const [module, entries] of [...imports].sort(([left], [right]) => left.localeCompare(right))) {
    const types = [...entries.values()]
      .filter((entry) => entry.typeOnly)
      .map((entry) => entry.specifier)
      .sort();
    const values = [...entries.values()]
      .filter((entry) => !entry.typeOnly)
      .map((entry) => entry.specifier)
      .sort();
    if (types.length > 0) output += `import type { ${types.join(', ')} } from '${module}';\n`;
    if (values.length > 0) output += `import { ${values.join(', ')} } from '${module}';\n`;
  }
  return output.length === 0 ? output : `${output}\n`;
}

// A target-native module can be a public forwarding lane rather than an implementation. The Rust
// compiler emits no declaration for `pub use`, so strict promotion retains named TypeScript
// re-exports whose public name is not replaced by generated output. Their original module remains the
// symbol owner; wildcard exports stay excluded because they do not name a deterministic contract.
export function renderReferencedExports(existingTypescript: string, generatedTypescript: string): string {
  const generatedSymbols = collectTypeScriptExportSymbols(generatedTypescript);
  const exports = new Map<string, Map<string, { specifier: string; typeOnly: boolean }>>();

  for (const match of existingTypescript.matchAll(/^export\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/gm)) {
    const groupTypeOnly = match[1] !== undefined;
    const module = match[3];
    if (/^\.\/.+\.(?:generated|native)\.ts$/.test(module)) continue;
    const entries = exports.get(module) ?? new Map<string, { specifier: string; typeOnly: boolean }>();
    for (const item of match[2].split(',')) {
      const declaration = item.trim();
      if (declaration.length === 0) continue;
      const typeOnly = groupTypeOnly || declaration.startsWith('type ');
      const specifier = declaration.replace(/^type\s+/, '');
      const exported = specifier
        .split(/\s+as\s+/)
        .at(-1)
        ?.trim();
      if (!exported || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exported) || generatedSymbols.has(exported)) continue;
      const previous = entries.get(exported);
      if (previous === undefined || (previous.typeOnly && !typeOnly)) entries.set(exported, { specifier, typeOnly });
    }
    if (entries.size > 0) exports.set(module, entries);
  }

  let output = '';
  for (const [module, entries] of [...exports].sort(([left], [right]) => left.localeCompare(right))) {
    const types = [...entries.values()]
      .filter((entry) => entry.typeOnly)
      .map((entry) => entry.specifier)
      .sort();
    const values = [...entries.values()]
      .filter((entry) => !entry.typeOnly)
      .map((entry) => entry.specifier)
      .sort();
    if (types.length > 0) output += `export type { ${types.join(', ')} } from '${module}';\n`;
    if (values.length > 0) output += `export { ${values.join(', ')} } from '${module}';\n`;
  }
  return output;
}

// Rust-only compatibility sources can own public constants used by a generated sibling. Preserve
// each existing exported const that the compiler did not replace, slicing the parsed declarator so
// multiline initializers and type annotations remain exact. Other declaration kinds contain
// implementation behavior and are not retained implicitly.
export function renderReferencedConstants(existingTypescript: string, generatedTypescript: string): string {
  const parsed = parseSync('existing.ts', existingTypescript, { lang: 'ts', sourceType: 'module' });
  if (parsed.errors.length > 0) {
    throw new Error(`could not parse existing TypeScript while resolving constants: ${parsed.errors[0]?.message}`);
  }
  const generatedSymbols = collectTypeScriptExportSymbols(generatedTypescript);
  let output = '';
  for (const statement of parsed.program.body as unknown as Record<string, unknown>[]) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = statement.declaration as Record<string, unknown> | null;
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
    for (const declarator of declaration.declarations as Record<string, unknown>[]) {
      const identifier = declarator.id as Record<string, unknown>;
      const name = identifier.type === 'Identifier' ? (identifier.name as string) : undefined;
      if (name === undefined || generatedSymbols.has(name)) continue;
      output += `export const ${existingTypescript.slice(declarator.start as number, declarator.end as number)};\n`;
    }
  }
  return output;
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
      case 'ClassDeclaration':
      case 'TSEnumDeclaration':
      case 'TSInterfaceDeclaration':
      case 'TSTypeAliasDeclaration':
      case 'ArrowFunctionExpression':
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        addBinding(node.id);
        if (Array.isArray(node.params)) {
          for (const parameter of node.params) addBinding(parameter);
        }
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

// A public type alias is a semantic input too: a dependency's alias may name the identity-bearing
// payload a consuming crate compares by allocation (`ProviderRef = Arc<dyn Any + Send + Sync>`).
export function hasRustPublicTypeAlias(rust: string): boolean {
  return collectRustPublicTypeAliasNames(rust).length > 0;
}

export function collectRustPublicTypeAliasNames(rust: string): string[] {
  return [...rust.matchAll(/^\s*pub\s+type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((match) => match[1]);
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
  const camel = value.replace(/_([a-z0-9][a-z0-9]*)/g, (_, word: string) => {
    const letter = word.search(/[a-z]/);
    if (letter === -1) return word;
    return word.slice(0, letter) + word[letter].toUpperCase() + word.slice(letter + 1);
  });
  return camel.replace(/(\d)d(?=[A-Z]|$|[^a-zA-Z])/g, '$1D');
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
