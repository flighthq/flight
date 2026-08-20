// Builds, fetches, re-captures and then serves the functional review tool.
//
// ★ A FAILED CAPTURE MUST NOT KEEP YOU OUT OF THE TOOL YOU OPEN TO LOOK AT IT. This was an `&&` chain in
// package.json, and `capture` exits 1 whenever any scene assertion fails — so a single failing scene
// stopped the review server from starting at all. The one thing a reviewer wants when a render assertion
// fails is to see the picture, and the workflow answered by refusing to show them any picture.
//
// The steps are not all the same kind, which is why a flat `&&` was the wrong shape:
//   PRECONDITIONS  build, fetch, clean — if these fail there is nothing to serve, so stop.
//   EVIDENCE       capture — its failures are the subject of the review, not a reason to abandon it.
// So a capture failure is reported loudly and the server still comes up.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function runPrecondition(label: string, command: string, args: readonly string[]): void {
  console.log(`\n── ${label} ──`);
  try {
    execFileSync(command, [...args], { cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32' });
  } catch {
    // No stack trace: this is a verdict about the step, and the reader is about to be told what to do.
    console.error(`\n${label} failed — the review server needs it, so stopping here.`);
    process.exit(1);
  }
}

runPrecondition('Build functional harness', 'npm', ['run', 'build:functional']);
runPrecondition('Fetch and verify the pinned reference packs', 'npm', ['run', 'reference-image:fetch']);
runPrecondition('Clear previous functional artifacts', 'npm', ['run', 'clean:artifacts:functional']);

console.log('\n── Capture every functional cell ──');
let captureFailed = false;
try {
  execFileSync('npm', ['run', 'capture:functional'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
} catch {
  captureFailed = true;
}

if (captureFailed) {
  console.error('\n★ Some captures failed their scene assertions. Starting the review server anyway —');
  console.error('  a failed capture is the thing you came here to look at. Failing cells appear in the');
  console.error('  sidebar with their error, and their scene assertion message is on the cell itself.');
}

console.log('\n── Serve the review tool ──');
execFileSync('npm', ['run', 'dev', '--workspace=tools/review'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_REVIEW_TOOL: 'functional' },
});
