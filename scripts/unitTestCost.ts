// THE COST CONTRACT FOR THE DEFAULT UNIT LANE.
//
// `npm test` is the inner-loop command, so what it costs is a property worth governing rather than
// discovering. Measured on this tree: 29 of 1940 lane files carried 1.45% of the tests and 62.3% of the
// suite's CPU time, and every one of them was expensive for the SAME THREE REASONS — it started a child
// process, ran a bundler, or built a TypeScript program. Those are integration capabilities. A unit test
// that reaches for one is not a slow unit test, it is an integration test in the wrong lane.
//
// ★ THE RULE IS A CAPABILITY RULE, NOT A STOPWATCH, AND THAT IS DELIBERATE. A wall-clock budget cannot
// be made honest on a contended machine: the same file measured 3387ms and then timed out at 5000ms on
// one tree in this repository, and the comment that recorded it named the shape — UNBOUNDED WORK UNDER A
// FIXED DEADLINE manufactures red that teaches nothing. A capability is a static fact about the source,
// so this gate returns the same verdict on an idle laptop and a loaded CI box. Cost that is NOT
// capability-shaped — a brute-force march, a physics stress qualification — is honest unit work, and is
// reported by `npm run test:cost` rather than failed here.
//
// ★ WHAT THIS RULE DOES NOT CATCH, and do not read a green verdict as covering it. The three
// capabilities are module specifiers, so a file that walks the repository with `readdirSync` and
// `readFileSync` alone is INVISIBLE here — `scripts/backend-lifecycle.test.ts` and
// `scripts/host-phase3-surface.test.ts` each cost ~7s that way and this gate passes them. A fourth
// "walks-repository" predicate was considered and rejected: the honest signals for it (importing
// `readdirSync`, resolving a path to the repository root) are also what a test does against a temp
// directory, so it would report false violations, and a gate people learn to override is worse than a
// gate with a stated radius. `npm run test:cost` ranks those files by measured cost and leaves them
// untagged, which is where they get judged.
//
// The ledger below is a RATCHET, checked in both directions. A new file reaching for one of these
// capabilities fails; a ledger entry whose file has stopped reaching for it ALSO fails, because a list
// nobody prunes stops describing the tree and starts excusing it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type UnitTestCapability = 'builds-bundle' | 'runs-compiler' | 'spawns-process';

export interface UnitTestSource {
  path: string;
  source: string;
}

export interface UnitTestCapabilitySite {
  capability: UnitTestCapability;
  path: string;
  specifier: string;
}

export interface UnitTestCostExemption {
  capability: UnitTestCapability;
  path: string;
}

export interface UnitTestCostReport {
  scannedFiles: number;
  sites: readonly UnitTestCapabilitySite[];
  stale: readonly UnitTestCostExemption[];
  unexpected: readonly UnitTestCapabilitySite[];
}

/** The integration capability a module specifier carries into a test file, or null for ordinary imports. */
export function getUnitTestCapability(specifier: string): UnitTestCapability | null {
  if (specifier === 'node:child_process' || specifier === 'child_process') return 'spawns-process';
  if (specifier === 'rollup' || specifier === 'vite' || specifier === 'esbuild') return 'builds-bundle';
  if (specifier === 'typescript' || specifier === 'ts-morph') return 'runs-compiler';
  return null;
}

/** Every capability site in the given sources, at most one per file and capability, sorted. */
export function collectUnitTestCapabilitySites(sources: readonly UnitTestSource[]): UnitTestCapabilitySite[] {
  const sites: UnitTestCapabilitySite[] = [];
  const seen = new Set<string>();
  for (const { path, source } of sources) {
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1] ?? match[2] ?? '';
      const capability = getUnitTestCapability(specifier);
      if (capability === null) continue;
      const key = exemptionKey({ capability, path });
      if (seen.has(key)) continue;
      seen.add(key);
      sites.push({ capability, path, specifier });
    }
  }
  return sites.sort(compareSites);
}

/** Compares the tree against the ledger in BOTH directions: new offenders, and entries that went stale. */
export function checkUnitTestCost(
  sources: readonly UnitTestSource[],
  exemptions: readonly UnitTestCostExemption[] = UNIT_TEST_COST_EXEMPTIONS,
): UnitTestCostReport {
  const sites = collectUnitTestCapabilitySites(sources);
  const allowed = new Set(exemptions.map(exemptionKey));
  const present = new Set(sites.map(exemptionKey));
  return {
    scannedFiles: sources.length,
    sites,
    stale: exemptions.filter((entry) => !present.has(exemptionKey(entry))).sort(compareSites),
    unexpected: sites.filter((site) => !allowed.has(exemptionKey(site))),
  };
}

