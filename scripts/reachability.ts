import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import pc from 'picocolors';

import {
  auditEffectBackend,
  collectRegistrarKindConstants,
  collectRegistrarOwnership,
  collectReachabilityLanes,
  defaultCompositionSymbols,
  effectReachabilitySymbols,
} from './reachability-core';
import type {
  EffectBackend,
  ReachabilityLaneEntry,
  ReachabilityViolation,
  RegistrarOwnershipEntry,
  UncataloguedRegistrarBucket,
} from './reachability-core';
import {
  collectRegistrarIdentities,
  diffRegistrarIdentityManifest,
  hasRegistrarIdentityManifestDrift,
} from './reachability-registrar-manifest';
import type {
  RegistrarIdentity,
  RegistrarIdentityManifest,
  RegistrarIdentityManifestDiff,
} from './reachability-registrar-manifest';
import { getSelectors, selectPackages } from './select';

interface ReachabilityBaseline {
  schemaVersion: 1;
  entries: ReachabilityLaneEntry[];
}

interface LaneDrift {
  packageName: string;
  symbol: string;
  before: Pick<ReachabilityLaneEntry, 'dot' | 'contract'> | null;
  after: Pick<ReachabilityLaneEntry, 'dot' | 'contract'> | null;
}

const UNCATALOGUED_BUCKETS: readonly {
  bucket: UncataloguedRegistrarBucket;
  label: string;
  number: string;
}[] = [
  { bucket: 'kind-identifier', label: 'Kind is an Identifier', number: '1.' },
  { bucket: 'kind-member-or-computed', label: 'Kind is a member/computed expression', number: '2.' },
  { bucket: 'implementation-call-result', label: 'Implementation is a call result', number: '3a.' },
  { bucket: 'implementation-inline', label: 'Implementation is an inline arrow/object', number: '3b.' },
  { bucket: 'callee-expression', label: 'Callee is not a bare Identifier', number: '4.' },
  { bucket: 'hidden-loop-or-array', label: 'Registers through a hidden loop or array', number: '5.' },
  { bucket: 'not-kind-registration', label: 'Not a kind-registration', number: '6.' },
];

const root = process.cwd();
const baselinePath = join(root, 'scripts', 'reachability-baseline.json');
const registrarManifestPath = join(root, 'scripts', 'reachability-registrars.json');
const checkMode = process.argv.includes('--check');
const jsonMode = process.argv.includes('--json');
const updateMode = process.argv.includes('--update');
const updateRegistrarManifestMode = process.argv.includes('--update-registrars');
const selectors = getSelectors();
if (updateMode && selectors.length > 0) throw new Error('Reachability baseline updates must be whole-repo');
if (updateRegistrarManifestMode && selectors.length > 0)
  throw new Error('Reachability registrar manifest updates must be whole-repo');
if (updateMode && updateRegistrarManifestMode)
  throw new Error('Reachability lane and registrar manifests have separate acceptance paths');

const selected = selectPackages(selectors);
const sourceFilesByPackage = new Map(selectPackages([]).map((name) => [name, packageSourceFiles(name)]));
const constants = collectRegistrarKindConstants([...sourceFilesByPackage.values()].flat());

const violations: ReachabilityViolation[] = [];
const lanes: ReachabilityLaneEntry[] = [];
const registrarOwnership: RegistrarOwnershipEntry[] = [];
for (const name of selected) {
  const sourceDir = join(root, 'packages', name, 'src');
  if (!existsSync(sourceDir)) continue;
  const sourceFiles = sourceFilesByPackage.get(name) ?? [];
  registrarOwnership.push(...collectRegistrarOwnership({ constants, packageName: name, sourceFiles }));

  const publicEntry = join(sourceDir, 'index.ts');
  const contractEntry = join(sourceDir, 'contract.ts');
  if (!existsSync(publicEntry) || !existsSync(contractEntry)) continue;
  const backend = effectBackend(name);
  const symbols = defaultCompositionSymbols(sourceFiles);
  if (backend !== null) {
    violations.push(...auditEffectBackend({ backend, sourceFiles }));
    for (const symbol of effectReachabilitySymbols(backend, sourceFiles)) symbols.add(symbol);
  }
  lanes.push(...collectReachabilityLanes({ packageName: name, publicEntry, contractEntry, symbols }));
}

