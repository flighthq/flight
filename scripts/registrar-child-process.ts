export type RegistrarChildFailureKind = 'exit' | 'max-buffer' | 'none' | 'signal' | 'spawn-error' | 'timeout';

export interface RegistrarChildIdentity {
  packageName: string;
  registrar: string;
}

export interface RegistrarChildProcessDiagnostic extends RegistrarChildIdentity {
  elapsedMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  failureKind: RegistrarChildFailureKind;
  maxBufferExceeded: boolean;
  signal: NodeJS.Signals | null;
  status: number | null;
  stderrBytes: number;
  stdoutBytes: number;
  timedOut: boolean;
}

export interface RegistrarChildProcessResult {
  error?: Error;
  signal: NodeJS.Signals | null;
  status: number | null;
  stderr: string | null | undefined;
  stdout: string | null | undefined;
}

export interface RegistrarProbeDuration extends RegistrarChildIdentity {
  durationMs: number;
  isolation: 'fresh-process-module-instance' | 'fresh-state';
}

export interface RegistrarProbeDurationSummary {
  count: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  slowest: readonly RegistrarProbeDuration[];
}

export function diagnoseRegistrarChildProcess(
  identity: RegistrarChildIdentity,
  elapsedMs: number,
  result: RegistrarChildProcessResult,
): RegistrarChildProcessDiagnostic {
  const error = result.error as NodeJS.ErrnoException | undefined;
  const errorCode = error?.code ?? null;
  const timedOut = errorCode === 'ETIMEDOUT';
  const maxBufferExceeded = errorCode === 'ENOBUFS';
  return {
    ...identity,
    elapsedMs: roundMilliseconds(elapsedMs),
    errorCode,
    errorMessage: error?.message ?? null,
    failureKind: timedOut
      ? 'timeout'
      : maxBufferExceeded
        ? 'max-buffer'
        : result.signal !== null
          ? 'signal'
          : result.status !== null && result.status !== 0
            ? 'exit'
            : error === undefined
              ? 'none'
              : 'spawn-error',
    maxBufferExceeded,
    signal: result.signal,
    status: result.status,
    stderrBytes: Buffer.byteLength(result.stderr ?? ''),
    stdoutBytes: Buffer.byteLength(result.stdout ?? ''),
    timedOut,
  };
}

export function formatRegistrarChildFailure(
  diagnostic: RegistrarChildProcessDiagnostic,
  stderr: string | null | undefined,
): string {
  const stderrExcerpt = formatOutputExcerpt(stderr ?? '');
  return [
    `registrar child ${diagnostic.packageName}:${diagnostic.registrar} failed`,
    `failure=${diagnostic.failureKind}`,
    `elapsedMs=${diagnostic.elapsedMs}`,
    `status=${diagnostic.status ?? 'none'}`,
    `signal=${diagnostic.signal ?? 'none'}`,
    `errorCode=${diagnostic.errorCode ?? 'none'}`,
    `errorMessage=${diagnostic.errorMessage === null ? 'none' : JSON.stringify(diagnostic.errorMessage)}`,
    `timeout=${diagnostic.timedOut}`,
    `maxBufferExceeded=${diagnostic.maxBufferExceeded}`,
    `stdoutBytes=${diagnostic.stdoutBytes}`,
    `stderrBytes=${diagnostic.stderrBytes}`,
    ...(stderrExcerpt === null ? [] : [`stderrExcerpt=${JSON.stringify(stderrExcerpt)}`]),
  ].join('; ');
}

export function summarizeRegistrarProbeDurations(
  durations: readonly RegistrarProbeDuration[],
): RegistrarProbeDurationSummary {
  if (durations.length === 0) return { count: 0, maxMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, slowest: [] };
  const ordered = [...durations].sort(
    (a, b) =>
      a.durationMs - b.durationMs ||
      a.packageName.localeCompare(b.packageName) ||
      a.registrar.localeCompare(b.registrar),
  );
  const atPercentile = (percentile: number): number =>
    ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * percentile) - 1)]!.durationMs;
  return {
    count: ordered.length,
    maxMs: roundMilliseconds(ordered.at(-1)!.durationMs),
    p50Ms: roundMilliseconds(atPercentile(0.5)),
    p95Ms: roundMilliseconds(atPercentile(0.95)),
    p99Ms: roundMilliseconds(atPercentile(0.99)),
    slowest: ordered.slice(-5).reverse(),
  };
}

function formatOutputExcerpt(output: string): string | null {
  const trimmed = output.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length <= 512 ? trimmed : `${trimmed.slice(0, 512)}…`;
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
