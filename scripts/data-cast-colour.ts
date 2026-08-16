import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// `NodeData` is `object`, so a `node.data as SomeType` cast can attach fields the declared data type does
// not carry — nine such sites exist today and every one stores geometry. That is a fact about what the
// codebase currently does, not something the type system forbids, so it decays silently: the next cast to
// introduce a colour field would create a second colour store nobody enumerated. This turns the snapshot
// into a maintained invariant. See the boundary sequence in `agents/inert-gate-audit.md`.
//
// Every tree that can contain a cast is scanned, not just `packages/`. Scenes and examples hold no such
// cast today, but "today" is the decaying kind of claim this file exists to replace, so the population is
// widened rather than justified.
export function findDataCastColourViolations(repoRoot: string): DataCastColourViolation[] {
  const sources = SCANNED_TREES.flatMap((tree) => collectTypeScriptSources(join(repoRoot, tree)));
  const declarations = collectInterfaceBodies(sources);
  const aliases = collectTypeAliases(sources);
  const violations: DataCastColourViolation[] = [];

  for (const source of sources) {
    for (const typeName of findDataCastTargets(source.text)) {
      const field = findColourField(typeName, declarations, aliases, new Set());
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

// Colour is found by FLOW, not by spelling. A name-only filter answers "does this type declare a field
// literally called colour" while being read as "does this type carry a colour" — the same defect that made
// an earlier enumeration miss six functions taking a `MorphShapeColorEndpoint` struct, in which no
// parameter is spelled colour. So a field whose declared TYPE resolves to another interface is followed
// into that interface. `seen` breaks reference cycles; the dotted path is returned so a report names where
// the colour actually lives rather than the field that merely leads to it.
function findColourField(
  typeName: string,
  declarations: ReadonlyMap<string, string>,
  aliases: ReadonlyMap<string, string>,
  seen: Set<string>,
): string | null {
  if (seen.has(typeName)) return null;
  seen.add(typeName);

  const body = declarations.get(typeName) ?? declarations.get(aliases.get(typeName) ?? '');
  if (body === undefined) return null;

  for (const line of body.split('\n')) {
    const declaration = line.match(/(?:readonly\s+)?(\w+)\s*\??\s*:\s*([^;,]+)/);
    if (declaration?.[1] === undefined || declaration[2] === undefined) continue;

    const [, field, declaredType] = declaration;
    if (/colou?r|tint/i.test(field)) return field;

    for (const candidate of declaredType.matchAll(/[A-Za-z_]\w*/g)) {
      const nested = findColourField(candidate[0], declarations, aliases, seen);
      if (nested !== null) return `${field}.${nested}`;
    }
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

// `type Alias = SomeInterface;` is 15-strong in this repo, so a field declared through one would
// otherwise resolve to nothing and read as colourless. Only the bare single-identifier form is followed:
// a generic instantiation (`Map<string, T>`) is NOT resolved, which is the stated bound of this checker.
function collectTypeAliases(sources: readonly TypeScriptSource[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const source of sources) {
    for (const match of source.text.matchAll(TYPE_ALIAS)) {
      if (match[1] !== undefined && match[2] !== undefined) aliases.set(match[1], match[2]);
    }
  }
  return aliases;
}

function collectTypeScriptSources(root: string): TypeScriptSource[] {
  const sources: TypeScriptSource[] = [];
  if (!existsSync(root)) return sources;
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

// Every tree that can hold a `.data as` cast. `scripts` is excluded deliberately: this checker's own
// colocated test declares cast fixtures as string literals, and scanning them would report the fixtures
// as repository violations.
const SCANNED_TREES = ['packages', 'functional', 'examples', 'conformance', 'tools'];
const INTERFACE_HEAD = /(?:export )?interface (\w+)[^{]*\{/g;
const TYPE_ALIAS = /(?:export )?type (\w+) = ([A-Za-z_]\w*);/g;

// `Partial`, `Readonly` and `object` are wrappers or the empty type: they declare no fields of their own,
// so they can carry no colour and resolving them would only report their argument.
const STRUCTURAL_TYPES = new Set(['object', 'Partial', 'Readonly']);
