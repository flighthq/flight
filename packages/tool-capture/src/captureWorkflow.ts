// High-level capture + fingerprint-validation + benchmark workflow. Visual passes share one browser;
// benchmarking gets a clean serial browser after visual resources are released. All passes share the
// server, avoiding duplicate builds/startups while keeping timing isolated from screenshot contention.

import { resolve } from 'node:path';

import pc from 'picocolors';

import type { CaptureBenchmarkOptions, CaptureBenchmarkResult } from './captureBenchmark.js';
import { runCaptureBenchmark } from './captureBenchmark.js';
import { launchBrowser } from './captureBrowser.js';
import type { CaptureBrowserSession } from './captureBrowser.js';
import type { Entry } from './captureEntries.js';
import { writeCaptureReport } from './captureReport.js';
import type { Server } from './captureServer.js';
import type { CaptureSuiteOptions, CaptureSuiteResult } from './captureSuite.js';
import { runCaptureSuite } from './captureSuite.js';
import type { CaptureValidationOptions, CaptureValidationResult } from './captureValidation.js';
import { runCaptureValidation } from './captureValidation.js';

export type CaptureWorkflowCaptureOptions = Omit<
  CaptureSuiteOptions,
  'browserSession' | 'entries' | 'root' | 'server' | 'subject'
>;
export type CaptureWorkflowBenchmarkOptions = Omit<
  CaptureBenchmarkOptions,
  'browserSession' | 'entries' | 'root' | 'server' | 'subject'
>;
export type CaptureWorkflowValidationOptions = Omit<
  CaptureValidationOptions,
  'browserSession' | 'entries' | 'fingerprints' | 'root' | 'server' | 'subject'
>;

export interface CaptureWorkflowOptions {
  subject: string;
  entries: Readonly<Entry[]>;
  server: Server;
  root?: string;
  /** Screenshot/log/status pass. Defaults to enabled; set false for validation-only workflows. */
  capture?: Readonly<CaptureWorkflowCaptureOptions> | false;
  /** Fingerprint parity/regression pass. Defaults to enabled; set false for capture-only workflows. */
  validation?: Readonly<CaptureWorkflowValidationOptions> | false;
  /** Synchronized performance samples and regression pass. Disabled unless configured. */
  benchmark?: Readonly<CaptureWorkflowBenchmarkOptions> | false;
  reportPath?: string | false;
}

export interface CaptureWorkflowResult {
  aborted: boolean;
  capture: CaptureSuiteResult | null;
  shouldFail: boolean;
  validation: CaptureValidationResult | null;
  benchmark: CaptureBenchmarkResult | null;
  durationMs: number;
  reportPath: string | null;
}

