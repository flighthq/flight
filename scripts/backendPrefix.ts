// Enforces the backend-token placement rule on registrar names: THE RENDER BACKEND TOKEN PREFIXES THE
// TYPE. A registrar is `register` + its target type name with the backend glued to the front of that
// type — `registerGlToonMaterial`, because the type is `ToonMaterial`. Anything that is NOT part of the
// type name stays in front of that whole unit, which is why `registerBuiltInGlModifierSnippets` is
// correct as written: `BuiltIn` is an adjective on the set, and `GlModifierSnippet` is a real type with
// its backend already in front.
//
// The rule is not new. The TYPE layer has always obeyed it — GlTextureResolver, WgpuModifierSnippet,
// CanvasMaterialRenderer, GlMeshMaterialRenderer — and what drifted was the function layer, for two
// families: 33 material registrars and 7 PBR-extension registrars had grown as
// `register<Kind><Backend><Thing>`, splitting the type name with the backend wedged inside it
// (`registerSpecularGlossinessPbrGlMaterial` for the type `SpecularGlossinessPbrMaterial`). Finding that
// took a hand survey of 268 exported registrars. This scan is the check that would have caught it on the
// first one, and it answers any future case the same way the rule does: go look at the type name.
//
// The test: when a backend token sits at a non-initial position and is followed by another word, the
// segment from that token to the end of the name must itself be a type exported by @flighthq/types. If
// it is, the backend is already glued to its type and whatever precedes it is an adjective. If it is
// not, the token is wedged inside a type name that has been split around it.
//
// Deliberately scoped to `register*`. A backend token appears mid-name in plenty of correct non-registrar
// functions (`drawGlFullscreenPass`, `applyBlendEffectToGl`) where the trailing segment is not meant to
// name a type, and widening the scan to those would trade a precise rule for a noisy one.
//
// Same allowlist-with-a-reason shape as scripts/portable.ts and scripts/mocks.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import pc from 'picocolors';

const BACKENDS = ['Canvas', 'Dom', 'Gl', 'Wgpu'] as const;

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
  '.cache',
  '.git',
  '.idea',
  '.vscode',
  '.claude',
  '.quimby',
  'worktrees',
  'incoming',
]);

// Genuinely-intentional escapes, named with a reason, never silently.
const ALLOW: { name: string; why: string }[] = [
  {
    name: 'registerDefaultGlBlendModes',
    why: 'There is no GlBlendMode type to prefix. This registers a GlBlendRealization keyed by the backend-free BlendMode node enum, so the rule has no type to test against and the name is neither right nor wrong under it. Naming it truthfully (registerGlDefaultBlendRealizations?) is a ruling nobody has made; recorded here rather than left to look compliant.',
  },
];

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const root = process.cwd();

interface Violation {
  path: string;
  name: string;
  segment: string;
}

const exportedTypes = collectExportedTypes(join(root, 'packages', 'types', 'src'));
const sourceFiles: string[] = [];
walk(join(root, 'packages'), sourceFiles);

const violations: Violation[] = [];
let allowed = 0;
let scanned = 0;

for (const path of sourceFiles) {
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(/export function (register[A-Za-z0-9]+)/g)) {
    const name = match[1];
    scanned++;
    const segment = findWedgedBackendSegment(name);
    if (segment === null) continue;
    if (ALLOW.some((a) => a.name === name)) {
      allowed++;
      continue;
    }
    violations.push({ path: relative(root, path), name, segment });
  }
}

if (violations.length === 0) {
  console.log(
    `${pc.green('OK')} ${pc.bold('Registrar names prefix the backend to the type')} ${pc.dim(`(${scanned} registrars, ${allowed} named escape${allowed === 1 ? '' : 's'} allow-listed)`)}`,
  );
  process.exit(0);
}

console.log(
  `${pc.yellow('!')} ${pc.bold(`${violations.length} registrar name${violations.length === 1 ? '' : 's'} split a type around a backend token`)}\n`,
);
for (const v of violations) {
  console.log(
    `  ${pc.yellow('!')} ${pc.white(`${v.path}`)} ${pc.bold(v.name)} ${pc.dim(`— "${v.segment}" is not a type in @flighthq/types; move the backend token to the front of the type name`)}`,
  );
}
console.log(
  `\n${pc.dim('The backend token prefixes the type: register + Backend + TypeName. If the leading words are an adjective on the set rather than part of the type, the backend is already correct where it is and the trailing segment will name a real type. If the name genuinely has no type to test against, add it to ALLOW in scripts/backendPrefix.ts with a reason.')}`,
);
process.exit(checkMode ? 1 : 0);

// The segment from a wedged backend token to the end of the name, or null when the name is compliant.
// A token is wedged when it is non-initial, is followed by a further word, and the segment it opens does
// not name a type — which is exactly the shape a split type name has.
function findWedgedBackendSegment(name: string): string | null {
  const rest = name.slice('register'.length);
  for (const backend of BACKENDS) {
    let from = 0;
    for (;;) {
      const at = rest.indexOf(backend, from);
      if (at < 0) break;
      from = at + 1;
      const after = at + backend.length;
      // Initial: already prefixing. Trailing: the backend is the target itself, not a wedge.
      if (at === 0 || after >= rest.length) continue;
      // Mid-word, e.g. the "Gl" inside "Glossiness" — not a token at all.
      if (!isUpperCase(rest[after])) continue;
      const segment = rest.slice(at);
      if (namesType(segment)) continue;
      return segment;
    }
  }
  return null;
}

// Whether `segment` names an exported type, allowing the plural a set-registrar uses
// (GlTextureResolvers -> GlTextureResolver).
function namesType(segment: string): boolean {
  if (exportedTypes.has(segment)) return true;
  return segment.endsWith('s') && exportedTypes.has(segment.slice(0, -1));
}

function isUpperCase(char: string): boolean {
  return char >= 'A' && char <= 'Z';
}

function collectExportedTypes(dir: string): Set<string> {
  const names = new Set<string>();
  if (!existsSync(dir)) return names;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      for (const name of collectExportedTypes(join(dir, entry.name))) names.add(name);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const text = readFileSync(join(dir, entry.name), 'utf8');
    for (const match of text.matchAll(/export (?:interface|type|const|enum) ([A-Za-z0-9_]+)/g)) names.add(match[1]);
  }
  return names;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(path, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(path);
  }
}
