import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs the spun-out `flight-reference` repo's own dev/test scripts against THIS monorepo's live
// source. flight-reference's Vite config resolves `@flighthq/*` to a workspace it locates through the
// `FLIGHT_REPO` env var (it verifies that dir's package.json `name === 'flight'`), so pointing that at
// this checkout makes its OpenFL/Starling/AwayJS reference cases render with the local packages —
// no publish, no linking. The reference checkout is cloned once into the gitignored `.cache/` and
// reused; pass `--refresh` to pull the latest and reinstall.
//
// Usage:
//   npm run dev:reference -- <case> [--openfl|--starling|--awayjs] [--refresh]
//   npm run test:reference -- [playwright args] [--refresh]

interface Mode {
  // The npm script to invoke inside the flight-reference checkout.
  script: string;
  usage: string;
}

const MODES: Readonly<Record<string, Mode>> = {
  dev: { script: 'dev', usage: '<case> [--openfl|--starling|--awayjs]' },
  test: { script: 'test:e2e', usage: '[playwright args]' },
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const referenceRepoUrl = process.env.FLIGHT_REFERENCE_REPO ?? 'https://github.com/flighthq/flight-reference';
const checkoutDir = process.env.FLIGHT_REFERENCE_DIR ?? join(repoRoot, '.cache', 'flight-reference');
const isWindows = process.platform === 'win32';

function run(
  command: string,
  args: Readonly<string[]>,
  cwd: string,
  extraEnv?: Readonly<Record<string, string>>,
): number {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: isWindows,
    env: { ...process.env, ...extraEnv },
  });
  if (result.error) {
    console.error(`[reference] failed to run ${command}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 0;
}

function ensureCheckout(refresh: boolean): boolean {
  if (!existsSync(join(checkoutDir, '.git'))) {
    console.error(`[reference] cloning ${referenceRepoUrl} -> ${checkoutDir}`);
    if (run('git', ['clone', referenceRepoUrl, checkoutDir], repoRoot) !== 0) return false;
  } else if (refresh) {
    console.error('[reference] pulling latest flight-reference');
    if (run('git', ['pull', '--ff-only'], checkoutDir) !== 0) return false;
  }

  // Install on first checkout, or after a refresh may have moved the lockfile.
  if (refresh || !existsSync(join(checkoutDir, 'node_modules'))) {
    console.error('[reference] installing flight-reference dependencies');
    if (run('npm', ['install'], checkoutDir) !== 0) return false;
  }

  return true;
}

const [modeName, ...rest] = process.argv.slice(2);
const mode = modeName ? MODES[modeName] : undefined;
if (!mode) {
  console.error(`Usage: tsx ./scripts/reference-tool.ts <${Object.keys(MODES).join('|')}> [args]`);
  for (const [name, { usage }] of Object.entries(MODES)) console.error(`  ${name}: ${usage}`);
  process.exit(1);
}

const refresh = rest.includes('--refresh');
const forwarded = rest.filter((arg) => arg !== '--refresh');

if (!ensureCheckout(refresh)) process.exit(1);

// Point flight-reference at this monorepo so its Vite aliases resolve `@flighthq/*` to local source.
const exitCode = run('npm', ['run', mode.script, '--', ...forwarded], checkoutDir, { FLIGHT_REPO: repoRoot });
process.exit(exitCode);
