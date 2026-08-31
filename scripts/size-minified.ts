import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import type { SizeResult } from './size-runner';
import { collectSizeCases, didSizeChecksPass, getFlightDiagnosticsSizeDelta, runSizeChecks } from './size-runner';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ParsedArgs {
  caseFilters: string[];
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

const root = resolve(__dirname, '..');
const fixturesDir = resolve(root, 'tools', 'size', 'fixtures');
const baselineFile = resolve(root, 'tools', 'size', 'size.baseline.json');
const updateBaseline = process.env.UPDATE_BASELINE === '1';
const report = options.report ?? (options.outputPath ? 'json' : null);
const outputPath = options.outputPath;
const standardOutput = !outputPath && report !== 'json';
const sizeCases = standardOutput ? collectSizeCases(fixturesDir, options.caseFilters, options.renderFilters) : [];
const printProgress = standardOutput ? createProgressivePrinter(sizeCases) : null;

if (standardOutput && sizeCases.length === 0) {
  console.log(pc.yellow('No matching size tests were found.'));
}

const { results, pendingBaseline } = await runSizeChecks({
  root,
  fixturesDir,
  baselineFile,
  updateBaseline,
  caseFilters: options.caseFilters,
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
    caseFilters: [],
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

    parsed.caseFilters.push(arg);
  }

  return parsed;
}

function createProgressivePrinter(cases: ReturnType<typeof collectSizeCases>): (result: Readonly<SizeResult>) => void {
  const caseNames = [...new Set(cases.map((tc) => tc.name))];
  const caseBgColors = [pc.bgBlue, pc.bgMagenta, pc.bgCyan, pc.bgGreen];
  const maxNameLen = Math.max(0, ...caseNames.map((n) => n.length));
  const maxRenderLen = Math.max(
    8,
    ...cases.map((sizeCase) => `${sizeCase.render}${sizeCase.variant === null ? '' : `:${sizeCase.variant}`}`.length),
  );
  const w = { name: maxNameLen + 5, render: maxRenderLen, size: 10, base: 34 };
  const expectedByCase = new Map<string, number>();
  const resultsByCase = new Map<string, Readonly<SizeResult>[]>();

  for (const { name } of cases) {
    expectedByCase.set(name, (expectedByCase.get(name) ?? 0) + 1);
  }

  return (result) => {
    const group = resultsByCase.get(result.name) ?? [];
    group.push(result);
    resultsByCase.set(result.name, group);

    if (group.length !== expectedByCase.get(result.name)) return;

    const bgColor = caseBgColors[caseNames.indexOf(result.name) % caseBgColors.length];

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
  console.log('Usage: npm run size:minified [filters...] [report=json] [output=path]');
  console.log('');
  console.log('The shipping number: dedicated tools/size fixtures built and minified through terser.');
  console.log('For a faster tree-shaking read while you work, use `npm run size`.');
  console.log('');
  console.log('  npm run size:minified');
  console.log('  npm run size:minified scene2d-gl');
  console.log('  npm run size:minified scene2d-gl report=json');
  console.log('  npm run size:minified scene2d-gl output=size-report.json');
}
