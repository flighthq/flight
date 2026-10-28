export interface ExportModule {
  fileName: string;
  mode: 'generate' | 'rust-only' | 'target-native';
}

export interface ExportSymbolOwner {
  fileName: string;
  hasType: boolean;
  hasValue: boolean;
}

interface ResolvedExports {
  types: string[];
  values: string[];
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
    const isTargetNativeWrapper =
      module?.mode === 'target-native' && !name.endsWith('Raw') && symbols.has(`${name}Raw`);
    const specifier = isTargetNativeWrapper ? `./${owner.fileName}` : './contract.ts';
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
