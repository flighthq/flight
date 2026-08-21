// The gate child-process runner `scripts/check.ts` drives, extracted so the two things that can go
// wrong in it are testable at all: WHEN A GATE IS CONSIDERED FINISHED, and HOW ITS OUTPUT IS DECODED.
// check.ts runs its gates at import, so nothing inside it could be reached from a test — the same
// reason `gateRegistry.ts` was carved out of that file ahead of this one.
//
// ★ `close` IS NOT "THE CHILD DIED" — IT IS "EVERY PIPE CLOSED", AND FOR EVERY GATE HERE THOSE DIVERGE.
// A child that forks leaves its grandchildren holding the inherited stdout/stderr fds, so killing the
// child does not close the pipes and `close` never arrives. Measured on Node 22 / Linux against this
// repo's own `tsx` binary, which forks: SIGKILL to the gate produced `exit(null, SIGKILL)` and then no
// `close` at all, five seconds later or ever. Resolving only from `close` therefore never settled, the
// `Promise.all` in runGates never returned, and `npm run check` hung with ZERO output — not even from
// the gates that had already passed, because output is replayed only once every gate has resolved. The
// same shape occurs with no signal involved: a gate that exits 0 while leaving a background process
// holding the pipe measured `exit(0, null)` and then no `close`.
//
// So `exit` — which fires for any process that actually ran, and carries both code and signal — arms a
// grace timer, and whichever of the two lands first settles the gate. `close` stays the happy path, so
// a normal gate still delivers every byte it wrote; the timer is only the floor that makes a hang
// impossible.
//
// ★ `close` IS KEPT AS A RESOLVER, NOT REPLACED. A failed spawn emits `error` and `close` but never
// `exit` (measured: a missing binary gives `error(ENOENT)` then `close(-2)`), so a runner listening
// only to `exit` would reintroduce the hang for the one death this code already handled correctly.

import { spawn } from 'node:child_process';

import { CHECK_PROGRESS_TOKEN_ENV, RegistrarProgressDecoder } from './check-progress';
import type { RegistrarProgressRecord } from './check-progress';
import type { Gate } from './gateRegistry';

export interface GateResult extends Gate {
  /** The child's exit status, or null when a signal killed it or it never ran. */
  code: number | null;
  output: string;
  passed: boolean;
  /**
   * The signal that killed the child, or null. A gate that died on a signal reported no violation — it
   * was stopped — and without this the two are indistinguishable in a log that only says "failed".
   */
  signal: NodeJS.Signals | null;
  /** The operating-system error code when the command could not be spawned. */
  spawnErrorCode: string | null;
  /** The spawn error message, distinct from a gate that ran and reported a violation. */
  spawnErrorMessage: string | null;
}

export interface GateProgressOptions {
  gateLabel: string;
  onRecord: (record: RegistrarProgressRecord) => void;
  token: string;
}

export interface GateRunOptions {
  graceMs?: number;
  progress?: GateProgressOptions;
}

/**
 * How long after `exit` to keep waiting for the pipes to close before settling without them.
 *
 * Long enough that a gate whose grandchild is mid-flush still delivers its tail, short enough that a
 * sweep hitting the fallback on every gate is not itself a stall. It is a parameter rather than a
 * constant only so tests can drive the fallback without spending seconds per case.
 */
export const GATE_PIPE_GRACE_MS = 2_000;

export function formatGateFailure(result: GateResult): string {
  if (result.spawnErrorMessage !== null) {
    return `spawn error${result.spawnErrorCode === null ? '' : ` ${result.spawnErrorCode}`}: ${result.spawnErrorMessage}`;
  }
  if (result.signal !== null) return `signal ${result.signal}`;
  if (result.code !== null) return `exit code ${result.code}`;
  return 'no exit code or signal';
}

