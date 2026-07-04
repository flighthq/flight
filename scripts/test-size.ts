import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ParsedArgs {
  exampleFilters: string[];
  renderFilters: string[];
  report: string | null;
  outputPath: string | null;
  forwardedArgs: string[];
  help: boolean;
}

const rawArgs = process.argv.slice(2);
const options = parseArgs(rawArgs);

if (options.help) {
  printUsage();
  process.exit(0);
}

const env = { ...process.env };
if (options.exampleFilters.length > 0) {
  env.SIZE_EXAMPLE_FILTER = options.exampleFilters.join(',');
}
if (options.renderFilters.length > 0) {
  env.SIZE_RENDER_FILTER = options.renderFilters.join(',');
}
if (options.report) {
  env.SIZE_REPORT = options.report;
}
if (options.outputPath) {
  env.SIZE_OUTPUT_PATH = options.outputPath;
  if (!options.report) {
    env.SIZE_REPORT = 'json';
  }
}

const vitestBin = resolve(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vitest.cmd' : 'vitest',
);
// The size test runs via its own config (it is no longer a project of the master vitest.config.ts).
const sizeConfig = resolve(__dirname, '..', 'tests', 'size', 'vitest.config.ts');
const command = [vitestBin, 'run', '--config', sizeConfig, ...options.forwardedArgs]
  .map((arg) => JSON.stringify(arg))
  .join(' ');
const result = spawnSync(command, {
  stdio: 'inherit',
  env,
  shell: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    exampleFilters: [],
    renderFilters: [],
    report: null,
    outputPath: null,
    forwardedArgs: [],
    help: false,
  };

  let sawEndOfOptions = false;
  for (const arg of args) {
    if (sawEndOfOptions) {
      parsed.forwardedArgs.push(arg);
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--') {
      sawEndOfOptions = true;
      continue;
    }

    if (arg.startsWith('package=')) {
      parsed.exampleFilters.push(arg.slice('package='.length));
      continue;
    }

    if (arg.startsWith('pkg=')) {
      parsed.exampleFilters.push(arg.slice('pkg='.length));
      continue;
    }

    if (arg.startsWith('example=')) {
      parsed.exampleFilters.push(arg.slice('example='.length));
      continue;
    }

    if (arg.startsWith('render=')) {
      parsed.renderFilters.push(arg.slice('render='.length));
      continue;
    }

    if (arg.startsWith('package:')) {
      parsed.exampleFilters.push(arg.slice('package:'.length));
      continue;
    }

    if (arg.startsWith('pkg:')) {
      parsed.exampleFilters.push(arg.slice('pkg:'.length));
      continue;
    }

    if (arg.startsWith('example:')) {
      parsed.exampleFilters.push(arg.slice('example:'.length));
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

function printUsage(): void {
  console.log(`Usage: npm run test:size [filters...] [-- vitest-args...]`);
  console.log('');
  console.log('Filter examples:');
  console.log('  npm run test:size piratepig');
  console.log('  npm run size piratepig');
  console.log('  npm run test:size example=addinganimation');
  console.log('  npm run test:size package=addinganimation');
  console.log('  npm run test:size render=webgl');
  console.log('  npm run test:size package=addinganimation render=canvas');
  console.log('');
  console.log('Output examples:');
  console.log('  npm run test:size report=json piratepig');
  console.log('  npm run size report=json piratepig');
  console.log('  npm run test:size output=size-report.json piratepig');
  console.log('  npm run size output=size-report.json piratepig');
  console.log('');
  console.log('You can also pass direct vitest args after --:');
  console.log('  npm run test:size example=addinganimation -- -t "addinganimation"');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h    show this help message');
}
