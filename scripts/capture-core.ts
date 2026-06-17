// Shared types, discovery, server lifecycle, and capture logic used by
// capture.ts (one-shot) and watch-capture.ts (persistent watch).

import type { BrowserContext } from '@playwright/test';
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const RENDERERS = ['dom', 'canvas', 'webgl', 'webgpu'] as const;
export type Tool = 'explorer' | 'functional';

export interface Entry {
  name: string;
  renderers: string[];
}

export interface CaptureStatus {
  state: 'ready' | 'error';
  capturedAt: number;
  error: string | null;
  hash: string | null;
  baselineHash: string | null;
  /** null = no baseline exists yet; false = matches baseline; true = visual change detected */
  changed: boolean | null;
  diffPercent: number | null;
}

export interface Server {
  url: string;
  kill(): void;
}

export interface CaptureEntryOptions {
  context: BrowserContext;
  entry: Entry;
  renderers: string[];
  baseUrl: string;
  tool: Tool;
  outBase: string;
  /** Absolute path to the baselines root (e.g. <root>/tools/baselines). Omit to skip comparison. */
  baselineBase?: string;
  /** When true, writes the current screenshot as the new baseline instead of comparing. */
  updateBaseline?: boolean;
  extraWait?: number;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export function discoverEntries(tool: Tool, root: string): Entry[] {
  const dir = tool === 'explorer' ? join(root, 'examples') : join(root, 'tests', 'functional');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'package.json')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name }) => ({
      name,
      renderers: (RENDERERS as readonly string[]).filter((r) => existsSync(join(dir, name, `src/render.${r}.ts`))),
    }))
    .filter((e) => e.renderers.length > 0);
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

