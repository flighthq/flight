// One-shot screenshot and log capture for the examples or functional tool.
//
// Usage:
//   tsx ./scripts/capture.ts [options]
//
// Options:
//   --tool=examples|functional   Which server to use (default: examples)
//   --url=http://localhost:5173   Use a server that is already running (skips auto-start)
//   --dev                        Use the Vite dev server instead of the pre-built dist. Slower;
//                                suited for live-editing a single test (npm run dev:functional).
//                                The default is static + parallel: a lightweight Node.js server
//                                over the pre-built dist, with N concurrent Playwright pages.
//   --build                      Force a fresh build before serving, even if dist already exists.
//                                The static server auto-builds when dist is absent; --build makes
//                                the build unconditional (useful for authoritative baseline runs).
//   --sequential                 Disable parallel capture and process one (entry × renderer) at a
//                                time. Output is grouped by entry with a [N/M] header per entry.
//   --parallel=N                 Override the parallel worker count (default N=6).
//   --filter=name                Only run entries whose name contains this string
//   --renderer=webgl,canvas      Comma-separated renderer filter (default: all)
//   --out=tools/output           Output base directory (default: tools/output)
//   --wait=500                   Extra ms to wait after RAF before screenshot (default: 0)
//   --frames=N                   Run each page exactly N animation frames, halt on frame N, then
//                                shoot it — a deterministic "capture the Nth frame" mode (default:
//                                off; render two frames and shoot). N=1 is the robust common case.
//                                The plural name leaves room for a future --frames=1,30,100 that
//                                captures several frames per entry; today it takes a single number.
//   --update-baseline            Write current screenshot hashes as new baselines (tools/baselines/)
//   --fail-on-changed            Exit 1 if any screenshot hash differs from its baseline (for CI)
//   --fail-on-error              Exit 1 if any entry's page logged an error / page error — including a
//                                render-verification failure from the functional harness (not-blank /
//                                oracle). The render smoke gate. Pair with --frames=1 for a stable frame.
//   --no-verify                  Disable in-page render verification while still capturing and failing
//                                page errors. Used for compile/load smoke checks such as Rust/Wasm.
//
// Output per entry:
//   {out}/{tool}/{name}/{renderer}/screenshot.png
//   {out}/{tool}/{name}/{renderer}/logs.jsonl
//   {out}/{tool}/{name}/{renderer}/status.json
//
// Requires Playwright browsers: npx playwright install chromium

import {
  captureEntry,
  captureParallel,
  discoverEntries,
  formatSummaryCount,
  formatSummaryLine,
  installAbortHandler,
  isBrowserClosedError,
  launchBrowser,
  rendererMatchesFilter,
  resolveServer,
  resolveStaticServer,
} from '@flighthq/tool-capture';
import { resolve } from 'path';
import pc from 'picocolors';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function arg(key: string, fallback: string): string {
  const hit = argv.find((a) => a.startsWith(`--${key}=`));
  return hit ? hit.slice(key.length + 3) : fallback;
}

