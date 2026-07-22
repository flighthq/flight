// Performance is deliberately a separate pass from screenshots and visual verification: timed
// intervals contain only repeatable page work plus the backend-specific completion fence registered
// by the page adapter. Results retain raw samples, robust statistics, host calibration, and same-run
// reference ratios so consumers can choose the strongest baseline available for their environment.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { BrowserContext } from '@playwright/test';
import pc from 'picocolors';

import { launchBrowser } from './captureBrowser.js';
import type { CaptureBrowserSession } from './captureBrowser.js';
import type { Entry } from './captureEntries.js';
import { rendererMatchesFilter, routeSegment } from './captureEntries.js';
import { installAbortHandler } from './captureInterrupt.js';
import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol.js';
import { writeCaptureReport } from './captureReport.js';
import type { Server } from './captureServer.js';

export const CAPTURE_BENCHMARK_VERSION = 1 as const;

export interface CaptureBenchmarkOptions {
  subject: string;
  entries: Readonly<Entry[]>;
  server: Server;
  root?: string;
  filter?: string;
  rendererFilter?: Readonly<string[]>;
  warmupIterations?: number;
  iterations?: number;
  samples?: number;
  /** Minimum duration of each timed sample; iteration count adapts upward to reach it. */
  sampleDurationMs?: number;
  /** Fresh-page retries for transient navigation/protocol timeouts. Default: 1. */
  maxRetries?: number;
  /** Renderer used for same-entry ratios, for example canvas. */
  reference?: string;
  /** Maximum accepted slowdown as a fraction (0.2 = 20%). */
  regressionTolerance?: number;
  /** Maximum median absolute deviation / median accepted while updating a baseline. */
  stabilityTolerance?: number;
  updateBaselines?: boolean;
  browserSession?: CaptureBrowserSession;
  reportPath?: string | false;
}

export interface CaptureBenchmarkStatistics {
  medianMs: number;
  p95Ms: number;
  madMs: number;
  relativeMad: number;
  minMs: number;
  maxMs: number;
}

export interface CaptureBenchmarkCalibration {
  cpuOperationsPerMs: number;
  gpuOperationsPerMs: number | null;
  userAgent: string;
  hardwareConcurrency: number;
  platform: string;
}

export interface CaptureBenchmarkTargetResult {
  entry: string;
  renderer: string;
  kind: string;
  samplesMs: number[];
  iterations: number;
  retries: number;
  statistics: CaptureBenchmarkStatistics | null;
  normalizedWork: number | null;
  referenceRatio: number | null;
  baselineMetric: 'referenceRatio' | 'normalizedWork' | null;
  baselineValue: number | null;
  change: number | null;
  status: 'passed' | 'failed' | 'skipped' | 'updated';
  error: string | null;
}

export interface CaptureBenchmarkResult {
  aborted: boolean;
  calibration: CaptureBenchmarkCalibration;
  durationMs: number;
  failed: number;
  passed: number;
  skipped: number;
  updated: number;
  shouldFail: boolean;
  targets: CaptureBenchmarkTargetResult[];
  reportPath: string | null;
}

interface CaptureBenchmarkBaselineTarget {
  normalizedWork: number | null;
  referenceRatio: number | null;
}

interface CaptureBenchmarkBaseline {
  version: typeof CAPTURE_BENCHMARK_VERSION;
  reference: string | null;
  targets: Record<string, CaptureBenchmarkBaselineTarget>;
}

export function benchmarkBaselinePath(root: string, subject: string, entry: string): string {
  return join(root, subject, 'benchmarks', `${entry}.json`);
}