violations.sort(compareNamed);
lanes.sort(compareNamed);
registrarOwnership.sort(compareRegistrarOwnership);
const registrarIdentities = collectRegistrarIdentities(registrarOwnership);

if (updateMode) {
  const baseline: ReachabilityBaseline = { schemaVersion: 1, entries: lanes };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`${pc.green('OK')} ${pc.bold(`Updated reachability lane baseline (${lanes.length} symbols)`)}`);
  process.exit(0);
}

if (updateRegistrarManifestMode) {
  const manifest: RegistrarIdentityManifest = { schemaVersion: 1, registrars: registrarIdentities };
  writeFileSync(registrarManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `${pc.green('OK')} ${pc.bold(`Updated reachability registrar manifest (${registrarIdentities.length} identities)`)}`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as ReachabilityBaseline;
if (baseline.schemaVersion !== 1) throw new Error(`Unsupported reachability baseline schema ${baseline.schemaVersion}`);
const laneDrift = diffLanes(
  baseline.entries.filter((entry) => selected.includes(entry.packageName)),
  lanes,
);
const registrarManifest = JSON.parse(readFileSync(registrarManifestPath, 'utf8')) as RegistrarIdentityManifest;
if (registrarManifest.schemaVersion !== 1)
  throw new Error(`Unsupported reachability registrar manifest schema ${registrarManifest.schemaVersion}`);
const registrarManifestDiff = diffRegistrarIdentityManifest(
  registrarManifest.registrars.filter((identity) => selected.includes(identity.packageName)),
  registrarIdentities,
);
const effectsPassed = violations.length === 0;
const registrarManifestPassed = !hasRegistrarIdentityManifestDrift(registrarManifestDiff);
const hardPassed = effectsPassed && registrarManifestPassed;
const registrarOwnershipSummary = summarizeRegistrarOwnership(registrarOwnership);

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        passed: hardPassed,
        violations,
        registrarManifestDiff,
        laneDrift,
        registrarOwnershipSummary,
        registrarOwnership,
      },
      null,
      2,
    ),
  );
  process.exitCode = !hardPassed && checkMode ? 1 : 0;
}

