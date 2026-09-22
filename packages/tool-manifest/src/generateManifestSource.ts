import type { ManifestImportEntry } from './manifestImports.js';

/** Options for `generateManifestSource`. */
export interface GenerateManifestSourceOptions {
  /** Prepended verbatim, each line already comment-formatted by the caller. */
  readonly banner?: readonly string[];
}

/**
 * Emits a TypeScript module that imports exactly the resolved bindings and exports one array per group.
 *
 * It emits real `import` statements rather than a data blob on purpose: the bundler must still see the
 * module graph, because "a feature nobody required is absent from the build" is a property of the graph
 * and not something a tree shaker can be asked to infer from data. Bindings and modules are sorted, so
 * the same manifest generates the same file every time and a regenerated file diffs cleanly.
 */
export function generateManifestSource(
  entries: Readonly<Record<string, readonly ManifestImportEntry[]>>,
  options: Readonly<GenerateManifestSourceOptions> = {},
): string {
  const byModule = new Map<string, Set<string>>();
  for (const group of Object.keys(entries).sort()) {
    for (const entry of entries[group]!) {
      let bindings = byModule.get(entry.module);
      if (bindings === undefined) {
        bindings = new Set<string>();
        byModule.set(entry.module, bindings);
      }
      bindings.add(entry.binding);
    }
  }

  const lines: string[] = [...(options.banner ?? [])];
  if (lines.length > 0) lines.push('');

  for (const module of [...byModule.keys()].sort()) {
    const bindings = [...byModule.get(module)!].sort();
    lines.push(`import { ${bindings.join(', ')} } from '${module}';`);
  }
  if (byModule.size > 0) lines.push('');

  for (const group of Object.keys(entries).sort()) {
    const members = entries[group]!.map((entry) => (entry.spread === true ? `...${entry.binding}` : entry.binding));
    lines.push(`export const ${toBindingName(group)} = [${members.join(', ')}];`);
  }

  return `${lines.join('\n')}\n`;
}

// A group name is caller data and may carry dots or dashes, which a TypeScript binding may not. Convert
// to camelCase rather than rejecting, so a natural group id like `swf.tags` needs no second spelling.
function toBindingName(group: string): string {
  const parts = group.split(/[^A-Za-z0-9]+/u).filter((part) => part.length > 0);
  if (parts.length === 0) return 'manifestFeatures';
  const [first, ...rest] = parts;
  const head = /^[0-9]/u.test(first!) ? `feature${first!}` : first!;
  return head + rest.map((part) => part[0]!.toUpperCase() + part.slice(1)).join('');
}
