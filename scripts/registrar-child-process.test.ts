import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  diagnoseRegistrarChildProcess,
  formatRegistrarChildFailure,
  summarizeRegistrarProbeDurations,
} from './registrar-child-process';

const IDENTITY = { packageName: 'fixture', registrar: 'registerFixture' };

describe('registrar child process diagnostics', () => {
  it('distinguishes an ordinary nonzero exit', () => {
    const diagnostic = runDiagnostic('process.exit(7)');

    expect(diagnostic).toMatchObject({ failureKind: 'exit', signal: null, status: 7, timedOut: false });
  });

  it('distinguishes a signal without claiming whether it was OOM or an external kill', () => {
    const diagnostic = runDiagnostic(`process.kill(process.pid, 'SIGKILL')`);

    expect(diagnostic).toMatchObject({ failureKind: 'signal', signal: 'SIGKILL', status: null, timedOut: false });
  });

  it('distinguishes a real spawn timeout', () => {
    const diagnostic = runDiagnostic('setInterval(() => {}, 1000)', { timeout: 50 });

    expect(diagnostic).toMatchObject({
      errorCode: 'ETIMEDOUT',
      failureKind: 'timeout',
      signal: 'SIGTERM',
      status: null,
      timedOut: true,
    });
  });

  it('distinguishes a real maxBuffer overflow and retains output byte counts', () => {
    const diagnostic = runDiagnostic(`process.stdout.write('x'.repeat(4096))`, { maxBuffer: 128 });

    expect(diagnostic).toMatchObject({
      errorCode: 'ENOBUFS',
      failureKind: 'max-buffer',
      maxBufferExceeded: true,
      status: null,
      stdoutBytes: 4096,
      timedOut: false,
    });
  });

  it('distinguishes a real spawn error even when no output streams exist', () => {
    const startedAt = performance.now();
    const result = spawnSync('__flight_missing_registrar_child__', [], { encoding: 'utf8' });
    const diagnostic = diagnoseRegistrarChildProcess(IDENTITY, performance.now() - startedAt, result);

    expect(diagnostic).toMatchObject({
      errorCode: 'ENOENT',
      failureKind: 'spawn-error',
      status: null,
      stderrBytes: 0,
      stdoutBytes: 0,
    });
  });

  it('formats every requested failure field with registrar identity', () => {
    const diagnostic = runDiagnostic(`process.stderr.write('fixture detail'); process.exit(3)`);
    const formatted = formatRegistrarChildFailure(diagnostic, 'fixture detail');

    expect(formatted).toContain('fixture:registerFixture');
    for (const field of [
      'failure=exit',
      'elapsedMs=',
      'status=3',
      'signal=none',
      'errorCode=none',
      'errorMessage=none',
      'timeout=false',
      'maxBufferExceeded=false',
      'stdoutBytes=0',
      'stderrBytes=14',
      'stderrExcerpt="fixture detail"',
    ]) {
      expect(formatted).toContain(field);
    }
  });

  it('summarizes the distribution and names the slowest registrars', () => {
    const summary = summarizeRegistrarProbeDurations(
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((durationMs, index) => ({
        durationMs,
        isolation: 'fresh-state' as const,
        packageName: 'fixture',
        registrar: `register${index}`,
      })),
    );

    expect(summary).toMatchObject({ count: 10, maxMs: 100, p50Ms: 50, p95Ms: 100, p99Ms: 100 });
    expect(summary.slowest.map((entry) => entry.durationMs)).toEqual([100, 90, 80, 70, 60]);
  });
});

function runDiagnostic(source: string, options: { maxBuffer?: number; timeout?: number } = {}) {
  const startedAt = performance.now();
  const result = spawnSync(process.execPath, ['-e', source], { encoding: 'utf8', ...options });
  return diagnoseRegistrarChildProcess(IDENTITY, performance.now() - startedAt, result);
}
