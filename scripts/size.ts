import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import type { FastSizeDelta } from './size-fast-runner';
import {
  compareFastSizes,
  getChangedFastSizes,
  hashFastSizeTree,
  measureFastSizes,
  readFastSizeBaseline,
  readFastSizeCache,
  selectFastSizeUnit,
  writeFastSizeBaseline,
  writeFastSizeCache,
} from './size-fast-runner';
import { collectSizeCases, getSizeCaseKey, parseFilter } from './size-runner';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const cacheDir = resolve(root, '.cache', 'size-fast');
const baselineFile = resolve(root, 'tools', 'size', 'size.unminified.baseline.json');

// Files that record a measurement rather than feed one. They are excluded from
// the tree id because including them makes every `size:baseline` invalidate the
// cache entry it just wrote — an output cannot be one of its own inputs. Declared
// here rather than at the file's tail because getCurrentTreeId runs at module
// scope, where a `const` below it is still in the temporal dead zone.
const MEASUREMENT_OUTPUTS = ['tools/size/size.unminified.baseline.json', 'tools/size/size.baseline.json'];

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

const asJson = args.includes('report=json') || args.includes('--json');
const updateBaseline = process.env.UPDATE_BASELINE === '1';
const refArg = args.find((arg) => arg.startsWith('--ref='))?.slice('--ref='.length) ?? null;
const filters = args.filter((arg) => !arg.startsWith('-') && !arg.includes('='));
const renderFilters = args
  .filter((arg) => arg.startsWith('render='))
  .flatMap((arg) => parseFilter(arg.slice('render='.length)));

const examplesDir = resolve(root, 'examples', 'packages');

// Always measure and cache every case. Filters select what to *report*, never what
// to measure: a partial map written under a whole-tree id would silently answer
// later unfiltered runs with missing cases, and a partial baseline write would
// drop every key the filter excluded.
const allCases = collectSizeCases(examplesDir, [], []);
const selectedKeys = new Set(collectSizeCases(examplesDir, filters, renderFilters).map(getSizeCaseKey));
if (selectedKeys.size === 0) {
  console.log(pc.yellow('No matching size cases were found.'));
  process.exit(0);
}

const treeId = getCurrentTreeId();
const measured = readFastSizeCache(cacheDir, treeId) ?? (await measureFastSizes(allCases));
writeFastSizeCache(cacheDir, { sizes: measured, treeId });

const sizes = selectFastSizeUnit(measured, 'gzip');

if (updateBaseline) {
  writeFastSizeBaseline(baselineFile, sizes);
  console.log(pc.green(`Wrote ${Object.keys(sizes).length} unminified sizes to size.unminified.baseline.json.`));
  process.exit(0);
}

const reference = refArg !== null ? readReferenceTree(refArg) : readFastSizeBaseline(baselineFile);
const referenceLabel = refArg ?? 'baseline';

const deltas = compareFastSizes(reference, sizes).filter((delta) => selectedKeys.has(delta.key));
const changed = getChangedFastSizes(deltas);

if (asJson) {
  console.log(JSON.stringify({ treeId, reference: referenceLabel, changed, sizes: measured }));
  process.exit(0);
}

printReport(changed, referenceLabel);

// Advisory by construction. A red gate here would push an agent to rewrite the
// baseline to clear it, which launders the regression the report exists to show —
// so this reports and always exits 0. `size:minified` owns the gate.
process.exit(0);

