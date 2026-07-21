// High-level capture + fingerprint-validation workflow. The lower-level passes continue to own their
// browser contexts; this layer lends both the same server and closes it once the complete subject has
// finished, avoiding a duplicate build/server startup for the common smoke-then-verify workflow.

import pc from 'picocolors';

import type { Entry } from './captureEntries.js';
import type { Server } from './captureServer.js';
import type { CaptureSuiteOptions, CaptureSuiteResult } from './captureSuite.js';
import { runCaptureSuite } from './captureSuite.js';
import type { CaptureValidationOptions, CaptureValidationResult } from './captureValidation.js';
import { runCaptureValidation } from './captureValidation.js';

export type CaptureWorkflowCaptureOptions = Omit<CaptureSuiteOptions, 'entries' | 'root' | 'server' | 'subject'>;
export type CaptureWorkflowValidationOptions = Omit<
  CaptureValidationOptions,
  'entries' | 'root' | 'server' | 'subject'
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
}

export interface CaptureWorkflowResult {
  aborted: boolean;
  capture: CaptureSuiteResult | null;
  shouldFail: boolean;
  validation: CaptureValidationResult | null;
}

/** Runs lazily-resolved subject workflows through a bounded worker pool and returns one aggregate verdict. */
export async function runCaptureBatch(options: Readonly<CaptureBatchOptions>): Promise<CaptureBatchResult> {
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
  return { aborted, failed, passed, shouldFail, subjects: results };
}

export interface CaptureBatchSubject {
  name: string;
  resolve(): Promise<CaptureWorkflowOptions>;
}

export interface CaptureBatchOptions {
  subjects: Readonly<CaptureBatchSubject[]>;
  /** Number of subjects processed concurrently. Resource concurrency remains configured per subject. */
  subjectWorkerCount?: number;
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
}

/** Runs the enabled capture and validation passes for one subject against one shared server. */
export async function runCaptureWorkflow(options: Readonly<CaptureWorkflowOptions>): Promise<CaptureWorkflowResult> {
  const borrowedServer: Server = { url: options.server.url, kill() {} };
  let capture: CaptureSuiteResult | null = null;
  let validation: CaptureValidationResult | null = null;

  try {
    if (options.capture !== false) {
      capture = await runCaptureSuite({
        ...options.capture,
        subject: options.subject,
        entries: options.entries,
        server: borrowedServer,
        root: options.root,
      });
    }
    if (capture?.aborted !== true && options.validation !== false) {
      validation = await runCaptureValidation({
        ...options.validation,
        subject: options.subject,
        entries: options.entries,
        server: borrowedServer,
        root: options.root,
      });
    }
  } finally {
    options.server.kill();
  }

  const aborted = capture?.aborted === true || validation?.aborted === true;
  const shouldFail = capture?.shouldFail === true || validation?.shouldFail === true;
  console.log(
    `${pc.bold(options.subject)} workflow ${shouldFail ? pc.red('failed') : aborted ? pc.yellow('interrupted') : pc.green('passed')}\n`,
  );
  return { aborted, capture, shouldFail, validation };
}
