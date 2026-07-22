// Reusable capture-suite orchestration: given declarative entries and a running server, own the
// deterministic browser, parallel/sequential scheduling, interruption, reporting, and exit verdict.
// Repository-specific discovery and build policy stay outside this module.

import { resolve } from 'node:path';

import pc from 'picocolors';

import { launchBrowser } from './captureBrowser.js';
import type { CaptureBrowserSession } from './captureBrowser.js';
import type { Entry } from './captureEntries.js';
import { rendererMatchesFilter } from './captureEntries.js';
import { captureEntry, captureParallel } from './captureEntry.js';
import { formatSummaryCount, formatSummaryLine } from './captureFormat.js';
import { installAbortHandler } from './captureInterrupt.js';
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
}

export async function runCaptureSuite(options: Readonly<CaptureSuiteOptions>): Promise<CaptureSuiteResult> {
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
  const fingerprints: CaptureFingerprintMap = {};
  const onVerifiedFingerprint = (entry: string, renderer: string, fingerprint: string): void => {
    (fingerprints[entry] ??= {})[renderer] = fingerprint;
  };

  try {
    if (!options.sequential) {
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
        workerCount: options.workerCount ?? 6,
        onVerifiedFingerprint,
      });
      captured = result.captured;
      changed = result.changed;
      failed = result.failed;
    } else {
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
        if (isAborted()) break;
        const entry = entries[entryIndex]!;
        console.log(`${pc.dim(`[${entryIndex + 1}/${entries.length}]`)} ${pc.bold(entry.name)}`);
        const renderers = entry.renderers.filter((renderer) => rendererMatchesFilter(renderer, rendererFilter));
        const result = await captureEntry({
          context,
          entry,
          renderers,
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
          onVerifiedFingerprint,
        });
        if (result === 'ok') captured += renderers.length;
        else if (result === 'changed') changed += renderers.length;
        else failed += renderers.length;
      }
    }
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
  return { aborted, captured, changed, failed, shouldFail, fingerprints };
}