if (!jsonMode) {
  if (effectsPassed) {
    console.log(`${pc.green('OK')} ${pc.bold('Built-in runners and per-kind registrars are exact inverses')}`);
  } else {
    console.log(
      `${pc.red('✗')} ${pc.bold(`${violations.length} hard capability violation${violations.length === 1 ? '' : 's'}`)}\n`,
    );
    for (const violation of violations) {
      console.log(
        `  ${pc.red('✗')} ${pc.white(violation.packageName)} ${pc.bold(violation.symbol)} ${pc.dim(`[${violation.rule}] ${violation.detail}`)}`,
      );
    }
  }

  const uncatalogued = registrarOwnership.filter((entry) => entry.status === 'UNCATALOGUED');
  const mechanisms = registrarOwnership.filter((entry) => entry.status === 'mechanism');
  const excluded = uncatalogued.filter((entry) => entry.uncataloguedBucket === 'not-kind-registration');
  console.log(
    `${pc.green('OK')} ${pc.bold(`${registrarOwnershipSummary.registrars} exported registrars inventoried`)} ${pc.dim(`(${registrarOwnershipSummary.readableRegistrars} readable registrars / ${registrarOwnershipSummary.mappings} mappings, ${mechanisms.length} mechanisms, ${uncatalogued.length} UNCATALOGUED)`)}`,
  );
  printRegistrarManifestDiff(registrarManifestDiff, registrarIdentities.length);
  console.log(pc.dim('  Caller-supplied kinds belong to the registrar mechanism, not the ownership denominator.'));
  for (const shape of ['caller-supplied-kind', 'caller-supplied-batch'] as const) {
    const entries = mechanisms.filter((entry) => entry.mechanismShape === shape);
    const examples = entries
      .slice(0, 2)
      .map((entry) => `${entry.packageName}:${entry.registrar}`)
      .join(', ');
    console.log(
      `  ${pc.cyan('M.')} ${pc.bold(shape)}: ${entries.length}${examples.length > 0 ? pc.dim(` — ${examples}`) : ''}`,
    );
  }
  console.log(
    pc.dim(
      `  ${uncatalogued.length - excluded.length} recorder misses after excluding ${excluded.length} not-kind-registration rows from the miss denominator`,
    ),
  );
  for (const bucket of UNCATALOGUED_BUCKETS) {
    const entries = uncatalogued.filter((entry) => entry.uncataloguedBucket === bucket.bucket);
    const examples = entries
      .slice(0, 2)
      .map((entry) => `${entry.packageName}:${entry.registrar}`)
      .join(', ');
    console.log(
      `  ${pc.yellow(bucket.number)} ${pc.bold(bucket.label)}: ${entries.length}${examples.length > 0 ? pc.dim(` — ${examples}`) : ''}`,
    );
  }
  for (const entry of uncatalogued) {
    console.log(
      `  ${pc.yellow('!')} ${pc.white(entry.packageName)} ${pc.bold(entry.registrar)} ${pc.dim(`[UNCATALOGUED: ${entry.uncataloguedBucket ?? 'missing-classification'}]`)}`,
    );
  }
  for (const entry of mechanisms) {
    console.log(
      `  ${pc.cyan('M')} ${pc.white(entry.packageName)} ${pc.bold(entry.registrar)} ${pc.dim(`[MECHANISM: ${entry.mechanismShape ?? 'missing-classification'}]`)}`,
    );
  }

  if (laneDrift.length === 0) {
    console.log(`${pc.green('OK')} ${pc.bold('Reachability lane baseline unchanged')}`);
  } else {
    console.log(
      `\n${pc.yellow('!')} ${pc.bold(`${laneDrift.length} reachability lane change${laneDrift.length === 1 ? '' : 's'} (non-blocking)`)}`,
    );
    for (const drift of laneDrift) {
      console.log(
        `  ${pc.yellow(laneMarker(drift))} ${pc.white(drift.packageName)} ${pc.bold(drift.symbol)} ${pc.dim(`${formatLane(drift.before)} → ${formatLane(drift.after)}`)}`,
      );
    }
    console.log(
      pc.dim('  Review the moves, then run npm run reachability:baseline to accept the curated lane placement.'),
    );
  }

  process.exitCode = !hardPassed && checkMode ? 1 : 0;
}

function printRegistrarManifestDiff(diff: Readonly<RegistrarIdentityManifestDiff>, currentCount: number): void {
  if (diff.added.length === 0 && diff.lost.length === 0) {
    console.log(
      `${pc.green('OK')} ${pc.bold('Registrar census matches committed identity manifest')} ${pc.dim(`(${currentCount} identities)`)}`,
    );
    return;
  }
  console.log(
    `\n${pc.red('✗')} ${pc.bold('Registrar identity manifest drift')} ${pc.dim(`(${diff.added.length} added / ${diff.lost.length} lost)`)}`,
  );
  for (const identity of diff.lost) {
    console.log(`  ${pc.red('-')} ${formatRegistrarIdentity(identity)} ${pc.red('[LOST]')}`);
  }
  for (const identity of diff.added) {
    console.log(`  ${pc.yellow('+')} ${formatRegistrarIdentity(identity)} ${pc.yellow('[ADDED]')}`);
  }
  console.log(
    pc.dim(
      '  Review every identity change, then run npm run reachability:registrars:baseline to accept the whole-repo census.',
    ),
  );
}

