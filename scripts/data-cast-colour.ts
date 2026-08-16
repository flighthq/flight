import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// `NodeData` is `object`, so a `node.data as SomeType` cast can attach fields the declared data type does
// not carry — nine such sites exist today and every one stores geometry. That is a fact about what the
// codebase currently does, not something the type system forbids, so it decays silently: the next cast to
// introduce a colour field would create a second colour store nobody enumerated. This turns the snapshot
// into a maintained invariant. See the boundary sequence in `agents/inert-gate-audit.md`.
export function findDataCastColourViolations(repoRoot: string): DataCastColourViolation[] {
  const sources = collectTypeScriptSources(join(repoRoot, 'packages'));
  const declarations = collectInterfaceBodies(sources);
  const violations: DataCastColourViolation[] = [];

  for (const source of sources) {
    for (const typeName of findDataCastTargets(source.text)) {
      const body = declarations.get(typeName);
      if (body === undefined) continue;
      const field = findColourField(body);
      if (field === null) continue;
      violations.push({ field, file: source.path, typeName });
    }
  }

  return violations.sort((a, b) => `${a.file}${a.typeName}`.localeCompare(`${b.file}${b.typeName}`));
}

// The cast targets themselves, whether or not they resolve — so a caller can report a target whose
// declaration was not found rather than silently treating it as clean.
export function findDataCastTargets(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(DATA_CAST)) {
    const name = match[1];
    if (name !== undefined && !STRUCTURAL_TYPES.has(name)) names.add(name);
  }
  return [...names].sort();
}

export interface DataCastColourViolation {
  field: string;
  file: string;
  typeName: string;
}

// A field whose name says it carries colour. Bounds, geometry and transforms are the expected payload of
// these casts; a colour field is the thing that would create a second store.
function findColourField(body: string): string | null {
  for (const line of body.split('\n')) {
    const match = line.match(/(?:readonly\s+)?(\w*(?:colou?r|tint)\w*)\s*\??\s*:/i);
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
}

// Interface bodies are matched to the closing brace at the same nesting depth rather than to the first
// `}`, because a fixed-size context window would swallow the following declaration and attribute its
// fields to this one — the exact defect this file's own history records.
function collectInterfaceBodies(sources: readonly TypeScriptSource[]): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const source of sources) {
    for (const match of source.text.matchAll(INTERFACE_HEAD)) {
      const name = match[1];
      const open = match.index + match[0].length - 1;
      if (name === undefined) continue;
      let depth = 0;
      for (let i = open; i < source.text.length; i++) {
        const char = source.text[i];
        if (char === '{') depth++;
        else if (char === '}') {
          depth--;
          if (depth === 0) {
            bodies.set(name, source.text.slice(open + 1, i));
            break;
          }
        }
      }
    }
  }
  return bodies;
}

function collectTypeScriptSources(root: string): TypeScriptSource[] {
  const sources: TypeScriptSource[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(path);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        sources.push({ path, text: readFileSync(path, 'utf8') });
      }
    }
  };
  walk(root);
  return sources;
}

interface TypeScriptSource {
  path: string;
  text: string;
}

const DATA_CAST = /\.data as (?:unknown as )?([A-Za-z_]\w*)/g;
const INTERFACE_HEAD = /(?:export )?interface (\w+)[^{]*\{/g;

// `Partial`, `Readonly` and `object` are wrappers or the empty type: they declare no fields of their own,
// so they can carry no colour and resolving them would only report their argument.
const STRUCTURAL_TYPES = new Set(['object', 'Partial', 'Readonly']);
