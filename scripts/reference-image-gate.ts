// Runs the full reference-image check pipeline locally, reproducing the CI
// `Reference Images · Check` job from tests.yml. The steps:
//   1. Fetch and verify the pinned reference packs
//   2. Build the harness (build + build:functional)
//   3. Resolve the capture scope from the fetched packs
//   4. Capture every scoped cell through tool-capture
//   5. Compare against the blessed references
//
// Usage:
//   npx tsx ./scripts/reference-image-gate.ts [--frames <n>] [--skip-build] [--dev]
//
// --frames defaults to 1 (matching CI). --skip-build skips the build steps when
// iterating on captures against an already-built tree. --dev uses the Vite dev
// server instead of the static build for captures (implies --skip-build for the
// functional build, but still builds packages).
import { execFileSync, execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const args = process.argv.slice(2);
const framesIdx = args.indexOf('--frames');
const frames = framesIdx !== -1 ? args[framesIdx + 1]! : '1';
const skipBuild = args.includes('--skip-build');
const devMode = args.includes('--dev');

function run(cmd: string, label: string): void {
  console.log(`\n── ${label} ──`);
  execSync(cmd, { cwd: repoRoot, stdio: 'inherit' });
}

function runCapture(captureArgs: string): void {
  const argv = captureArgs.split(/\s+/).filter(Boolean);
  if (devMode) argv.push('--dev');
  execFileSync('npx', ['tsx', './packages/tool-capture/src/bin.ts', 'capture', ...argv], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

// 1. Fetch
run('npm run reference-image:fetch', 'Fetch and verify the pinned reference packs');

// 2. Build
if (!skipBuild) {
  run('npm run build', 'Build packages');
  if (!devMode) {
    run('npm run build:functional', 'Build functional harness');
  }
}

// 3. Scope
console.log('\n── Resolve capture scope ──');
const scopeOutput = execFileSync('npx', ['tsx', './scripts/reference-image-check.ts', 'scope', '--frames', frames], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();

if (scopeOutput.length === 0) {
  console.log('No cells in scope — nothing to capture.');
  process.exit(0);
}

const scopeLines = scopeOutput.split('\n').filter(Boolean);
console.log(`${scopeLines.length} capture target(s):`);
for (const line of scopeLines) console.log(`  ${line}`);

// 4. Capture
console.log('\n── Capture the pinned cells ──');
for (const line of scopeLines) {
  runCapture(line);
}

// 5. Check
run(`npm run reference-image:check -- --frames ${frames}`, 'Compare against the blessed references');