function formatRegistrarIdentity(identity: Readonly<RegistrarIdentity>): string {
  return `${pc.white(identity.packageName)} ${pc.bold(identity.registrar)}`;
}

function summarizeRegistrarOwnership(entries: readonly RegistrarOwnershipEntry[]) {
  const registrarKeys = (matching: (entry: RegistrarOwnershipEntry) => boolean): Set<string> =>
    new Set(entries.filter(matching).map((entry) => `${entry.packageName}\0${entry.registrar}`));
  return {
    registrars: registrarKeys(() => true).size,
    readableRegistrars: registrarKeys((entry) => entry.status === 'catalogued').size,
    mappings: entries.filter((entry) => entry.status === 'catalogued').length,
    mechanisms: registrarKeys((entry) => entry.status === 'mechanism').size,
    uncatalogued: registrarKeys((entry) => entry.status === 'UNCATALOGUED').size,
  };
}

function diffLanes(before: readonly ReachabilityLaneEntry[], after: readonly ReachabilityLaneEntry[]): LaneDrift[] {
  const beforeByKey = new Map(before.map((entry) => [laneKey(entry), entry]));
  const afterByKey = new Map(after.map((entry) => [laneKey(entry), entry]));
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
  const drift: LaneDrift[] = [];
  for (const key of [...keys].sort()) {
    const previous = beforeByKey.get(key);
    const current = afterByKey.get(key);
    if (previous?.dot === current?.dot && previous?.contract === current?.contract) continue;
    const named = current ?? previous;
    if (named === undefined) continue;
    drift.push({
      packageName: named.packageName,
      symbol: named.symbol,
      before: previous === undefined ? null : { dot: previous.dot, contract: previous.contract },
      after: current === undefined ? null : { dot: current.dot, contract: current.contract },
    });
  }
  return drift;
}

function laneKey(entry: Pick<ReachabilityLaneEntry, 'packageName' | 'symbol'>): string {
  return `${entry.packageName}\0${entry.symbol}`;
}

function laneMarker(drift: LaneDrift): string {
  if (drift.before === null) return '+';
  if (drift.after === null) return '-';
  return '~';
}

function formatLane(lane: LaneDrift['before']): string {
  if (lane === null) return 'absent';
  const names = [lane.dot ? '.' : null, lane.contract ? './contract' : null].filter(Boolean);
  return names.length === 0 ? 'unexported' : names.join(' + ');
}

function compareNamed(
  a: Pick<ReachabilityLaneEntry, 'packageName' | 'symbol'>,
  b: Pick<ReachabilityLaneEntry, 'packageName' | 'symbol'>,
): number {
  return a.packageName.localeCompare(b.packageName) || a.symbol.localeCompare(b.symbol);
}

function compareRegistrarOwnership(a: RegistrarOwnershipEntry, b: RegistrarOwnershipEntry): number {
  return (
    a.packageName.localeCompare(b.packageName) ||
    a.registrar.localeCompare(b.registrar) ||
    (a.door ?? '').localeCompare(b.door ?? '') ||
    (a.kind ?? '').localeCompare(b.kind ?? '') ||
    (a.implementation ?? '').localeCompare(b.implementation ?? '')
  );
}

function effectBackend(packageName: string): EffectBackend | null {
  if (packageName === 'effects-canvas') return 'canvas';
  if (packageName === 'effects-gl') return 'gl';
  if (packageName === 'effects-wgpu') return 'wgpu';
  return null;
}

function packageSourceFiles(packageName: string): string[] {
  const sourceDir = join(root, 'packages', packageName, 'src');
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        entry.name !== 'index.ts' &&
        entry.name !== 'contract.ts' &&
        !entry.name.endsWith('.test.ts'),
    )
    .map((entry) => join(sourceDir, entry.name));
}
