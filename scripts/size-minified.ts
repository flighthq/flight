import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import type { SizeResult } from './size-runner';
import { collectSizeCases, didSizeChecksPass, getFlightDiagnosticsSizeDelta, runSizeChecks } from './size-runner';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ParsedArgs {
  exampleFilters: string[];
  renderFilters: string[];
  report: string | null;
  outputPath: string | null;
  help: boolean;
}

const rawArgs = process.argv.slice(2);
const options = parseArgs(rawArgs);

if (options.help) {
  printUsage();
  process.exit(0);
}

// A full sweep is ~10 minutes of terser, and a script name cannot carry that.
// An interactive caller usually wants `npm run size` and has no way to learn the
// cost except by paying it once, so the tool says it. CI and the nightly job are
// not on a TTY and run unguarded.
if (process.stdout.isTTY && rawArgs.length === 0 && process.env.UPDATE_BASELINE !== '1') {
  console.log(pc.yellow('size:minified builds every case through terser — roughly 10 minutes for the full sweep.'));
  console.log(`Most size questions are answered in ~30s by ${pc.bold('npm run size')}, the fast path.`);
  console.log(pc.dim('Filter to a few cases (`npm run size:minified shapes`), or pass --yes for the full sweep.'));
  process.exit(0);
}

const root = resolve(__dirname, '..');
const examplesDir = resolve(root, 'examples', 'packages');
const baselineFile = resolve(root, 'tools', 'size', 'size.baseline.json');
const updateBaseline = process.env.UPDATE_BASELINE === '1';
const report = options.report ?? (options.outputPath ? 'json' : null);
const outputPath = options.outputPath;
const standardOutput = !outputPath && report !== 'json';
const sizeCases = standardOutput ? collectSizeCases(examplesDir, options.exampleFilters, options.renderFilters) : [];
const printProgress = standardOutput ? createProgressivePrinter(sizeCases) : null;

if (standardOutput && sizeCases.length === 0) {
  console.log(pc.yellow('No matching size tests were found.'));
}

const { results, pendingBaseline } = await runSizeChecks({
  root,
  examplesDir,
  baselineFile,
  updateBaseline,
  exampleFilters: options.exampleFilters,
  onResult: (result) => printProgress?.(result),
  renderFilters: options.renderFilters,
});
const passed = didSizeChecksPass(results);
const flightDiagnosticsDelta = getFlightDiagnosticsSizeDelta(results);

if (updateBaseline) {
  const { writeBaseline } = await import('./size-runner');
  writeBaseline(baselineFile, pendingBaseline);
}

if (outputPath) {
  const path = resolve(process.cwd(), outputPath);
  const json = JSON.stringify({ passed, cases: results, flightDiagnosticsDelta }, null, 2);
  await import('fs').then(({ writeFileSync }) => writeFileSync(path, json + '\n'));
  console.log(`SIZE_REPORT_PATH:${path}`);
  process.exit(passed ? 0 : 1);
}

if (report === 'json') {
  console.log(JSON.stringify({ passed, cases: results, flightDiagnosticsDelta }));
  process.exit(passed ? 0 : 1);
}

if (flightDiagnosticsDelta !== null) {
  console.log(`Flight diagnostics delta: +${(flightDiagnosticsDelta / 1024).toFixed(2)} KB gzip\n`);
}

process.exit(passed ? 0 : 1);

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    exampleFilters: [],
    renderFilters: [],
    report: null,
    outputPath: null,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    // Consumed by the cost guard above; not an example filter.
    if (arg === '--yes') continue;

    if (arg.startsWith('render=')) {
      parsed.renderFilters.push(arg.slice('render='.length));
      continue;
    }

    if (arg.startsWith('render:')) {
      parsed.renderFilters.push(arg.slice('render:'.length));
      continue;
    }

    if (arg.startsWith('report=')) {
      parsed.report = arg.slice('report='.length).toLowerCase();
      continue;
    }

    if (arg.startsWith('report:')) {
      parsed.report = arg.slice('report:'.length).toLowerCase();
      continue;
    }

    if (arg.startsWith('output=')) {
      parsed.outputPath = arg.slice('output='.length);
      continue;
    }

    if (arg.startsWith('output:')) {
      parsed.outputPath = arg.slice('output:'.length);
      continue;
    }

    if (arg.startsWith('out=')) {
      parsed.outputPath = arg.slice('out='.length);
      continue;
    }

    if (arg.startsWith('out:')) {
      parsed.outputPath = arg.slice('out:'.length);
      continue;
    }

    parsed.exampleFilters.push(arg);
  }

  return parsed;
}

