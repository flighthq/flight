// The programmatic single-target capture entry (the charter North Star): drive one page for one
// (tool, name, renderer), synchronize to a presented frame, and return the artifact paths plus the
// parsed status.json verdict. It composes captureEntry over a single renderer so watch mode, the CLI
// sweep, and other repos share one hardened capture path rather than copied harness scripts.

import { existsSync, readFileSync } from 'node:fs';

import type { BrowserContext } from '@playwright/test';

import type { Tool } from './captureEntries.js';
import type { CaptureStatus } from './captureEntry.js';
import { captureEntry, getCaptureOutputPaths } from './captureEntry.js';

export interface CaptureRenderTargetOptions {
  context: BrowserContext;
  /** The running server's base URL (from resolveServer / resolveStaticServer, or an external URL). */
  baseUrl: string;
  /** Output base directory; artifacts land at {outBase}/{tool}/{name}/{renderer}/. */
  outBase: string;
  /** Repo root — committed baselines live at <tool>/baselines/<name>.json. */
  root: string;
  updateBaseline?: boolean;
  extraWait?: number;
  captureFrames?: number;
  failOnError?: boolean;
  isAborted?: () => boolean;
}

/** The artifacts and verdict of one captured render target. */
export interface CaptureRenderTargetResult {
  screenshotPath: string;
  logsPath: string;
  statusPath: string;
  /** The parsed status.json, or null when the capture was interrupted before writing one. */
  status: CaptureStatus | null;
  /** captureEntry's coarse verdict for the single renderer. */
  result: 'ok' | 'changed' | 'error';
}

export async function captureRenderTarget(
  tool: Tool,
  name: string,
  renderer: string,
  options: CaptureRenderTargetOptions,
): Promise<CaptureRenderTargetResult> {
  const { context, baseUrl, outBase, root } = options;

  const result = await captureEntry({
    context,
    entry: { name, renderers: [renderer] },
    renderers: [renderer],
    baseUrl,
    tool,
    outBase,
    root,
    updateBaseline: options.updateBaseline,
    extraWait: options.extraWait,
    captureFrames: options.captureFrames,
    failOnError: options.failOnError,
    isAborted: options.isAborted,
  });

  const { finalScreenshot, finalLogs, statusPath } = getCaptureOutputPaths(outBase, tool, name, renderer);
  const status = existsSync(statusPath) ? (JSON.parse(readFileSync(statusPath, 'utf8')) as CaptureStatus) : null;

  return { screenshotPath: finalScreenshot, logsPath: finalLogs, statusPath, status, result };
}
