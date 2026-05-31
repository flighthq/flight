import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import type { SizeResult } from './size-runner';
import { runSizeChecks } from './size-runner';

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
const examplesDir = resolve(root, 'examples');
const baselineFile = resolve(root, 'tests', 'size', 'size.baseline.json');
const updateBaseline = process.env.UPDATE_BASELINE === '1';

const { results, pendingBaseline } = await runSizeChecks({
  root,
  examplesDir,
  baselineFile,
  updateBaseline,
  exampleFilters: options.exampleFilters,
  renderFilters: options.renderFilters,
});

if (updateBaseline) {
  const { writeBaseline } = await import('./size-runner');
  writeBaseline(baselineFile, pendingBaseline);
}

const report = options.report ?? (options.outputPath ? 'json' : null);
const outputPath = options.outputPath;

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

printResults(results);
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

function printResults(results: SizeResult[]): void {
  if (results.length === 0) {
    console.log(pc.yellow('No matching size tests were found.'));
    return;
  }

  const exampleNames = [...new Set(results.map((r) => r.name))];
  const exampleBgColors = [pc.bgBlue, pc.bgMagenta, pc.bgCyan, pc.bgGreen];
  const maxNameLen = Math.max(...exampleNames.map((n) => n.length));
  const w = { name: maxNameLen + 5, render: 8, size: 10, base: 10 };

  for (const example of exampleNames) {
    const group = results.filter((r) => r.name === example);
    const bgColor = exampleBgColors[exampleNames.indexOf(example) % exampleBgColors.length];

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
  }
}

function printUsage(): void {
  console.log('Usage: npm run size [filters...] [report=json] [output=path]');
  console.log('Examples:');
  console.log('  npm run size piratepig');
  console.log('  npm run size report=json piratepig');
  console.log('  npm run size output=size-report.json piratepig');
}