const tool = arg('tool', 'examples') as 'examples' | 'functional';
const externalUrl = arg('url', '');
const filter = arg('filter', '');
const rendererFilter = arg('renderer', '').split(',').filter(Boolean);
const outBase = resolve(process.cwd(), arg('out', '.artifacts'));
const extraWait = parseInt(arg('wait', '0'), 10);
// A single frame number today; the comma parse and plural flag leave room for a future
// `--frames=1,30,100` that captures several frames per entry. For now the first value is used.
const captureFrames =
  arg('frames', '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n >= 1)[0] ?? 0;
const updateBaseline = argv.includes('--update-baseline');
const failOnChanged = argv.includes('--fail-on-changed');
const failOnError = argv.includes('--fail-on-error');
// --observe is eyes mode: never fail closed on a blank render — always write a screenshot + a
// diagnostics block (blank/coverage/pageErrorCount) so an agent can SEE a scene instead of hitting
// "cannot capture". Does not gate or touch baselines.
const observe = argv.includes('--observe');
const verify = !argv.includes('--no-verify');
// --dev opts into the Vite dev server; static is the default.
const useDev = argv.includes('--dev');
// --build forces a rebuild even when dist already exists.
const forceBuild = argv.includes('--build');
// --sequential opts out of parallel; parallel is the default.
const useParallel = !argv.includes('--sequential');
// --parallel=N overrides the worker count; --parallel alone is accepted for backwards compatibility.
const parallelArg = argv.find((a) => a === '--parallel' || a.startsWith('--parallel='));
const workerCount = parallelArg?.includes('=') ? Math.max(1, parseInt(parallelArg.split('=')[1], 10) || 6) : 6;

const root = process.cwd();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  let entries = discoverEntries(tool, root);
  if (filter) entries = entries.filter((e) => e.name.includes(filter));

  if (entries.length === 0) {
    console.error(`No entries found  tool=${tool}  filter="${filter}"`);
    process.exit(1);
  }

  if (externalUrl) {
    console.log(`Using server at ${externalUrl}\n`);
  } else if (useDev) {
    console.log(`Starting ${tool} dev server…`);
  } else if (forceBuild) {
    console.log(`Building and serving ${tool} dist…`);
  } else {
    console.log(`Serving ${tool} dist (use --build to rebuild, --dev for the Vite server)…`);
  }

  const server = externalUrl
    ? await resolveServer({ tool, root, externalUrl })
    : useDev
      ? await resolveServer({ tool, root })
      : await resolveStaticServer({ tool, root, forceBuild });

  if (!externalUrl) console.log(`Ready at ${server.url}\n`);

  const { browser, context } = await launchBrowser({ captureFrames, verify });
  const isAborted = installAbortHandler();

  let captured = 0;
  let changed = 0;
  let failed = 0;

  try {
    if (useParallel) {
      const result = await captureParallel({
        context,
        entries,
        rendererFilter,
        baseUrl: server.url,
        tool,
        outBase,
        root,
        updateBaseline,
        extraWait,
        captureFrames,
        failOnError,
        observe,
        isAborted,
        workerCount,
      });
      captured = result.captured;
      changed = result.changed;
      failed = result.failed;
    } else {
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
        if (isAborted()) break;
        const entry = entries[entryIndex];
        // A progress header: a dimmed [N/M] counter then the entry name in bold. captureEntry prints the
        // per-renderer ✓/⊘/✗ detail lines below it.
        console.log(`${pc.dim(`[${entryIndex + 1}/${entries.length}]`)} ${pc.bold(entry.name)}`);
        const renderers = entry.renderers.filter((r) => rendererMatchesFilter(r, rendererFilter));

        const result = await captureEntry({
          context,
          entry,
          renderers,
          baseUrl: server.url,
          tool,
          outBase,
          root,
          updateBaseline,
          extraWait,
          captureFrames,
          failOnError,
          observe,
          isAborted,
        });

        if (result === 'ok') captured += renderers.length;
        else if (result === 'changed') changed += renderers.length;
        else failed += renderers.length;
      }
    }
  } finally {
    // The browser may already be closed by Playwright's own signal handler during an interrupt.
    await browser.close().catch(() => {});
    server.kill();
  }

  const interrupted = isAborted();
  const note = interrupted ? pc.yellow('   — interrupted (partial run)') : '';
  const runFailed = failed > 0 || (failOnChanged && changed > 0);
  console.log(
    '\n' +
      formatSummaryLine(runFailed, [
        formatSummaryCount(captured, 'captured', 'pass'),
        formatSummaryCount(changed, 'changed', 'warn'),
        formatSummaryCount(failed, 'failed', 'fail'),
      ]) +
      note,
  );
  console.log(`Output:   ${outBase}/${tool}/`);

  if (runFailed) process.exit(1);
  if (interrupted) process.exit(130);
}

main().catch((err: unknown) => {
  // A closed browser/page reject is the interrupt racing teardown — exit quietly, not with a raw stack.
  if (isBrowserClosedError(err)) process.exit(130);
  console.error(err);
  process.exit(1);
});
