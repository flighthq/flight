import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import pc from 'picocolors';

// Doc staleness advisory. Answers "which package cells need a review refresh" by comparing the
// export surface snapshot taken at review time against the current exports, and ranking by churn
// since the snapshot date.
//
// Run periodically by principal or a bookkeeper agent. Advisory — always exits 0.
//
// `npm run test:docs`            — report staleness across all cells
// `npm run test:docs:snapshot`   — write/update export snapshots for all cells

const root = resolve(import.meta.dirname, '..');
const cellsDir = resolve(root, 'agents/packages');
const isSnapshot = process.argv.includes('--snapshot');

interface ExportSnapshot {
  readonly exports: readonly string[];
  readonly updated: string;
}

interface ApiPackage {
  readonly contractOnlyFunctions?: readonly { readonly name: string }[];
  readonly functions: readonly { readonly name: string }[];
  readonly name: string;
}

function readCurrentExports(): Map<string, string[]> {
  let json: string;
  try {
    json = execFileSync('npx', ['tsx', 'scripts/api.ts', '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return new Map();
  }
  const data = JSON.parse(json) as { packages: ApiPackage[] };
  const result = new Map<string, string[]>();
  for (const pkg of data.packages) {
    const name = pkg.name.replace('@flighthq/', '');
    const exports = pkg.functions.map((f) => f.name).sort();
    result.set(name, exports);
  }
  return result;
}

function readLastCommitDates(): Map<string, string> {
  try {
    const out = execFileSync('git', ['log', '--no-renames', '--name-only', '--format=C%cs', '--', 'packages'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const dates = new Map<string, string>();
    let date: string | null = null;
    for (const line of out.split('\n')) {
      if (line.startsWith('C')) {
        date = line.slice(1).trim() || null;
        continue;
      }
      if (date === null || line === '') continue;
      const name = line.match(/^packages\/([^/]+)\//)?.[1];
      if (name !== undefined && !dates.has(name)) dates.set(name, date);
    }
    return dates;
  } catch {
    return new Map();
  }
}

function readOwnedCommitsSince(packageName: string, since: string): number {
  try {
    const out = execFileSync(
      'git',
      ['log', `--since=${since}`, '--no-renames', '--numstat', '--format=C%cs', '--', `packages/${packageName}`],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let count = 0;
    for (const line of out.split('\n')) {
      if (line.startsWith('C')) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

function listCells(): string[] {
  return readdirSync(cellsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(cellsDir, e.name, 'charter.md')))
    .map((e) => e.name)
    .sort();
}

function readSnapshot(cellName: string): ExportSnapshot | null {
  const path = join(cellsDir, cellName, 'exports-snapshot.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ExportSnapshot;
  } catch {
    return null;
  }
}

function writeSnapshot(cellName: string, exports: readonly string[]): void {
  const dir = join(cellsDir, cellName);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const snapshot: ExportSnapshot = {
    exports: [...exports],
    updated: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(join(dir, 'exports-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
}

function diffExports(snapshot: readonly string[], current: readonly string[]): { added: string[]; removed: string[] } {
  const oldSet = new Set(snapshot);
  const newSet = new Set(current);
  const added = current.filter((name) => !oldSet.has(name));
  const removed = snapshot.filter((name) => !newSet.has(name));
  return { added, removed };
}

interface CellReport {
  added: string[];
  cellName: string;
  daysSinceSnapshot: number;
  hasSnapshot: boolean;
  lastCodeDate: string | null;
  ownedCommits: number;
  removed: string[];
  snapshotDate: string | null;
}

function computeReport(
  cellName: string,
  currentExports: Map<string, string[]>,
  lastCodeDates: Map<string, string>,
): CellReport {
  const snapshot = readSnapshot(cellName);
  const current = currentExports.get(cellName) ?? [];
  const lastCodeDate = lastCodeDates.get(cellName) ?? null;

  if (!snapshot) {
    return {
      added: [],
      cellName,
      daysSinceSnapshot: 0,
      hasSnapshot: false,
      lastCodeDate,
      ownedCommits: 0,
      removed: [],
      snapshotDate: null,
    };
  }

  const { added, removed } = diffExports(snapshot.exports, current);
  const snapshotDate = snapshot.updated;
  const daysSinceSnapshot = Math.floor((Date.now() - new Date(snapshotDate).getTime()) / (1000 * 60 * 60 * 24));
  const ownedCommits = readOwnedCommitsSince(cellName, snapshotDate);

  return { added, cellName, daysSinceSnapshot, hasSnapshot: true, lastCodeDate, ownedCommits, removed, snapshotDate };
}

function score(report: CellReport): number {
  if (!report.hasSnapshot) return -1;
  return report.added.length * 10 + report.removed.length * 10 + report.ownedCommits;
}

process.stdout.write('Scanning exports across all packages...\n');
const currentExports = readCurrentExports();
if (currentExports.size === 0) {
  process.stdout.write(`${pc.red('✗')} could not read current exports (api --json failed)\n`);
  process.exit(1);
}
process.stdout.write(`${currentExports.size} packages with exports\n`);

const cells = listCells();
process.stdout.write(`${cells.length} package cells under agents/packages/\n`);

if (isSnapshot) {
  let written = 0;
  for (const cell of cells) {
    const exports = currentExports.get(cell);
    if (!exports || exports.length === 0) continue;
    writeSnapshot(cell, exports);
    written++;
  }
  process.stdout.write(`\n${pc.green('✓')} wrote export snapshots for ${written} cells\n`);
  process.exit(0);
}

const lastCodeDates = readLastCommitDates();
const reports: CellReport[] = [];

for (const cell of cells) {
  reports.push(computeReport(cell, currentExports, lastCodeDates));
}

const withSnapshots = reports.filter((r) => r.hasSnapshot);
const withoutSnapshots = reports.filter((r) => !r.hasSnapshot);
const stale = withSnapshots.filter((r) => r.added.length > 0 || r.removed.length > 0 || r.ownedCommits > 0);

stale.sort((a, b) => score(b) - score(a));

if (stale.length === 0 && withoutSnapshots.length === 0) {
  process.stdout.write(
    `\n${pc.green('✓')} all ${withSnapshots.length} cells current — no export changes or owned commits since snapshot\n`,
  );
  process.exit(0);
}

if (stale.length > 0) {
  process.stdout.write(`\n${pc.yellow(`${stale.length} cells with changes since snapshot:`)}\n\n`);
  for (const r of stale) {
    const parts: string[] = [];
    if (r.added.length > 0) parts.push(pc.green(`+${r.added.length} exports`));
    if (r.removed.length > 0) parts.push(pc.red(`-${r.removed.length} exports`));
    if (r.ownedCommits > 0) parts.push(`${r.ownedCommits} owned commits`);
    parts.push(`${r.daysSinceSnapshot}d since snapshot`);

    process.stdout.write(`  ${pc.bold(r.cellName.padEnd(28))} ${parts.join(', ')}\n`);

    if (r.added.length > 0 && r.added.length <= 10) {
      for (const name of r.added) process.stdout.write(`    ${pc.green('+')} ${name}\n`);
    }
    if (r.removed.length > 0 && r.removed.length <= 10) {
      for (const name of r.removed) process.stdout.write(`    ${pc.red('-')} ${name}\n`);
    }
  }
}

const currentCount = withSnapshots.length - stale.length;
if (currentCount > 0) {
  process.stdout.write(
    `\n${pc.dim(`${currentCount} cells current (no export changes or owned commits since snapshot)`)}\n`,
  );
}

if (withoutSnapshots.length > 0) {
  process.stdout.write(
    `\n${pc.dim(`${withoutSnapshots.length} cells without snapshots — run \`npm run test:docs:snapshot\` to baseline`)}\n`,
  );
}

process.stdout.write(
  `\n${stale.length > 0 ? pc.yellow('advisory') : pc.green('OK')}: ${stale.length} stale, ${currentCount} current, ${withoutSnapshots.length} unsnapshotted\n`,
);