function createProgressivePrinter(cases: ReturnType<typeof collectSizeCases>): (result: Readonly<SizeResult>) => void {
  const exampleNames = [...new Set(cases.map((tc) => tc.name))];
  const exampleBgColors = [pc.bgBlue, pc.bgMagenta, pc.bgCyan, pc.bgGreen];
  const maxNameLen = Math.max(0, ...exampleNames.map((n) => n.length));
  const maxRenderLen = Math.max(
    8,
    ...cases.map((sizeCase) => `${sizeCase.render}${sizeCase.variant === null ? '' : `:${sizeCase.variant}`}`.length),
  );
  const w = { name: maxNameLen + 5, render: maxRenderLen, size: 10, base: 34 };
  const expectedByExample = new Map<string, number>();
  const resultsByExample = new Map<string, Readonly<SizeResult>[]>();

  for (const { name } of cases) {
    expectedByExample.set(name, (expectedByExample.get(name) ?? 0) + 1);
  }

  return (result) => {
    const group = resultsByExample.get(result.name) ?? [];
    group.push(result);
    resultsByExample.set(result.name, group);

    if (group.length !== expectedByExample.get(result.name)) return;

    const bgColor = exampleBgColors[exampleNames.indexOf(result.name) % exampleBgColors.length];

    const lines = group.map((r, i) => {
      const nameCell =
        i === 0 ? bgColor(' ' + r.name + ' ') + ''.padEnd(w.name - r.name.length - 2) : ''.padEnd(w.name);
      const deltaNum = r.delta != null ? parseFloat(r.delta) : null;
      const color = deltaNum == null ? pc.dim : deltaNum > 2 ? pc.red : deltaNum > 0 ? pc.yellow : pc.green;
      const deltaStr =
        r.delta == null ? pc.dim('—') : color(r.delta[0]) + color(r.delta.slice(1, -1)) + pc.dim(color('%'));
      const baselineOrigin = r.baselineCommit
        ? ` @${r.baselineCommit.slice(0, 10)}${r.baselineCommitDate ? ` (${r.baselineCommitDate})` : ''}`
        : ' @unknown';
      const baselineStr = pc.dim(
        (r.baselineKBStr ? `~${r.baselineKBStr} KB${baselineOrigin}` : 'no baseline').padEnd(w.base),
      );
      const flag = r.passed ? '' : '  ' + pc.red('✗');

      const renderLabel = `${r.render}${r.variant === null ? '' : `:${r.variant}`}`;
      return `${nameCell}  ${pc.dim(renderLabel.padEnd(w.render))}  ${(r.gzipKB + ' KB').padEnd(w.size)}  ${baselineStr}  ${deltaStr}${flag}`;
    });

    console.log(lines.join('\n') + '\n');
  };
}

function printUsage(): void {
  console.log('Usage: npm run size:minified [filters...] [--yes] [report=json] [output=path]');
  console.log('');
  console.log('The shipping number: every case built and minified through terser. ~10 minutes for');
  console.log('the full sweep, which is why it is the nightly job. For a ~30s tree-shaking signal');
  console.log('while you work, use `npm run size`.');
  console.log('');
  console.log('  npm run size:minified shapes');
  console.log('  npm run size:minified -- --yes');
  console.log('  npm run size:minified shapes report=json');
  console.log('  npm run size:minified shapes output=size-report.json');
}