// Owned beside the type it builds, so a fixture needing a valid report supplies a new field once.
export function createEmptyUnitTestCostReport(): UnitTestCostReport {
  return { scannedFiles: 0, sites: [], stale: [], unexpected: [] };
}

export function readUnitTestSources(root: string, paths: readonly string[]): UnitTestSource[] {
  return paths.map((path) => ({ path, source: readFileSync(resolve(root, path), 'utf8') }));
}

export function formatUnitTestCostReport(report: Readonly<UnitTestCostReport>): string {
  const lines: string[] = [];
  for (const { capability, path, specifier } of report.unexpected) {
    lines.push(
      `  ! ${path} imports "${specifier}" — ${capability} is an integration capability, not unit work. ` +
        `Move the case to the gate that owns it, or record it in UNIT_TEST_COST_EXEMPTIONS with a reason.`,
    );
  }
  for (const { capability, path } of report.stale) {
    lines.push(`  ! ${path} is exempted for ${capability} but no longer reaches for it — drop the entry.`);
  }
  const sites = report.sites.length;
  const verdict =
    lines.length === 0
      ? `OK Default unit lane holds its cost contract (${report.scannedFiles} files, ${sites} exempted capability site${sites === 1 ? '' : 's'})`
      : `! ${lines.length} unit-lane cost contract issue${lines.length === 1 ? '' : 's'}`;
  return [verdict, ...lines].join('\n');
}

function exemptionKey({ capability, path }: Readonly<UnitTestCostExemption>): string {
  return `${path} ${capability}`;
}

function compareSites(a: Readonly<UnitTestCostExemption>, b: Readonly<UnitTestCostExemption>): number {
  return a.path.localeCompare(b.path) || a.capability.localeCompare(b.capability);
}

// Static and dynamic spellings alike: `await import('rollup')` costs exactly what the static form costs,
// so matching only `from '...'` would leave the cheaper spelling of the same work unpoliced.
const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/gu;

// The files that already reached for an integration capability when this gate was written. Each is a
// candidate for relocation, not a permanent grant; shrinking this list is the point of the gate.
export const UNIT_TEST_COST_EXEMPTIONS: readonly UnitTestCostExemption[] = [
  // BUILDS-BUNDLE — each runs a real Rollup/Vite/esbuild build to prove a tree-shaking or packaging
  // claim. That claim is the SIZE harness's job: `tools/size` already bundles its fixtures against a
  // committed baseline, and AGENTS.md names `npm run size` as the checkpoint for tree-shaking changes.
  // Folding these in needs the size baseline to record a MODULE LIST per case, not only a byte count,
  // because several assert module-set isolation rather than bytes.
  { capability: 'builds-bundle', path: 'packages/gizmo/src/gizmoTreeShaking.test.ts' },
  { capability: 'builds-bundle', path: 'packages/gui/src/guiTreeShaking.test.ts' },
  { capability: 'builds-bundle', path: 'packages/host-electron/src/electronHostTreeShaking.test.ts' },
  { capability: 'builds-bundle', path: 'packages/host-tauri/src/tauriPackage.test.ts' },
  { capability: 'builds-bundle', path: 'packages/host-web/src/evidence.test.ts' },
  { capability: 'builds-bundle', path: 'packages/layout/src/layoutTreeShaking.test.ts' },
  { capability: 'builds-bundle', path: 'packages/render-gl/src/glContext.test.ts' },
  { capability: 'builds-bundle', path: 'packages/scene3d-formats/src/gltfTreeShaking.test.ts' },
  { capability: 'builds-bundle', path: 'packages/scene3d-resources/src/sceneResourceResolverTreeShaking.test.ts' },
  { capability: 'builds-bundle', path: 'packages/skeleton2d-formats/src/spineBinaryTreeShaking.test.ts' },

  // RUNS-COMPILER — builds a TypeScript program to assert a structural rule over real source.
  { capability: 'runs-compiler', path: 'packages/host-tauri/src/tauriPackage.test.ts' },

  // ★ SPAWNS-PROCESS IS EXEMPTED HERE ONLY BECAUSE THERE IS NOWHERE ELSE TO PUT IT, and that is a
  // hole, not an endorsement. These two drive real executables — `npm`, `tsc`, a packaging CLI — which
  // is what the rule exists to keep out of the inner loop. They were routed to a dedicated integration
  // project; the single-flat-runner refactor removed that project, `npm run test:integration` is now an
  // echo, and the gate that ran it is commented out in `scripts/check.ts`. So the exemption records
  // where they landed rather than claiming they belong here. Give them a runner and they leave the
  // ledger — the ratchet's stale-entry half will then insist on it.
  { capability: 'spawns-process', path: 'packages/host-tauri/src/tauriHost.test.ts' },
  { capability: 'spawns-process', path: 'packages/host-tauri/src/tauriPackage.test.ts' },
];
