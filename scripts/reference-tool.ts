import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
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
//   npm run get:reference     -- [--refresh]                                (warm the checkout: clone + install only)
//   npm run list:reference                                                  (print available case names)
//   npm run clean:reference                                                 (remove the cached checkout)
//   npm run dev:reference     -- [<case>] [--openfl|--starling|--awayjs] [--refresh]   (no case → browse gallery)
//   npm run test:reference    -- [playwright args] [--refresh]
//   npm run capture:reference -- [--filter <case>] [--fail-on-error|--update-baseline] [--refresh]

interface Mode {
  // The npm script to invoke inside the flight-reference checkout.
  script: string;
  usage: string;
}

const MODES: Readonly<Record<string, Mode>> = {
  capture: { script: 'capture', usage: '[--filter <case>] [--fail-on-error|--update-baseline]' },
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

// flight-reference's capture loads the `@flighthq/tool-capture` harness from its `.cache/flight-latest`
// slot. flight is THIS monorepo, so point that slot here — the harness then matches the SDK the samples
// render against (both this repo). Same spirit as FLIGHT_REPO, for the capture code path only.
function ensureToolCaptureLink(): void {
  const link = join(checkoutDir, '.cache', 'flight-latest');
  if (existsSync(link)) return;
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(repoRoot, link, 'junction');
  console.error(`[reference] linked ${link} -> ${repoRoot}`);
}

// The distinct case leaf names under content/frameworks/<framework>/<corpus>/<case> — the value you
// pass to `dev:reference`. Deduped across frameworks and sorted.
function listReferenceCases(): Readonly<string[]> {
  const frameworks = join(checkoutDir, 'content', 'frameworks');
  const cases = new Set<string>();
  if (!existsSync(frameworks)) return [];
  for (const framework of readdirSync(frameworks, { withFileTypes: true })) {
    if (!framework.isDirectory()) continue;
    const frameworkDir = join(frameworks, framework.name);
    for (const corpus of readdirSync(frameworkDir, { withFileTypes: true })) {
      if (!corpus.isDirectory()) continue;
      for (const entry of readdirSync(join(frameworkDir, corpus.name), { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== '_shared') cases.add(entry.name);
      }
    }
  }
  return [...cases].sort();
}

// Where Playwright keeps its browser binaries, so capture can flag a missing install up front rather
// than crash mid-launch with a bare shared-library error.
function playwrightBrowsersDir(): string {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (isWindows) return join(homedir(), 'AppData', 'Local', 'ms-playwright');
  return join(homedir(), '.cache', 'ms-playwright');
}

function checkCapturePrereqs(): boolean {
  const dir = playwrightBrowsersDir();
  if (existsSync(dir) && readdirSync(dir).some((entry) => entry.startsWith('chromium'))) return true;
  console.error('[reference] capture needs a Playwright browser + its system libraries. Install once with:');
  console.error('    npx playwright install chromium');
  console.error('    sudo npx playwright install-deps chromium   # system libraries (Linux)');
  return false;
}

const [modeName, ...rest] = process.argv.slice(2);
const refresh = rest.includes('--refresh');
const forwarded = rest.filter((arg) => arg !== '--refresh');

// `clean` removes the whole checkout — fresh start, disk reclaim, or recovery when `--refresh`
// refuses on a diverged/dirty clone. Needs no checkout of its own.
if (modeName === 'clean') {
  if (existsSync(checkoutDir)) {
    rmSync(checkoutDir, { recursive: true, force: true });
    console.error(`[reference] removed ${checkoutDir}`);
  } else {
    console.error('[reference] nothing to clean');
  }
  process.exit(0);
}

// `get` only warms the checkout (clone + install) so an agent can read or edit flight-reference
// files without starting a server; the other modes ensure the checkout, then run its npm script.
if (modeName === 'get') {
  if (!ensureCheckout(refresh)) process.exit(1);
  console.error(`[reference] ready at ${checkoutDir}`);
  process.exit(0);
}

// `list` prints the case names you can pass to `dev:reference`.
if (modeName === 'list') {
  if (!ensureCheckout(refresh)) process.exit(1);
  for (const name of listReferenceCases()) console.log(name);
  process.exit(0);
}

const mode = modeName ? MODES[modeName] : undefined;
if (!mode) {
  console.error(`Usage: tsx ./scripts/reference-tool.ts <get|list|clean|${Object.keys(MODES).join('|')}> [args]`);
  console.error('  get:   [--refresh]   clone + install only');
  console.error('  list:  print available case names');
  console.error('  clean: remove the cached checkout');
  for (const [name, { usage }] of Object.entries(MODES)) console.error(`  ${name}: ${usage}`);
  process.exit(1);
}

if (!ensureCheckout(refresh)) process.exit(1);

// Capture runs THIS monorepo's reference-capture runner (scripts/reference-capture.ts) — which starts
// flight-reference's dev server and drives the shared tool-capture path — rather than flight-reference's
// own capture script, so the hardened capture machinery lives here and improves for every subject at
// once. Needs the tool-capture harness link (for the Vite @ft/* aliases) and a Playwright browser.
if (modeName === 'capture') {
  ensureToolCaptureLink();
  if (!checkCapturePrereqs()) process.exit(1);
  const runner = join(repoRoot, 'scripts', 'reference-capture.ts');
  const exitCode = run('npx', ['tsx', runner, ...forwarded], repoRoot, { FLIGHT_REFERENCE_CHECKOUT: checkoutDir });
  process.exit(exitCode);
}

// `dev` with no case opens flight-reference's browse gallery instead of erroring on a missing case.
const hasCase = forwarded.some((arg) => !arg.startsWith('--'));
const script = modeName === 'dev' && !hasCase ? 'dev:all' : mode.script;

// Point flight-reference at this monorepo so its Vite aliases resolve `@flighthq/*` to local source.
const exitCode = run('npm', ['run', script, '--', ...forwarded], checkoutDir, { FLIGHT_REPO: repoRoot });
process.exit(exitCode);
