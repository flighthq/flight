// Runs the full reference-image check pipeline locally, reproducing the CI
// `Reference Images · Check` job from tests.yml. The steps:
//   0. Print environment identity and first-run disclosure
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
import { readFileSync } from 'node:fs';
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

// ★ A FAILING STEP IS A VERDICT, NOT A CRASH. `execSync` throws on a non-zero exit, and an uncaught throw
// prints a Node stack trace under the step's own output — which reads as the tool breaking rather than as
// the check reporting. That matters here because this gate's whole job is to be run repeatedly while
// working through a queue of cells: a stack trace after a clean list of failures invites the reader to
// wonder whether the run finished, and the answer is that it did.
function runFinal(cmd: string, label: string): never {
  console.log(`\n── ${label} ──`);
  try {
    execSync(cmd, { cwd: repoRoot, stdio: 'inherit' });
  } catch (error) {
    const status =
      typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 1;
    console.error(`\n${label} reported failures — see the list above. Exiting ${status}.`);
    process.exit(status);
  }
  process.exit(0);
}

function runCapture(captureArgs: string): void {
  const argv = captureArgs.split(/\s+/).filter(Boolean);
  if (devMode) argv.push('--dev');
  execFileSync('npx', ['tsx', './packages/tool-capture/src/bin.ts', 'capture', ...argv], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

// 0. Environment identity and disclosure
const identity = JSON.parse(readFileSync(join(__dirname, 'reference-image-capture-identity.json'), 'utf8')) as {
  comparisonPolicyId: string;
  environmentId: string;
};
const playwrightVersion = execFileSync('npx', ['playwright', '--version'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();

console.log('reference-image:gate — local reproduction of the CI Reference Images · Check job');
console.log('');
console.log('This script reproduces the CI pipeline; it has not itself been independently verified.');
console.log('The first person to run it and compare its output against the matching CI job is');
console.log('confirming the reproduction. Compare the compared/pending/failures counts printed at');
console.log("the end against the same commit's CI job output to verify agreement.");
console.log('');
console.log(`policy:     ${identity.comparisonPolicyId}`);
console.log(`environment: ${identity.environmentId}`);
console.log(`playwright:  ${playwrightVersion}`);
console.log('');
console.log('The comparison policy is pixel-exact against a pinned SwiftShader adapter and Playwright');
console.log('version. A local result only predicts CI if this environment matches the registered one.');

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

// 5. Check — reference-image:check prints the compared/pending/failures summary line,
// matching the CI output shape. Compare those counts against the same commit's CI job
// to verify this local reproduction agrees.
runFinal(`npm run reference-image:check -- --frames ${frames}`, 'Compare against the blessed references');
