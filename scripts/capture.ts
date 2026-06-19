// One-shot screenshot and log capture for the explorer, functional, or landing tool.
//
// Usage:
//   tsx ./scripts/capture.ts [options]
//
// Options:
//   --tool=explorer|functional|landing  Which server to use (default: explorer)
//   --url=http://localhost:5173   Use a server that is already running (skips auto-start)
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
//
// Output per entry:
//   {out}/{tool}/{name}/{renderer}/screenshot.png
//   {out}/{tool}/{name}/{renderer}/logs.jsonl
//   {out}/{tool}/{name}/{renderer}/status.json
//
// Requires Playwright browsers: npx playwright install chromium

import { resolve } from 'path';

import { captureEntry, discoverEntries, launchBrowser, resolveServer } from './capture-core.js';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function arg(key: string, fallback: string): string {
  const hit = argv.find((a) => a.startsWith(`--${key}=`));
  return hit ? hit.slice(key.length + 3) : fallback;
}

const tool = arg('tool', 'explorer') as 'explorer' | 'functional' | 'landing';
const externalUrl = arg('url', '');
const filter = arg('filter', '');
const rendererFilter = arg('renderer', '').split(',').filter(Boolean);
const outBase = resolve(process.cwd(), arg('out', 'tools/output'));
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
const baselineBase = resolve(process.cwd(), 'tools/baselines');

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
  } else {
    console.log(`Starting ${tool} server…`);
  }

  const server = await resolveServer({ tool, root, externalUrl });

  if (!externalUrl) console.log(`Ready at ${server.url}\n`);

  const { browser, context } = await launchBrowser({ captureFrames });

  let captured = 0;
  let changed = 0;
  let failed = 0;

  try {
    for (const entry of entries) {
      const renderers =
        rendererFilter.length > 0 ? entry.renderers.filter((r) => rendererFilter.includes(r)) : entry.renderers;

      const result = await captureEntry({
        context,
        entry,
        renderers,
        baseUrl: server.url,
        tool,
        outBase,
        baselineBase,
        updateBaseline,
        extraWait,
        captureFrames,
      });

      if (result === 'ok') captured += renderers.length;
      else if (result === 'changed') changed += renderers.length;
      else failed += renderers.length;
    }
  } finally {
    await browser.close();
    server.kill();
  }

  const changedNote = changed > 0 ? `  Changed: ${changed}` : '';
  console.log(`\nCaptured: ${captured}${changedNote}  Failed: ${failed}`);
  console.log(`Output:   ${outBase}/${tool}/`);

  if (failed > 0 || (failOnChanged && changed > 0)) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