export function calculateCaptureBenchmarkStatistics(samples: readonly number[]): CaptureBenchmarkStatistics {
  if (samples.length === 0 || samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new Error('benchmark samples must contain finite non-negative values');
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const medianMs = percentile(sorted, 0.5);
  const deviations = sorted.map((sample) => Math.abs(sample - medianMs)).sort((a, b) => a - b);
  const madMs = percentile(deviations, 0.5);
  return {
    medianMs,
    p95Ms: percentile(sorted, 0.95),
    madMs,
    relativeMad: medianMs === 0 ? 0 : madMs / medianMs,
    minMs: sorted[0]!,
    maxMs: sorted.at(-1)!,
  };
}

export function evaluateCaptureBenchmarkRegression(
  current: number,
  baseline: number,
  tolerance: number,
): { change: number; pass: boolean } {
  if (!(current >= 0) || !(baseline > 0) || !(tolerance >= 0)) return { change: Number.POSITIVE_INFINITY, pass: false };
  const change = current / baseline - 1;
  return { change, pass: change <= tolerance };
}

async function benchmarkTarget(
  context: BrowserContext,
  baseUrl: string,
  subject: string,
  entry: Readonly<Entry>,
  renderer: string,
  options: {
    calibration: CaptureBenchmarkCalibration;
    iterations: number;
    protocolVersion: number;
    sampleCount: number;
    sampleDurationMs: number;
    warmupIterations: number;
  },
): Promise<CaptureBenchmarkTargetResult> {
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/${entryRoute(entry, renderer, subject)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.waitForFunction(
      () => {
        const captureWindow = window as unknown as {
          __ftBenchmarkTarget?: { ready?: boolean };
          __ftVerification?: { state?: string };
        };
        return (
          (captureWindow.__ftBenchmarkTarget !== undefined && captureWindow.__ftBenchmarkTarget.ready !== false) ||
          captureWindow.__ftVerification?.state === 'passed' ||
          captureWindow.__ftVerification?.state === 'failed' ||
          document.getElementById('ft-error') !== null
        );
      },
      null,
      { polling: 50, timeout: 15_000 },
    );
    const verificationState = await page.evaluate(
      () =>
        (window as unknown as { __ftVerification?: { state?: string; error?: string | null } }).__ftVerification ??
        null,
    );
    if (verificationState?.state === 'pending') {
      await page
        .waitForFunction(
          () => {
            const state = (window as unknown as { __ftVerification?: { state?: string } }).__ftVerification?.state;
            return state === 'passed' || state === 'failed';
          },
          null,
          { polling: 50, timeout: 15_000 },
        )
        .catch(() => {});
    }
    const verification = await page.evaluate(
      () =>
        (window as unknown as { __ftVerification?: { state?: string; error?: string | null } }).__ftVerification ??
        null,
    );
    if (verification?.state === 'failed') {
      throw new Error(`visual verification failed: ${verification.error ?? 'unknown error'}`);
    }
    const ready = await page.evaluate(() => {
      const target = (window as unknown as { __ftBenchmarkTarget?: { ready?: boolean } }).__ftBenchmarkTarget;
      return target !== undefined && target.ready !== false;
    });
    if (!ready) {
      return {
        entry: entry.name,
        renderer,
        kind: rendererBackend(renderer),
        samplesMs: [],
        iterations: 0,
        retries: 0,
        statistics: null,
        normalizedWork: null,
        referenceRatio: null,
        baselineMetric: null,
        baselineValue: null,
        change: null,
        status: 'skipped',
        error: 'page did not register repeatable benchmark work',
      };
    }
    const measured = await page.evaluate(
      async ({ iterations, protocolVersion, sampleCount, sampleDurationMs, warmupIterations }) => {
        const target = (
          window as unknown as {
            __ftBenchmarkTarget: {
              protocolVersion?: number;
              ready?: boolean;
              kind: string;
              run(): void | Promise<void>;
              synchronize(): void | Promise<void>;
            };
          }
        ).__ftBenchmarkTarget;
        if (target.protocolVersion !== undefined && target.protocolVersion !== protocolVersion) {
          throw new Error(`benchmark protocol ${target.protocolVersion} is incompatible with ${protocolVersion}`);
        }
        for (let index = 0; index < warmupIterations; index++) {
          const pending = target.run();
          if (pending !== undefined) await pending;
        }
        await target.synchronize();
        let measuredIterations = iterations;
        for (let attempt = 0; attempt < 8; attempt++) {
          const start = performance.now();
          for (let iteration = 0; iteration < measuredIterations; iteration++) {
            const pending = target.run();
            if (pending !== undefined) await pending;
          }
          await target.synchronize();
          const elapsed = performance.now() - start;
          if (elapsed >= sampleDurationMs || measuredIterations >= 1_000_000) break;
          const multiplier = Math.min(10, Math.max(2, Math.ceil(sampleDurationMs / Math.max(elapsed, 0.01))));
          measuredIterations = Math.min(1_000_000, measuredIterations * multiplier);
        }
        const samples: number[] = [];
        for (let sample = 0; sample < sampleCount; sample++) {
          const start = performance.now();
          for (let iteration = 0; iteration < measuredIterations; iteration++) {
            const pending = target.run();
            if (pending !== undefined) await pending;
          }
          await target.synchronize();
          samples.push((performance.now() - start) / measuredIterations);
        }
        return { iterations: measuredIterations, kind: target.kind, samples };
      },
      options,
    );
    const statistics = calculateCaptureBenchmarkStatistics(measured.samples);
    const throughput =
      measured.kind === 'webgl' || measured.kind === 'webgpu'
        ? options.calibration.gpuOperationsPerMs
        : options.calibration.cpuOperationsPerMs;
    return {
      entry: entry.name,
      renderer,
      kind: measured.kind,
      samplesMs: measured.samples.map(round),
      iterations: measured.iterations,
      retries: 0,
      statistics: mapStatistics(statistics),
      normalizedWork: throughput === null ? null : round(statistics.medianMs * throughput),
      referenceRatio: null,
      baselineMetric: null,
      baselineValue: null,
      change: null,
      status: 'skipped',
      error: null,
    };
  } catch (error) {
    return {
      entry: entry.name,
      renderer,
      kind: rendererBackend(renderer),
      samplesMs: [],
      iterations: 0,
      retries: 0,
      statistics: null,
      normalizedWork: null,
      referenceRatio: null,
      baselineMetric: null,
      baselineValue: null,
      change: null,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function calibrateCaptureBrowser(context: BrowserContext): Promise<CaptureBenchmarkCalibration> {
  const page = await context.newPage();
  try {
    return await page.evaluate(async () => {
      const cpuOperations = 2_000_000;
      const cpuRates: number[] = [];
      for (let sample = 0; sample < 5; sample++) {
        let value = 0x9e3779b9;
        const start = performance.now();
        for (let index = 0; index < cpuOperations; index++) value = Math.imul(value ^ (value >>> 15), 1 | value);
        const elapsed = performance.now() - start;
        if (value === 0x7fffffff) document.title = String(value);
        cpuRates.push(cpuOperations / Math.max(elapsed, 0.001));
      }

      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
      let gpuOperationsPerMs: number | null = null;
      if (gl !== null) {
        const gpuOperations = 2_000;
        const gpuRates: number[] = [];
        for (let sample = 0; sample < 5; sample++) {
          const start = performance.now();
          for (let index = 0; index < gpuOperations; index++) {
            gl.clearColor((index & 7) / 7, ((index >> 3) & 7) / 7, ((index >> 6) & 7) / 7, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }
          gl.finish();
          gpuRates.push(gpuOperations / Math.max(performance.now() - start, 0.001));
        }
        gpuRates.sort((a, b) => a - b);
        gpuOperationsPerMs = gpuRates[Math.floor(gpuRates.length / 2)]!;
      }
      cpuRates.sort((a, b) => a - b);
      return {
        cpuOperationsPerMs: cpuRates[Math.floor(cpuRates.length / 2)]!,
        gpuOperationsPerMs,
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        platform: navigator.platform,
      };
    });
  } finally {
    await page.close().catch(() => {});
  }
}

function applyReferenceRatios(targets: CaptureBenchmarkTargetResult[], reference: string | undefined): void {
  if (reference === undefined) return;
  const referenceMedian = targets.find((target) => target.renderer === reference)?.statistics?.medianMs;
  if (referenceMedian === undefined || referenceMedian <= 0) return;
  for (const target of targets) {
    if (target.statistics !== null) target.referenceRatio = round(target.statistics.medianMs / referenceMedian);
  }
}

function applyBenchmarkBaseline(options: {
  root: string;
  subject: string;
  entry: string;
  targets: CaptureBenchmarkTargetResult[];
  reference?: string;
  regressionTolerance: number;
  stabilityTolerance: number;
  update: boolean;
}): void {
  const path = benchmarkBaselinePath(options.root, options.subject, options.entry);
  const baseline = readBenchmarkBaseline(path);
  if (options.update) {
    const next: CaptureBenchmarkBaseline = {
      version: CAPTURE_BENCHMARK_VERSION,
      reference: options.reference ?? null,
      targets: {},
    };
    for (const target of options.targets) {
      if (target.status === 'failed' || target.statistics === null) continue;
      if (target.statistics.relativeMad > options.stabilityTolerance) {
        target.status = 'skipped';
        target.error = `unstable samples: relative MAD ${target.statistics.relativeMad.toFixed(3)} > ${options.stabilityTolerance}`;
        continue;
      }
      next.targets[target.renderer] = {
        normalizedWork: target.normalizedWork,
        referenceRatio: target.referenceRatio,
      };
      target.status = 'updated';
    }
    writeBenchmarkBaseline(path, next);
    return;
  }

  for (const target of options.targets) {
    if (target.status === 'failed' || target.statistics === null) continue;
    const committed = baseline?.targets[target.renderer];
    if (committed === undefined) {
      target.status = 'skipped';
      target.error = 'no benchmark baseline';
      continue;
    }
    const useRatio =
      target.renderer !== options.reference &&
      baseline?.reference === (options.reference ?? null) &&
      target.referenceRatio !== null &&
      committed.referenceRatio !== null;
    const current = useRatio ? target.referenceRatio : target.normalizedWork;
    const expected = useRatio ? committed.referenceRatio : committed.normalizedWork;
    if (current === null || expected === null) {
      target.status = 'skipped';
      target.error = 'no comparable calibrated metric';
      continue;
    }
    const regression = evaluateCaptureBenchmarkRegression(current, expected, options.regressionTolerance);
    target.baselineMetric = useRatio ? 'referenceRatio' : 'normalizedWork';
    target.baselineValue = expected;
    target.change = round(regression.change);
    target.status = regression.pass ? 'passed' : 'failed';
    if (!regression.pass)
      target.error = `performance regression ${(regression.change * 100).toFixed(1)}% > ${(options.regressionTolerance * 100).toFixed(1)}%`;
  }
}

export async function runCaptureBenchmark(options: Readonly<CaptureBenchmarkOptions>): Promise<CaptureBenchmarkResult> {
  const startedAt = performance.now();
  const root = resolve(options.root ?? process.cwd());
  const entries = (
    options.filter ? options.entries.filter((entry) => entry.name.includes(options.filter!)) : [...options.entries]
  ).map((entry) => ({
    ...entry,
    renderers: entry.renderers.filter((renderer) => rendererMatchesFilter(renderer, options.rendererFilter ?? [])),
  }));
  if (entries.length === 0 || !entries.some((entry) => entry.renderers.length > 0)) {
    options.server.kill();
    throw new Error(`No benchmark targets found subject=${options.subject}`);
  }
  const warmupIterations = options.warmupIterations ?? 3;
  const iterations = options.iterations ?? 10;
  const sampleCount = options.samples ?? 7;
  const sampleDurationMs = options.sampleDurationMs ?? 20;
  const maxRetries = options.maxRetries ?? 1;
  const regressionTolerance = options.regressionTolerance ?? 0.2;
  const stabilityTolerance = options.stabilityTolerance ?? 0.1;
  const invalidInteger =
    !Number.isInteger(warmupIterations) ||
    !Number.isInteger(iterations) ||
    !Number.isInteger(sampleCount) ||
    !Number.isInteger(maxRetries) ||
    warmupIterations < 0 ||
    iterations < 1 ||
    sampleCount < 3 ||
    maxRetries < 0;
  if (invalidInteger || !Number.isFinite(sampleDurationMs) || sampleDurationMs <= 0) {
    options.server.kill();
    throw new Error('benchmark counts must be finite non-negative integers and sampleDurationMs must be positive');
  }
  if (!Number.isFinite(regressionTolerance) || regressionTolerance < 0) {
    options.server.kill();
    throw new Error('regressionTolerance must be non-negative');
  }
  if (!Number.isFinite(stabilityTolerance) || stabilityTolerance < 0) {
    options.server.kill();
    throw new Error('stabilityTolerance must be non-negative');
  }
  const ownsBrowser = options.browserSession === undefined;
  const launched =
    options.browserSession ??
    (await launchBrowser({ captureFrames: 0, verify: true }).catch((error: unknown) => {
      options.server.kill();
      throw error;
    }));
  const { browser, context } = launched;
  const calibration = await calibrateCaptureBrowser(context).catch(async (error: unknown) => {
    if (ownsBrowser) await browser.close().catch(() => {});
    options.server.kill();
    throw error;
  });
  const isAborted = installAbortHandler();
  const targets: CaptureBenchmarkTargetResult[] = [];

  try {
    // Serial by design. Parallel benchmark pages measure contention policy, not the target.
    for (const entry of entries) {
      for (const renderer of entry.renderers) {
        if (isAborted()) break;
        let target = await benchmarkTarget(context, options.server.url, options.subject, entry, renderer, {
          calibration,
          iterations,
          protocolVersion: CAPTURE_PROTOCOL_VERSION,
          sampleCount,
          sampleDurationMs,
          warmupIterations,
        });
        while (
          target.status === 'failed' &&
          target.retries < maxRetries &&
          /timeout|net::|target (?:page|closed)|has been closed|protocol error/i.test(target.error ?? '')
        ) {
          const retries = target.retries + 1;
          target = await benchmarkTarget(context, options.server.url, options.subject, entry, renderer, {
            calibration,
            iterations,
            protocolVersion: CAPTURE_PROTOCOL_VERSION,
            sampleCount,
            sampleDurationMs,
            warmupIterations,
          });
          target.retries = retries;
        }
        targets.push(target);
      }
      if (isAborted()) break;
      applyReferenceRatios(
        targets.filter((target) => target.entry === entry.name),
        options.reference,
      );
      applyBenchmarkBaseline({
        root,
        subject: options.subject,
        entry: entry.name,
        targets: targets.filter((target) => target.entry === entry.name),
        reference: options.reference,
        regressionTolerance,
        stabilityTolerance,
        update: options.updateBaselines ?? false,
      });
    }
  } finally {
    if (ownsBrowser) await browser.close().catch(() => {});
    options.server.kill();
  }

  for (const target of targets) printBenchmarkTarget(target);
  const failed = targets.filter((target) => target.status === 'failed').length;
  const passed = targets.filter((target) => target.status === 'passed').length;
  const skipped = targets.filter((target) => target.status === 'skipped').length;
  const updated = targets.filter((target) => target.status === 'updated').length;
  const reportPath =
    options.reportPath === false
      ? null
      : resolve(
          options.reportPath ?? root,
          ...(options.reportPath === undefined ? ['.artifacts', options.subject, 'benchmark-report.json'] : []),
        );
  const result: CaptureBenchmarkResult = {
    aborted: isAborted(),
    calibration,
    durationMs: round(performance.now() - startedAt),
    failed,
    passed,
    skipped,
    updated,
    shouldFail: failed > 0,
    targets,
    reportPath,
  };
  if (reportPath !== null) writeCaptureReport(reportPath, 'benchmark', result);
  return result;
}

function readBenchmarkBaseline(path: string): CaptureBenchmarkBaseline | null {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as CaptureBenchmarkBaseline;
    return value.version === CAPTURE_BENCHMARK_VERSION && typeof value.targets === 'object' ? value : null;
  } catch {
    return null;
  }
}

function writeBenchmarkBaseline(path: string, baseline: CaptureBenchmarkBaseline): void {
  mkdirSync(dirname(path), { recursive: true });
  const sorted: CaptureBenchmarkBaseline = {
    ...baseline,
    targets: Object.fromEntries(Object.entries(baseline.targets).sort(([a], [b]) => a.localeCompare(b))),
  };
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(sorted, null, 2)}\n`);
  renameSync(temporary, path);
}

function entryRoute(entry: Readonly<Entry>, renderer: string, subject: string): string {
  return (
    entry.routes?.[renderer] ??
    entry.route?.(renderer) ??
    `${subject === 'examples' ? 'examples' : 'tests'}/${entry.name}/${routeSegment(renderer)}/`
  );
}

function rendererBackend(renderer: string): string {
  return renderer.includes(':') ? renderer.slice(renderer.lastIndexOf(':') + 1) : renderer;
}

function percentile(sorted: readonly number[], quantile: number): number {
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower]! + ((sorted[lower + 1] ?? sorted[lower]!) - sorted[lower]!) * fraction;
}

function round(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

function mapStatistics(statistics: CaptureBenchmarkStatistics): CaptureBenchmarkStatistics {
  return Object.fromEntries(
    Object.entries(statistics).map(([key, value]) => [key, round(value)]),
  ) as unknown as CaptureBenchmarkStatistics;
}

function printBenchmarkTarget(target: Readonly<CaptureBenchmarkTargetResult>): void {
  const median = target.statistics === null ? 'n/a' : `${target.statistics.medianMs.toFixed(3)} ms`;
  const detail = target.change === null ? median : `${median}, ${(target.change * 100).toFixed(1)}%`;
  const label = `${target.entry}/${target.renderer}`;
  if (target.status === 'failed') console.log(pc.red(`✗ ${label} ${target.error ?? detail}`));
  else if (target.status === 'passed') console.log(pc.green(`✓ ${label} ${detail}`));
  else if (target.status === 'updated') console.log(pc.green(`+ ${label} baseline ${median}`));
  else console.log(pc.dim(`- ${label} ${target.error ?? detail}`));
}
