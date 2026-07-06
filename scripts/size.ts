import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import type { SizeResult } from './size-runner';
import { collectSizeCases, runSizeChecks } from './size-runner';

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

if (updateBaseline) {
  const { writeBaseline } = await import('./size-runner');
  writeBaseline(baselineFile, pendingBaseline);
}

if (outputPath) {
  const path = resolve(process.cwd(), outputPath);
  const json = JSON.stringify({ passed: results.every((r) => r.passed), cases: results }, null, 2);
  await import('fs').then(({ writeFileSync }) => writeFileSync(path, json + '\n'));
  console.log(`SIZE_REPORT_PATH:${path}`);
  process.exit(results.every((r) => r.passed) ? 0 : 1);
}

if (report === 'json') {
  console.log(JSON.stringify({ passed: results.every((r) => r.passed), cases: results }));
  process.exit(results.every((r) => r.passed) ? 0 : 1);
}

process.exit(results.every((r) => r.passed) ? 0 : 1);

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
  const w = { name: maxNameLen + 5, render: 8, size: 10, base: 10 };
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
      const baselineStr = pc.dim((r.baselineKBStr ? '~' + r.baselineKBStr + ' KB' : '—').padEnd(w.base));
      const flag = r.passed ? '' : '  ' + pc.red('✗');

      return `${nameCell}  ${pc.dim(r.render.padEnd(w.render))}  ${(r.gzipKB + ' KB').padEnd(w.size)}  ${baselineStr}  ${deltaStr}${flag}`;
    });

    console.log(lines.join('\n') + '\n');
  };
}

function printUsage(): void {
  console.log('Usage: npm run size [filters...] [report=json] [output=path]');
  console.log('Examples:');
  console.log('  npm run size piratepig');
  console.log('  npm run size report=json piratepig');
  console.log('  npm run size output=size-report.json piratepig');
}
