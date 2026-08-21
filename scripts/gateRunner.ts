// The gate child-process runner `scripts/check.ts` drives, extracted so that WHEN A GATE IS CONSIDERED
// FINISHED is testable at all. check.ts runs its gates at import, so nothing inside it could be reached
// from a test — the same reason `gateRegistry.ts` was carved out of that file ahead of this one.
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
}

/**
 * How long after `exit` to keep waiting for the pipes to close before settling without them.
 *
 * Long enough that a gate whose grandchild is mid-flush still delivers its tail, short enough that a
 * sweep hitting the fallback on every gate is not itself a stall. It is a parameter rather than a
 * constant only so tests can drive the fallback without spending seconds per case.
 */
export const GATE_PIPE_GRACE_MS = 2_000;

export async function runGate(gate: Gate, graceMs: number = GATE_PIPE_GRACE_MS): Promise<GateResult> {
  return await new Promise((resolve) => {
    const child = spawn(gate.command, gate.args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

    // One array in arrival order, so stdout and stderr stay interleaved the way the gate emitted them.
    const chunks: string[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

    let settled = false;
    let graceTimer: NodeJS.Timeout | null = null;

    const settle = (code: number | null, signal: NodeJS.Signals | null, pipesLeftOpen: boolean): void => {
      if (settled) return;
      settled = true;
      if (graceTimer !== null) clearTimeout(graceTimer);
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
        passed: code === 0,
        signal,
      });
    };

    // Destroying a stream above can emit `error` on it, and an unhandled `error` on a child stream
    // would take down the sweep in place of the result we already hold.
    child.stdout.on('error', () => {});
    child.stderr.on('error', () => {});
    child.on('error', (error) => chunks.push(`${error.message}\n`));
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
  graceMs: number = GATE_PIPE_GRACE_MS,
): Promise<GateResult[]> {
  const results = new Array<GateResult>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = next++;
        const gate = items[index];
        if (gate === undefined) return;
        results[index] = await runGate(gate, graceMs);
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
