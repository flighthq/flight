// Watches source files and re-captures on change. Runs on the host alongside
// the Vite dev server. An agent inside a sandbox reads the output files directly.
//
// Usage:
//   tsx ./scripts/watch-capture.ts [options]
//
// Options:
//   --url=http://localhost:5173   Use a server that is already running (skips auto-start)
//   --tool=examples|functional|site  Which tool's sources to watch (default: examples)
//   --filter=name                 Only watch entries whose name contains this string
//   --renderer=webgl,canvas       Comma-separated renderer filter (default: all)
//   --out=tools/output            Output base directory (default: tools/output)
//   --wait=500                    Extra ms to wait after RAF before screenshot (default: 0)
//
// Output per entry (status.json written last — it is the commit point):
//   {out}/{tool}/{name}/{renderer}/screenshot.png
//   {out}/{tool}/{name}/{renderer}/logs.jsonl
//   {out}/{tool}/{name}/{renderer}/status.json
//
// status.json shape:
//   { "state": "ready" | "error", "capturedAt": <unix ms>, "error": null | "message" }
//
// Agent workflow:
//   1. Edit a source file
//   2. Read tools/output/{tool}/{name}/{renderer}/screenshot.png  (multimodal Read)
//   3. Read tools/output/{tool}/{name}/{renderer}/logs.jsonl
//   4. Optionally check status.json.capturedAt against your edit time for freshness

import type { Browser, BrowserContext } from '@playwright/test';
import chokidar from 'chokidar';
import { resolve, sep } from 'path';
import pc from 'picocolors';

import type { Entry, Tool } from './capture-core.js';
import { captureEntry, discoverEntries, installAbortHandler, launchBrowser, resolveServer } from './capture-core.js';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function arg(key: string, fallback: string): string {
  const hit = argv.find((a) => a.startsWith(`--${key}=`));
  return hit ? hit.slice(key.length + 3) : fallback;
}

const externalUrl = arg('url', '');
const tool = arg('tool', 'examples') as Tool;
const filter = arg('filter', '');
const rendererFilter = arg('renderer', '').split(',').filter(Boolean);
const outBase = resolve(process.cwd(), arg('out', '.artifacts'));
const extraWait = parseInt(arg('wait', '0'), 10);

const root = process.cwd();

// ---------------------------------------------------------------------------
// Watch helpers
// ---------------------------------------------------------------------------

function entryNameFromPath(filePath: string, tool: Tool): string | null {
  // The landing tool is a single fixed entry, so any change under its directory maps to it.
  if (tool === 'site') return 'landing';

  const parts = filePath.split(sep);
  const marker = tool === 'examples' ? 'examples' : 'functional';
  const idx = parts.lastIndexOf(marker);
  return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : null;
}

// ---------------------------------------------------------------------------
// Capture queue (serialised to avoid concurrent Playwright pages)
// ---------------------------------------------------------------------------

type CaptureTask = () => Promise<void>;
const queue: CaptureTask[] = [];
let running = false;

function enqueue(task: CaptureTask): void {
  queue.push(task);
  if (!running) void drain();
}

async function drain(): Promise<void> {
  running = true;
  while (queue.length > 0) {
    await queue.shift()!();
  }
  running = false;
}

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

  const { browser, context }: { browser: Browser; context: BrowserContext } = await launchBrowser();
  const isAborted = installAbortHandler();

  const filteredRenderers = (entry: Entry): string[] =>
    rendererFilter.length > 0 ? entry.renderers.filter((r) => rendererFilter.includes(r)) : entry.renderers;

  const runCapture = (entry: Entry): Promise<void> =>
    captureEntry({
      context,
      entry,
      renderers: filteredRenderers(entry),
      baseUrl: server.url,
      tool,
      outBase,
      root,
      extraWait,
      isAborted,
    }).then(() => {});

  // Initial capture of all matched entries so the agent has a baseline immediately. A dimmed [N/M]
  // counter + bold name per entry matches capture.ts so a long initial pass shows progress.
  console.log(`Initial capture…`);
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    if (isAborted()) break;
    const entry = entries[entryIndex];
    console.log(`${pc.dim(`[${entryIndex + 1}/${entries.length}]`)} ${pc.bold(entry.name)}`);
    await runCapture(entry);
  }
  // A Ctrl+C during the initial pass exits cleanly rather than dropping into watch mode.
  if (isAborted()) {
    await browser.close().catch(() => {});
    server.kill();
    return;
  }
  console.log(`\nWatching ${tool} for changes. Ctrl+C to stop.\n`);

  // Per-entry debounce timers.
  const debounce = new Map<string, ReturnType<typeof setTimeout>>();

  const watchDir =
    tool === 'examples'
      ? `${root}/examples`
      : tool === 'functional'
        ? `${root}/functional`
        : `${root}/apps/site/landing`;

  const watcher = chokidar.watch(watchDir, {
    ignored: /(node_modules|dist|\.git)/,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  watcher.on('change', (filePath) => {
    const name = entryNameFromPath(filePath, tool);
    if (!name) return;

    const entry = entries.find((e) => e.name === name);
    if (!entry) return;

    clearTimeout(debounce.get(name));
    debounce.set(
      name,
      setTimeout(() => {
        debounce.delete(name);
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${name} changed — capturing…`);
        enqueue(() => runCapture(entry));
      }, 800),
    );
  });

  const shutdown = async (): Promise<void> => {
    console.log('\nStopping…');
    await watcher.close();
    await browser.close();
    server.kill();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