export function resolveServer(opts: { tool: Tool; root: string; externalUrl?: string }): Promise<Server> {
  const { tool, root, externalUrl } = opts;

  if (externalUrl) {
    const url = externalUrl.replace(/\/$/, '');
    return Promise.resolve({ url, kill: () => {} });
  }

  const toolDir = join(root, 'tools', tool === 'explorer' ? 'explorer' : 'functional');
  const viteJs = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const configPath = join(toolDir, 'vite.config.ts');

  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [viteJs, '--config', configPath], {
      cwd: toolDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let done = false;
    let output = '';

    const timeout = setTimeout(() => {
      if (!done) {
        proc.kill();
        reject(
          new Error(
            `Server did not start within 60s.\nCaptured output:\n${output}\n\n` +
              `Tip: start the server manually with "npm run ${tool === 'explorer' ? 'explorer' : 'test:functional'}" ` +
              `and pass --url=http://localhost:5173`,
          ),
        );
      }
    }, 60_000);

    const scan = (chunk: Buffer): void => {
      output += chunk.toString();
      const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
      const match = clean.match(/localhost:(\d+)/);
      if (match && !done) {
        done = true;
        clearTimeout(timeout);
        resolve({ url: `http://localhost:${match[1]}`, kill: () => proc.kill('SIGTERM') });
      }
    };

    proc.stdout?.on('data', scan);
    proc.stderr?.on('data', scan);
    proc.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

export async function launchBrowser() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  return { browser, context };
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export async function captureEntry(opts: CaptureEntryOptions): Promise<'ok' | 'changed' | 'error'> {
  const {
    context,
    entry,
    renderers,
    baseUrl,
    tool,
    outBase,
    baselineBase,
    updateBaseline = false,
    extraWait = 0,
  } = opts;
  let anyFailed = false;
  let anyChanged = false;

  for (const renderer of renderers) {
    const urlPath = tool === 'explorer' ? `examples/${entry.name}/${renderer}/` : `tests/${entry.name}/${renderer}/`;

    const url = `${baseUrl}/${urlPath}`;
    const outDir = join(resolve(outBase), tool, entry.name, renderer);
    mkdirSync(outDir, { recursive: true });

    const tmpScreenshot = join(outDir, 'screenshot.tmp.png');
    const finalScreenshot = join(outDir, 'screenshot.png');
    const tmpLogs = join(outDir, 'logs.tmp.jsonl');
    const finalLogs = join(outDir, 'logs.jsonl');
    const statusPath = join(outDir, 'status.json');

    const logs: unknown[] = [];
    const page = await context.newPage();

    page.on('console', (msg) => {
      const text = msg.text();
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed !== null && typeof parsed === 'object' && '__flight' in parsed) {
          logs.push(parsed);
        }
      } catch {
        // not a flight log entry
      }
    });

    page.on('pageerror', (err) => {
      logs.push({ __flight: true, t: -1, level: 'pageerror', data: { msg: err.message } });
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForSelector('canvas', { timeout: 8_000 }).catch(() => {});
      await page.evaluate(
        () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      );
      if (extraWait > 0) await page.waitForTimeout(extraWait);

      const screenshotBuffer = await page.screenshot();
      const hash = createHash('sha256').update(screenshotBuffer).digest('hex');

      // Atomic write: tmp files renamed into place, status.json written last.
      writeFileSync(tmpScreenshot, screenshotBuffer);
      writeFileSync(tmpLogs, logs.map((l) => JSON.stringify(l)).join('\n'));
      renameSync(tmpScreenshot, finalScreenshot);
      renameSync(tmpLogs, finalLogs);

      // Baseline update or comparison.
      let baselineHash: string | null = null;
      let changed: boolean | null = null;
      let diffPercent: number | null = null;

      if (baselineBase) {
        const blDir = join(resolve(baselineBase), tool, entry.name, renderer);
        const blPath = join(blDir, 'screenshot.png');

        if (updateBaseline) {
          mkdirSync(blDir, { recursive: true });
          writeFileSync(blPath, screenshotBuffer);
          baselineHash = hash;
          changed = false;
        } else if (existsSync(blPath)) {
          const blBuffer = readFileSync(blPath);
          baselineHash = createHash('sha256').update(blBuffer).digest('hex');

          if (hash === baselineHash) {
            changed = false;
          } else {
            const { PNG } = await import('pngjs');
            const { default: pixelmatch } = await import('pixelmatch');
            const current = PNG.sync.read(screenshotBuffer);
            const baseline = PNG.sync.read(blBuffer);
            const { width, height } = current;

            if (width === baseline.width && height === baseline.height) {
              const diff = new PNG({ width, height });
              const diffPixels = pixelmatch(current.data, baseline.data, diff.data, width, height, { threshold: 0.1 });
              diffPercent = (diffPixels / (width * height)) * 100;
              writeFileSync(join(outDir, 'diff.png'), PNG.sync.write(diff));
            } else {
              diffPercent = 100;
            }
            changed = true;
          }
        }
      }

      if (changed === true) anyChanged = true;
      const changeNote = changed === true ? `  ⚠  changed (${(diffPercent ?? 100).toFixed(2)}%)` : '';
      console.log(`  ✓  ${entry.name}/${renderer}${changeNote}`);

      const status: CaptureStatus = {
        state: 'ready',
        capturedAt: Date.now(),
        error: null,
        hash,
        baselineHash,
        changed,
        diffPercent,
      };
      writeFileSync(statusPath, JSON.stringify(status, null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logs.push({ __flight: true, t: -1, level: 'capture-error', data: { msg: message } });
      writeFileSync(finalLogs, logs.map((l) => JSON.stringify(l)).join('\n'));

      const status: CaptureStatus = {
        state: 'error',
        capturedAt: Date.now(),
        error: message,
        hash: null,
        baselineHash: null,
        changed: null,
        diffPercent: null,
      };
      writeFileSync(statusPath, JSON.stringify(status, null, 2));

      console.error(`  ✗  ${entry.name}/${renderer}: ${message}`);
      anyFailed = true;
    } finally {
      await page.close();
    }
  }

  if (anyFailed) return 'error';
  if (anyChanged) return 'changed';
  return 'ok';
}
