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
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { SCAN_SKIP_DIRECTORIES } from './scanSkipDirectories';

// The render-backend token vocabulary. Closed on purpose: this scan validates a token against types
// exported by @flighthq/types, so a token whose types are not here would govern nothing — an inert
// entry reads like coverage while checking no name. A backend gains its token when its seam types
// land in @flighthq/types, not when the backend is planned. Non-web backends built in sibling repos
// (`render-cairo`, `scene2d-cairo` in flight-hx) are chartered under agents/packages/ with `spunOut`
// front matter and enter here at that point; see agents/conventions/export-lanes.md.
//
// Distinct from the harness backend lists (`FUNCTIONAL_BACKENDS`, `SANDBOX_VERIFIABLE`,
// `CapturePageTargetOptions.renderer`), which enumerate what the browser-driven capture harness can
// actually drive. Those are correctly web-only and must not gain a token a baseline cannot support.
const BACKENDS = ['Canvas', 'Dom', 'Gl', 'Wgpu'] as const;

// The shared generated-output set, plus the four this scan skips for its own reasons: agent and editor
// state, and sibling checkouts whose sources are not this tree's to judge. This walk is rooted at
// `packages/`, so the shared entries are defensive rather than load-bearing here — it shares the set so
// the list cannot drift into a fifth spelling, which is the whole reason the set was extracted.
const IGNORED_DIRS = new Set([...SCAN_SKIP_DIRECTORIES, '.claude', '.quimby', 'worktrees', 'incoming']);

// Genuinely-intentional escapes, named with a reason, never silently.
//
// Empty, and that is its correct resting state — it exists for genuine one-off deviations, so a permanent
// resident would quietly become a second, unchecked tier. `registerDefaultGlBlendModes` sat here until the
// singular-registrar proof path below was added: it was never an escape, it was a name the checker had
// only one way to prove. AN ESCAPE THAT DISSOLVES UNDER A CORRECT WIDENING WAS A MISCLASSIFICATION, NOT A
// DEVIATION.
const ALLOW: { name: string; why: string }[] = [];

// ★ IMPORTING THIS MODULE MUST NOT RUN THE SCAN. The negative controls in backendPrefix.test.ts import
// `findWedgedBackendSegment`, and a top-level scan would exit the test process before a single case ran —
// which is exactly how it failed the first time. Same side-effect-free-import rule the SDK packages obey,
// applied to a script: the work happens when this file is invoked, not when it is read.
const root = process.cwd();

interface Violation {
  path: string;
  name: string;
  segment: string;
}

export interface BackendPrefixScan {
  scanned: number;
  allowed: number;
  violations: Violation[];
}

// ★ THE SCAN RETURNS ITS RESULT; ONLY THE CLI EXITS. Splitting these is what lets a test call the ENTRY
// POINT rather than only the predicate — and the entry point is where the wiring lives. A suite that
// exercises only the pure rule covers the RULE while silently claiming to cover the GATE: a refactor can
// strand a module-scope reference and leave every predicate case green with the gate dead. That happened
// here (a ReferenceError in packageOf, five tests passing, backend-prefix:check broken), which is why
// this seam exists rather than main() doing the work and calling process.exit itself.
export function runBackendPrefixScan(): BackendPrefixScan {
  const exportedTypes = collectExportedTypes(join(root, 'packages', 'types', 'src'));
  const sourceFiles: string[] = [];
  walk(join(root, 'packages'), sourceFiles);
  const registrarsByPackage = collectRegistrarsByPackage(sourceFiles);

  const violations: Violation[] = [];
  let allowed = 0;
  let scanned = 0;

  for (const path of sourceFiles) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/export function (register[A-Za-z0-9]+)/g)) {
      const name = match[1];
      scanned++;
      const segment = findWedgedBackendSegment(
        name,
        registrarsByPackage.get(packageOf(path)) ?? new Set(),
        exportedTypes,
      );
      if (segment === null) continue;
      if (ALLOW.some((a) => a.name === name)) {
        allowed++;
        continue;
      }
      violations.push({ path: relative(root, path), name, segment });
    }
  }

  return { allowed, scanned, violations };
}

function main(): void {
  const checkMode = process.argv.slice(2).includes('--check');
  const { allowed, scanned, violations } = runBackendPrefixScan();

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
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();

// The segment from a wedged backend token to the end of the name, or null when the name is compliant.
// A token is wedged when it is non-initial, is followed by a further word, and the segment it opens does
// not name a type — which is exactly the shape a split type name has.
export function findWedgedBackendSegment(
  name: string,
  packageRegistrars: ReadonlySet<string>,
  types: ReadonlySet<string>,
): string | null {
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
      if (namesType(segment, types)) continue;
      if (namesSingularRegistrar(segment, packageRegistrars)) continue;
      return segment;
    }
  }
  return null;
}

// Whether `segment` names an exported type, allowing the plural a set-registrar uses
// (GlTextureResolvers -> GlTextureResolver).
function namesType(segment: string, types: ReadonlySet<string>): boolean {
  if (types.has(segment)) return true;
  return segment.endsWith('s') && types.has(segment.slice(0, -1));
}

// The second proof path: a mid-name PLURAL AGGREGATE is compliant when singularizing the segment names
// an exported singular registrar IN THE SAME PACKAGE. `registerDefaultGlBlendModes` is proved by
// `registerGlBlendMode`, whose own compliance came the hard way through the type `BlendMode`.
//
// ★ THIS IS A SECOND SPELLING OF THE SAME PROOF, NOT A SOFTENING, and someone will eventually read it as
// one. The proof is TRANSITIVE: the aggregate is proved by the singular registrar, and that registrar was
// proved against a real exported type. THE CHAIN STILL BOTTOMS OUT IN @flighthq/types — a rule that
// learns a second route to the same ground has not weakened. What it stops requiring is that every
// aggregate invent a plural TYPE nobody needs purely to satisfy the checker.
//
// Locality is deliberate and is the tightening over the general form: the singular registrar must be
// exported from the SAME PACKAGE. A proof that has to travel is a proof that can drift, and a
// coincidental cross-package name-match would prove nothing about this name. If a legitimate
// cross-package case appears, it should FAIL here and be ruled on, not be pre-permitted.
function namesSingularRegistrar(segment: string, packageRegistrars: ReadonlySet<string>): boolean {
  if (!segment.endsWith('s')) return false;
  return packageRegistrars.has(`register${segment.slice(0, -1)}`);
}

function packageOf(path: string): string {
  return relative(root, path).split(sep)[1] ?? '';
}

function collectRegistrarsByPackage(paths: readonly string[]): Map<string, Set<string>> {
  const byPackage = new Map<string, Set<string>>();
  for (const path of paths) {
    const owner = packageOf(path);
    let names = byPackage.get(owner);
    if (names === undefined) {
      names = new Set();
      byPackage.set(owner, names);
    }
    for (const match of readFileSync(path, 'utf8').matchAll(/export function (register[A-Za-z0-9]+)/g)) {
      names.add(match[1]);
    }
  }
  return byPackage;
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