export async function runGate(
  gate: Gate,
  graceMsOrOptions: number | GateRunOptions = GATE_PIPE_GRACE_MS,
): Promise<GateResult> {
  return await new Promise((resolve) => {
    const options = typeof graceMsOrOptions === 'number' ? { graceMs: graceMsOrOptions } : graceMsOrOptions;
    const graceMs = options.graceMs ?? GATE_PIPE_GRACE_MS;
    const progress = options.progress?.gateLabel === gate.label ? options.progress : null;
    const child = spawn(gate.command, gate.args, {
      env:
        progress === null
          ? process.env
          : {
              ...process.env,
              [CHECK_PROGRESS_TOKEN_ENV]: progress.token,
            },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // ★ DECODE PER STREAM, NOT PER CHUNK. `chunk.toString()` decodes each Buffer independently, so a
    // UTF-8 sequence split across a chunk boundary is destroyed on both sides of the split. Measured:
    // 200 KB of `✓★—` arrived in 13 chunks, and per-chunk decoding introduced 22 U+FFFD replacement
    // characters. `setEncoding` puts a StringDecoder on the stream, which holds a partial sequence back
    // until its remaining bytes arrive. Decoding per stream rather than concatenating both buffers at
    // the end also keeps a stdout chunk from being spliced into the middle of a half-written stderr
    // character. This matters here specifically because gate output is dense with `✓ ✗ ★ ▶ — ·`, and a
    // mangled glyph in a diagnostic reads as a font problem rather than as data loss.
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    // One array in arrival order, so stdout and stderr stay interleaved the way the gate emitted them.
    const chunks: string[] = [];
    const progressDecoder = progress === null ? null : new RegistrarProgressDecoder(progress.token);
    child.stdout.on('data', (chunk: string) => chunks.push(chunk));
    child.stderr.on('data', (chunk: string) => {
      if (progressDecoder === null || progress === null) {
        chunks.push(chunk);
        return;
      }
      const decoded = progressDecoder.push(chunk);
      if (decoded.ordinary.length > 0) chunks.push(decoded.ordinary);
      for (const record of decoded.records) progress.onRecord(record);
    });

    let settled = false;
    let graceTimer: NodeJS.Timeout | null = null;
    let spawnErrorCode: string | null = null;
    let spawnErrorMessage: string | null = null;

    const settle = (code: number | null, signal: NodeJS.Signals | null, pipesLeftOpen: boolean): void => {
      if (settled) return;
      settled = true;
      if (graceTimer !== null) clearTimeout(graceTimer);
      const pendingProgress = progressDecoder?.finish() ?? '';
      if (pendingProgress.length > 0) chunks.push(pendingProgress);
      if (pipesLeftOpen) {
        // Release the pipes we have stopped reading. A surviving grandchild holds the write ends, so
        // leaving the read ends attached keeps them as active handles on this process — which would
        // turn the hang this runner exists to prevent into a hang at the very end of the sweep, after
        // the last gate has been reported.
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
      }
      resolve({
        ...gate,
        code,
        output: chunks.join('') + explainGateDeath(code, signal, pipesLeftOpen, graceMs),
        passed: code === 0 && signal === null && spawnErrorMessage === null,
        signal,
        spawnErrorCode,
        spawnErrorMessage,
      });
    };

    // Destroying a stream above can emit `error` on it, and an unhandled `error` on a child stream
    // would take down the sweep in place of the result we already hold.
    child.stdout.on('error', () => {});
    child.stderr.on('error', () => {});
    child.on('error', (error: NodeJS.ErrnoException) => {
      spawnErrorCode = error.code ?? null;
      spawnErrorMessage = error.message;
      chunks.push(`${error.message}\n`);
    });
    child.on('exit', (code, signal) => {
      graceTimer = setTimeout(() => settle(code, signal, true), graceMs);
      // While pipes are still open they keep the loop alive on their own, so the timer will fire; it
      // must not be the handle that keeps the process running after every gate has settled.
      graceTimer.unref();
    });
    child.on('close', (code, signal) => settle(code, signal, false));
  });
}

export async function runGates(
  items: readonly Gate[],
  limit: number,
  graceMsOrOptions: number | GateRunOptions = GATE_PIPE_GRACE_MS,
): Promise<GateResult[]> {
  const results = new Array<GateResult>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = next++;
        const gate = items[index];
        if (gate === undefined) return;
        results[index] = await runGate(gate, graceMsOrOptions);
      }
    }),
  );
  return results;
}

// A gate that was killed, or one whose output pipes outlived it, produced a result the summary line
// cannot explain on its own: "failed" reads as a violation the gate found. Say which it was, in the
// gate's own replayed output, where the reader is already looking.
function explainGateDeath(
  code: number | null,
  signal: NodeJS.Signals | null,
  pipesLeftOpen: boolean,
  graceMs: number,
): string {
  if (signal !== null) {
    return `\nthis gate was killed by ${signal} — it reported no violation, it was stopped before it could finish\n`;
  }
  if (pipesLeftOpen) {
    return `\nthis gate exited ${code ?? 'without a status'} but left a process holding its output pipes; settled after ${graceMs}ms rather than waiting for them to close\n`;
  }
  return '';
}
