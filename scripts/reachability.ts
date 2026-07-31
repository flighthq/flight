import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import pc from 'picocolors';
import { Project } from 'ts-morph';

import {
  auditEffectBackend,
  collectReachabilityLanes,
  defaultCompositionSymbols,
  effectReachabilitySymbols,
} from './reachability-core';
import type { EffectBackend, ReachabilityLaneEntry, ReachabilityViolation } from './reachability-core';
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

const root = process.cwd();
const baselinePath = join(root, 'scripts', 'reachability-baseline.json');
const checkMode = process.argv.includes('--check');
const jsonMode = process.argv.includes('--json');
const updateMode = process.argv.includes('--update');
const selectors = getSelectors();
if (updateMode && selectors.length > 0) throw new Error('Reachability baseline updates must be whole-repo');

const selected = selectPackages(selectors);
const project = new Project({ tsConfigFilePath: join(root, 'tsconfig.base.json'), skipAddingFilesFromTsConfig: true });
for (const name of selected) project.addSourceFilesAtPaths(join(root, 'packages', name, 'src', '*.ts'));

const violations: ReachabilityViolation[] = [];
const lanes: ReachabilityLaneEntry[] = [];
for (const name of selected) {
  const sourceDir = join(root, 'packages', name, 'src');
  const publicEntry = project.getSourceFile(join(sourceDir, 'index.ts'));
  const contractEntry = project.getSourceFile(join(sourceDir, 'contract.ts'));
  if (publicEntry === undefined || contractEntry === undefined) continue;
  const sourceFiles = project.getSourceFiles().filter((sourceFile) => {
    const path = relative(sourceDir, sourceFile.getFilePath()).replaceAll('\\', '/');
    return !path.startsWith('../') && path !== 'index.ts' && path !== 'contract.ts' && !path.endsWith('.test.ts');
  });
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

if (updateMode) {
  const baseline: ReachabilityBaseline = { schemaVersion: 1, entries: lanes };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`${pc.green('OK')} ${pc.bold(`Updated reachability lane baseline (${lanes.length} symbols)`)}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as ReachabilityBaseline;
if (baseline.schemaVersion !== 1) throw new Error(`Unsupported reachability baseline schema ${baseline.schemaVersion}`);
const laneDrift = diffLanes(
  baseline.entries.filter((entry) => selected.includes(entry.packageName)),
  lanes,
);
const hardPassed = violations.length === 0;

if (jsonMode) {
  console.log(JSON.stringify({ passed: hardPassed, violations, laneDrift }, null, 2));
  process.exit(!hardPassed && checkMode ? 1 : 0);
}

if (hardPassed) {
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

process.exit(!hardPassed && checkMode ? 1 : 0);

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

function effectBackend(packageName: string): EffectBackend | null {
  if (packageName === 'effects-canvas') return 'canvas';
  if (packageName === 'effects-gl') return 'gl';
  if (packageName === 'effects-wgpu') return 'wgpu';
  return null;
}
