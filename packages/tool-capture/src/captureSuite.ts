// Reusable capture-suite orchestration: given declarative entries and a running server, own the
// deterministic browser, parallel/sequential scheduling, interruption, reporting, and exit verdict.
// Repository-specific discovery and build policy stay outside this module.

import { resolve } from 'node:path';

import pc from 'picocolors';

import { launchBrowser } from './captureBrowser.js';
import type { CaptureBrowserSession } from './captureBrowser.js';
import type { Entry } from './captureEntries.js';
import { captureParallel } from './captureEntry.js';
import type { CaptureTargetReport } from './captureEntry.js';
import { formatSummaryCount, formatSummaryLine } from './captureFormat.js';
import { installAbortHandler } from './captureInterrupt.js';
import { writeCaptureReport } from './captureReport.js';
import type { Server } from './captureServer.js';

export interface CaptureSuiteOptions {
  /** Stable output/baseline namespace, for example `examples`, `functional`, or an application name. */
  subject: string;
  entries: Readonly<Entry[]>;
  server: Server;
  /** Repository/package root containing `<subject>/baselines`; defaults to process.cwd(). */
  root?: string;
  /** Artifact base; outputs land at `<outBase>/<subject>/<entry>/<renderer>`; defaults to `.artifacts`. */
  outBase?: string;
  rendererFilter?: Readonly<string[]>;
  filter?: string;
  captureFrames?: number;
  extraWait?: number;
  updateBaseline?: boolean;
  failOnChanged?: boolean;
  failOnError?: boolean;
  observe?: boolean;
  verify?: boolean;
  sequential?: boolean;
  workerCount?: number;
  /** Reuse an already initialized browser/context. The caller owns its lifetime. */
  browserSession?: CaptureBrowserSession;
  maxRetries?: number;
  /** Aggregate machine report path. Defaults to `<outBase>/<subject>/report.json`; false disables it. */
  reportPath?: string | false;
}

export type CaptureFingerprintMap = Record<string, Record<string, string>>;

export interface CaptureSuiteResult {
  aborted: boolean;
  captured: number;
  changed: number;
  failed: number;
  shouldFail: boolean;
  /** Assertion-passed fingerprints collected as a by-product of capture. */
  fingerprints: CaptureFingerprintMap;
  durationMs: number;
  targets: CaptureTargetReport[];
  reportPath: string | null;
}

export async function runCaptureSuite(options: Readonly<CaptureSuiteOptions>): Promise<CaptureSuiteResult> {
  const startedAt = performance.now();
  const root = resolve(options.root ?? process.cwd());
  const outBase = resolve(root, options.outBase ?? '.artifacts');
  const rendererFilter = [...(options.rendererFilter ?? [])];
  const entries = options.filter
    ? options.entries.filter((entry) => entry.name.includes(options.filter!))
    : [...options.entries];
  if (entries.length === 0) throw new Error(`No capture entries found  subject=${options.subject}`);

  const captureFrames = options.captureFrames ?? 0;
  const verify = options.verify ?? options.subject === 'functional';
  const ownsBrowser = options.browserSession === undefined;
  const launched =
    options.browserSession ??
    (await launchBrowser({ captureFrames, verify, observe: options.observe }).catch((error: unknown) => {
      options.server.kill();
      throw error;
    }));
  const { browser, context } = launched;
  const isAborted = installAbortHandler();
  let captured = 0;
  let changed = 0;
  let failed = 0;
  let targets: CaptureTargetReport[] = [];
  const fingerprints: CaptureFingerprintMap = {};
  const onVerifiedFingerprint = (entry: string, renderer: string, fingerprint: string): void => {
    (fingerprints[entry] ??= {})[renderer] = fingerprint;
  };

  try {
    const result = await captureParallel({
      context,
      entries: [...entries],
      rendererFilter,
      baseUrl: options.server.url,
      tool: options.subject,
      outBase,
      root,
      updateBaseline: options.updateBaseline,
      extraWait: options.extraWait,
      captureFrames,
      failOnError: options.failOnError,
      observe: options.observe,
      verify,
      isAborted,
      workerCount: options.sequential ? 1 : (options.workerCount ?? 6),
      onVerifiedFingerprint,
      maxRetries: options.maxRetries,
    });
    captured = result.captured;
    changed = result.changed;
    failed = result.failed;
    targets = result.targets;
  } finally {
    if (ownsBrowser) await browser.close().catch(() => {});
    options.server.kill();
  }

  const aborted = isAborted();
  const shouldFail = failed > 0 || (options.failOnChanged === true && changed > 0);
  const note = aborted ? pc.yellow('   — interrupted (partial run)') : '';
  console.log(
    '\n' +
      formatSummaryLine(shouldFail, [
        formatSummaryCount(captured, 'captured', 'pass'),
        formatSummaryCount(changed, 'changed', 'warn'),
        formatSummaryCount(failed, 'failed', 'fail'),
      ]) +
      note,
  );
  console.log(`Output:   ${outBase}/${options.subject}/`);
  const reportPath =
    options.reportPath === false
      ? null
      : options.reportPath === undefined
        ? resolve(outBase, options.subject, 'report.json')
        : resolve(options.reportPath);
  const result: CaptureSuiteResult = {
    aborted,
    captured,
    changed,
    failed,
    shouldFail,
    fingerprints,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    targets,
    reportPath,
  };
  if (reportPath !== null) writeCaptureReport(reportPath, 'capture', result);
  return result;
}
