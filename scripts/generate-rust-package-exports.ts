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

export interface RustPublicUse {
  moduleName: string;
  name?: string;
  wildcard: boolean;
}

export function compilerAliasArguments(command: string, aliasSources: readonly string[]): string[] {
  if (command !== 'generate' && command !== 'generate-tests') return [];
  return aliasSources.flatMap((source) => ['--alias-source', source]);
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

export function renderCompanionContractExports(
  modules: readonly ExportModule[],
  symbols: ReadonlyMap<string, ExportSymbolOwner>,
): string {
  let output = '';
  for (const module of modules
    .filter((candidate) => candidate.directPublicExports)
    .sort((a, b) => a.fileName.localeCompare(b.fileName))) {
    const wrappers = [...symbols]
      .filter(
        ([name, owner]) => owner.fileName === module.fileName && owner.isClass === true && symbols.has(`${name}Raw`),
      )
      .map(([name]) => name)
      .sort();
    if (wrappers.length > 0) {
      output += `export { ${wrappers.join(', ')} } from './${module.fileName}';\n`;
    }
  }
  return output;
}

export function collectReferencedExportNames(
  typescript: string,
  ownFileName: string,
  symbols: ReadonlyMap<string, ExportSymbolOwner>,
): string[] {
  const code = typescript
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '')
    .replace(/\.\s*[A-Za-z_$][A-Za-z0-9_$]*/g, '');
  const localBindings = collectLocalBindingNames(typescript);
  return [...symbols]
    .filter(([, owner]) => owner.fileName !== ownFileName)
    .filter(([name]) => !localBindings.has(name))
    .filter(([name]) => new RegExp(`\\b${name}\\b`).test(code))
    .map(([name]) => name)
    .sort();
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