function printReport(changed: readonly Readonly<FastSizeDelta>[], referenceLabel: string): void {
  if (Object.keys(reference).length === 0) {
    console.log(pc.yellow('No unminified baseline yet.'));
    console.log(pc.dim('Run `npm run size:baseline` to record one from this tree.'));
    return;
  }

  console.log(`${pc.dim('vs')} ${referenceLabel}  ${pc.dim('· tree')} ${treeId}\n`);

  if (changed.length === 0) {
    console.log(pc.green(`No case moved beyond the noise band. ${selectedKeys.size} cases compared.`));
    printFooter();
    return;
  }

  const width = Math.max(...changed.map((delta) => delta.key.length));
  for (const delta of [...changed].sort((a, b) => Math.abs(b.deltaBytes) - Math.abs(a.deltaBytes))) {
    const percent = delta.deltaPercent;
    const color = percent === null ? pc.cyan : percent > 2 ? pc.red : percent > 0 ? pc.yellow : pc.green;
    const sign = delta.deltaBytes >= 0 ? '+' : '';
    const percentText =
      percent === null ? pc.dim(delta.before === null ? '(new)' : '(gone)') : color(`${sign}${percent.toFixed(2)}%`);
    console.log(`${delta.key.padEnd(width)}  ${color(`${sign}${delta.deltaBytes} B`).padStart(12)}  ${percentText}`);
  }

  console.log(`\n${changed.length} of ${selectedKeys.size} cases moved.`);
  printFooter();
}

function printFooter(): void {
  console.log(
    pc.dim(
      '\nUNMINIFIED tree-shaken gzip bytes — a tree-shaking signal, not a shipping size.\nDo not quote them as bundle cost; `npm run size:minified` owns that claim.',
    ),
  );
}

/**
 * Identifies the tree being measured, so an unchanged tree answers from cache.
 * A dirty tree hashes its own diff rather than reusing HEAD's id, because those
 * edits are exactly what the caller wants measured.
 */
function getCurrentTreeId(): string {
  const head = git(['rev-parse', 'HEAD']);
  const status = git(['status', '--porcelain']);
  if (head === null) return hashFastSizeTree(['no-git', String(process.pid)]);
  if (status === null || status.length === 0) return head.slice(0, 16);

  const diff = git(['diff', 'HEAD', '--', '.', ...MEASUREMENT_OUTPUTS.map((path) => `:(exclude)${path}`)]) ?? '';
  const untracked = (git(['ls-files', '--others', '--exclude-standard']) ?? '')
    .split('\n')
    .filter(Boolean)
    .filter((path) => !MEASUREMENT_OUTPUTS.includes(path))
    .map((path) => {
      const full = resolve(root, path);
      return existsSync(full) ? `${path}:${readFileSync(full, 'utf-8')}` : path;
    });
  return `dirty-${hashFastSizeTree([head, diff, ...untracked])}`;
}

/**
 * Reads a previously measured tree from the cache. This is the parent-versus-commit
 * mode: comparing against the commit you branched from attributes the delta to your
 * own change, where comparing against a pin of unknown age attributes everyone's
 * accumulated drift to you.
 */
function readReferenceTree(ref: string): Record<string, number> {
  const resolved = git(['rev-parse', ref]);
  const id = resolved === null ? ref : resolved.slice(0, 16);
  const cached = readFastSizeCache(cacheDir, id);
  if (cached !== null) return selectFastSizeUnit(cached, 'gzip');

  console.error(pc.red(`No cached measurement for ${ref} (${id}).`));
  console.error(pc.dim('Check that tree out and run `npm run size` there first, or omit --ref to use the baseline.'));
  process.exit(1);
}

function git(gitArgs: readonly string[]): string | null {
  const result = spawnSync('git', [...gitArgs], { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

function printUsage(): void {
  console.log('Usage: npm run size [filters...] [render=<name>] [--ref=<commit>] [report=json]');
  console.log('');
  console.log('Measures tree-shaken UNMINIFIED gzip size for every example and reports what moved');
  console.log('against the committed baseline. Advisory, never gates. For the shipping number see');
  console.log('`npm run size:minified -- --fixtures` — the dedicated corpus gated nightly.');
  console.log('');
  console.log('  npm run size                    compare this tree against the committed baseline');
  console.log('  npm run size shapes             only cases matching a filter');
  console.log('  npm run size -- --ref=HEAD~1    compare against a commit you measured earlier');
  console.log('  npm run size:baseline           rewrite the baseline from this tree');
}