/** Runs lazily-resolved subject workflows through a bounded worker pool and returns one aggregate verdict. */
export async function runCaptureBatch(options: Readonly<CaptureBatchOptions>): Promise<CaptureBatchResult> {
  const startedAt = performance.now();
  if (options.subjects.length === 0) throw new Error('No capture batch subjects found');
  const jobs = options.subjects.map((subject, index) => ({ index, subject }));
  const results: CaptureBatchSubjectResult[] = Array.from({ length: jobs.length });
  const activeWorkers = Math.min(Math.max(1, options.subjectWorkerCount ?? 1), jobs.length);

  await Promise.all(
    Array.from({ length: activeWorkers }, async () => {
      while (true) {
        const job = jobs.shift();
        if (job === undefined) return;
        console.log(`${pc.bold(`Subject ${job.index + 1}/${results.length}:`)} ${job.subject.name}\n`);
        try {
          const result = await runCaptureWorkflow(await job.subject.resolve());
          results[job.index] = { error: null, name: job.subject.name, result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(pc.red(`${job.subject.name}: ${message}\n`));
          results[job.index] = { error: message, name: job.subject.name, result: null };
        }
      }
    }),
  );

  const failed = results.filter((subject) => subject.error !== null || subject.result?.shouldFail === true).length;
  const aborted = results.some((subject) => subject.result?.aborted === true);
  const passed = results.length - failed;
  const shouldFail = failed > 0;
  console.log(
    `${shouldFail ? pc.red('✗ failed') : pc.green('✓ passed')}   ${passed} subjects passed   ${failed} subjects failed${aborted ? pc.yellow('   — interrupted') : ''}`,
  );
  const reportPath =
    options.reportPath === false
      ? null
      : resolve(
          options.reportPath ?? process.cwd(),
          ...(options.reportPath === undefined ? ['.artifacts', 'capture-batch-report.json'] : []),
        );
  const result: CaptureBatchResult = {
    aborted,
    failed,
    passed,
    shouldFail,
    subjects: results,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    reportPath,
  };
  if (reportPath !== null) writeCaptureReport(reportPath, 'batch', result);
  return result;
}

export interface CaptureBatchSubject {
  name: string;
  resolve(): Promise<CaptureWorkflowOptions>;
}

export interface CaptureBatchOptions {
  subjects: Readonly<CaptureBatchSubject[]>;
  /** Number of subjects processed concurrently. Resource concurrency remains configured per subject. */
  subjectWorkerCount?: number;
  reportPath?: string | false;
}

export interface CaptureBatchSubjectResult {
  error: string | null;
  name: string;
  result: CaptureWorkflowResult | null;
}

export interface CaptureBatchResult {
  aborted: boolean;
  failed: number;
  passed: number;
  shouldFail: boolean;
  subjects: CaptureBatchSubjectResult[];
  durationMs: number;
  reportPath: string | null;
}

/** Runs the enabled capture and validation passes for one subject against one shared server. */
export async function runCaptureWorkflow(options: Readonly<CaptureWorkflowOptions>): Promise<CaptureWorkflowResult> {
  const startedAt = performance.now();
  const borrowedServer: Server = { url: options.server.url, kill() {} };
  let capture: CaptureSuiteResult | null = null;
  let validation: CaptureValidationResult | null = null;
  let benchmark: CaptureBenchmarkResult | null = null;
  const captureOptions = options.capture === false ? null : (options.capture ?? {});
  const validationOptions = options.validation === false ? null : (options.validation ?? {});
  const benchmarkOptions = options.benchmark === false || options.benchmark === undefined ? null : options.benchmark;
  if (captureOptions === null && validationOptions === null && benchmarkOptions === null) {
    options.server.kill();
    return {
      aborted: false,
      capture: null,
      shouldFail: false,
      validation: null,
      benchmark: null,
      durationMs: 0,
      reportPath: null,
    };
  }
  const captureFrames = Math.max(1, captureOptions?.captureFrames ?? 1, validationOptions?.captureFrames ?? 1);
  let browserSession: CaptureBrowserSession | null = null;
  try {
    if (captureOptions !== null || validationOptions !== null) {
      browserSession = await launchBrowser({
        captureFrames,
        verify: validationOptions !== null || captureOptions?.verify === true || options.subject === 'functional',
        observe: captureOptions?.observe,
      });
      if (captureOptions !== null) {
        capture = await runCaptureSuite({
          ...captureOptions,
          subject: options.subject,
          entries: options.entries,
          server: borrowedServer,
          root: options.root,
          browserSession,
          captureFrames,
          verify: captureOptions.verify ?? validationOptions !== null,
        });
      }
      if (capture?.aborted !== true && validationOptions !== null) {
        validation = await runCaptureValidation({
          ...validationOptions,
          subject: options.subject,
          entries: options.entries,
          server: borrowedServer,
          root: options.root,
          browserSession,
          captureFrames,
          fingerprints: capture?.fingerprints,
        });
      }
      // Timing must not share a browser/GPU process with the parallel screenshot pass. Keep the server
      // warm, but release visual resources before the benchmark launches its clean serial session.
      await browserSession.browser.close().catch(() => {});
      browserSession = null;
    }
    if (
      capture?.aborted !== true &&
      validation?.aborted !== true &&
      capture?.shouldFail !== true &&
      validation?.shouldFail !== true &&
      benchmarkOptions !== null
    ) {
      benchmark = await runCaptureBenchmark({
        ...benchmarkOptions,
        subject: options.subject,
        entries: options.entries,
        server: borrowedServer,
        root: options.root,
      });
    }
  } finally {
    await browserSession?.browser.close().catch(() => {});
    options.server.kill();
  }

  const aborted = capture?.aborted === true || validation?.aborted === true;
  const shouldFail = capture?.shouldFail === true || validation?.shouldFail === true || benchmark?.shouldFail === true;
  console.log(
    `${pc.bold(options.subject)} workflow ${shouldFail ? pc.red('failed') : aborted ? pc.yellow('interrupted') : pc.green('passed')}\n`,
  );
  const reportPath =
    options.reportPath === false
      ? null
      : resolve(
          options.reportPath ?? options.root ?? process.cwd(),
          ...(options.reportPath === undefined ? ['.artifacts', options.subject, 'workflow-report.json'] : []),
        );
  const result: CaptureWorkflowResult = {
    aborted,
    capture,
    benchmark,
    shouldFail,
    validation,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    reportPath,
  };
  if (reportPath !== null) writeCaptureReport(reportPath, 'workflow', result);
  return result;
}
