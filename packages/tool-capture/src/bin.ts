#!/usr/bin/env node
// The tool-capture CLI. First (and currently only) command: `observe <url>` — the standalone eyes
// primitive. Point it at any running page and it drives a deterministic headless render, grabs the
// present frame (via the getContext intercept — zero page integration), and writes screenshot.png +
// logs.jsonl + status.json (with the observe diagnostics block). No capture script or discovery needed
// in the consumer; a repo just adds `"capture:observe": "tool-capture observe"` and points it at a URL.

import { resolve } from 'node:path';

import { captureUrl } from './captureEntry.js';

const USAGE = 'usage: tool-capture observe <url> [--out <dir>] [--wait <ms>] [--frames <n>]';

function flag(argv: readonly string[], key: string): string | undefined {
  const i = argv.indexOf(`--${key}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] !== 'observe') {
    console.error(USAGE);
    process.exit(2);
  }
  const url = argv[1];
  if (url === undefined || url.startsWith('--')) {
    console.error(`observe requires a <url>\n${USAGE}`);
    process.exit(2);
  }
  const outDir = resolve(flag(argv, 'out') ?? './capture');
  const wait = Number.parseInt(flag(argv, 'wait') ?? '0', 10) || 0;
  const captureFrames = Number.parseInt(flag(argv, 'frames') ?? '1', 10) || 1;

  const diagnostics = await captureUrl(url, { outDir, wait, captureFrames });
  console.log(`captured → ${resolve(outDir, 'screenshot.png')}`);
  console.log(`observe   ${JSON.stringify(diagnostics)}`);
  // Exit explicitly — the browser's live handles would otherwise keep the event loop alive after
  // teardown and hang the process (the same trap the capture scripts hit).
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
