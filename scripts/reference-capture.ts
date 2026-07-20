// Thin CLI over tool-capture's runReferenceCapture: captures the flight-reference cases through THIS
// monorepo's capture machinery (present-frame sync, the __ftRenderImage surface readback that avoids
// Docker's black WebGL screenshots, baseline compare) rather than flight-reference's own capture script,
// so the hardened path lives here and improves for every subject at once. The driver — dev-server start,
// case enumeration, the capture session — lives in @flighthq/tool-capture (referenceCapture.ts) so both
// ends of the reference capture are contained in one package; this file only parses args and sets exit codes.
//
// The reference apps opt into the surface readback by registering a functional target from their shared 3D
// context (see the scene3d writeup); until a case registers one, its verification wait times out and it
// falls back to the canvas screenshot (fine for 2D, black for 3D in Docker) — the readback lights up per case.
//
// Invoked by reference-tool.ts's `capture` mode with FLIGHT_REFERENCE_CHECKOUT set to the checkout dir.
// Usage (forwarded): [--filter <substr>] [--frames N] [--wait ms] [--update-baseline] [--fail-on-error] [--observe]
// --observe is eyes mode: never fail closed on a blank render — always write a screenshot + a diagnostics
// block (blank/coverage/verify-target/pageErrorCount) so an agent can SEE a scene instead of hitting "cannot capture".

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isBrowserClosedError, runReferenceCapture } from '@flighthq/tool-capture';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkoutDir = process.env.FLIGHT_REFERENCE_CHECKOUT ?? join(repoRoot, '.cache', 'flight-reference');

const argv = process.argv.slice(2);
function arg(key: string, fallback: string): string {
  const i = argv.indexOf(`--${key}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : fallback;
}

async function main(): Promise<void> {
  const result = await runReferenceCapture({
    checkoutDir,
    repoRoot,
    filter: arg('filter', '') || undefined,
    captureFrames: Math.max(0, parseInt(arg('frames', '1'), 10) || 0),
    extraWait: Math.max(0, parseInt(arg('wait', '0'), 10) || 0),
    updateBaseline: argv.includes('--update-baseline'),
    failOnError: argv.includes('--fail-on-error'),
    observe: argv.includes('--observe'),
    outBase: resolve(repoRoot, '.artifacts'),
  });

  if (result.failed > 0) process.exit(1);
  if (result.aborted) process.exit(130);
  // Exit explicitly: the spawned Vite dev server child and Playwright's handles keep the event loop
  // alive after runReferenceCapture's teardown, so a natural return would hang here forever (a caller
  // — a shell loop or an agent waiting on process exit — never gets control back). All artifacts are
  // written synchronously before this point, so a hard exit loses nothing.
  process.exit(0);
}

main().catch((err: unknown) => {
  if (isBrowserClosedError(err)) process.exit(130);
  console.error(err);
  process.exit(1);
});
