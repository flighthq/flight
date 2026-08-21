import { describe, expect, it } from 'vitest';

import { runGate, runGates } from './gateRunner';

// The grace fallback is the subject of half these cases, so they drive it with a short window rather
// than the two-second production floor. Still comfortably longer than the shells below take to fork.
const GRACE_MS = 200;

const node = (source: string) => ({ args: ['-e', source], command: process.execPath, label: 'node' });
const shell = (source: string) => ({ args: ['-c', source], command: 'sh', label: 'sh' });

describe('runGate', () => {
  it('reports a nonzero exit with both streams, its code, and no signal', async () => {
    const result = await runGate(node('console.log("out");console.error("err");process.exit(3)'), GRACE_MS);
    expect(result.passed).toBe(false);
    expect(result.code).toBe(3);
    expect(result.signal).toBeNull();
    expect(result.output).toContain('out');
    expect(result.output).toContain('err');
  });

  it('records the signal that killed a gate, so a kill does not read as a violation it found', async () => {
    // The shell signals ITSELF, so the test needs no handle on the child. No fork here, so the pipes
    // close with the process and this settles through the normal `close` path.
    const result = await runGate(shell('echo before; kill -9 $$'), GRACE_MS);
    expect(result.passed).toBe(false);
    expect(result.signal).toBe('SIGKILL');
    expect(result.output).toContain('before');
    expect(result.output).toContain('killed by SIGKILL');
    expect(result.output).toContain('it reported no violation');
  });

  it('settles a signal-killed gate whose forked child still holds the pipes', async () => {
    // ★ THE CASE THAT USED TO HANG FOREVER. The background `sleep` inherits stdout/stderr, so killing
    // the shell leaves the pipes open and `close` never fires — measured against this repo's own `tsx`,
    // which forks the same way, so this shape is every gate in check.ts. Racing against a timer asserts
    // WHICH settled rather than how long it took, so a slow machine cannot make it flaky.
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5_000));
    const outcome = await Promise.race([runGate(shell('echo started; sleep 30 & kill -9 $$'), GRACE_MS), timeout]);
    expect(outcome).not.toBe('timeout');
    const result = outcome as Awaited<ReturnType<typeof runGate>>;
    expect(result.passed).toBe(false);
    expect(result.signal).toBe('SIGKILL');
    expect(result.output).toContain('started');
  });

  it('settles a gate that exits cleanly but leaves a process holding the pipes, and still passes it', async () => {
    // Same missing `close`, no signal involved: the gate did its work and returned 0. The lingering
    // process is worth saying out loud, but it is not the gate's verdict.
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5_000));
    const outcome = await Promise.race([runGate(shell('echo done; sleep 30 & exit 0'), GRACE_MS), timeout]);
    expect(outcome).not.toBe('timeout');
    const result = outcome as Awaited<ReturnType<typeof runGate>>;
    expect(result.passed).toBe(true);
    expect(result.code).toBe(0);
    expect(result.output).toContain('done');
    expect(result.output).toContain('left a process holding its output pipes');
  });

  it('resolves a failed spawn instead of waiting for an exit that never comes', async () => {
    // ★ A PIN, NOT A REPAIR — this case already worked. A failed spawn emits `error` and `close` but
    // never `exit`, so a runner rewritten to listen only for `exit` would hang here. That is the whole
    // reason `close` survives as a resolver, and this is what would catch its removal.
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5_000));
    const outcome = await Promise.race([
      runGate({ args: [], command: 'flight-check-no-such-binary', label: 'missing' }, GRACE_MS),
      timeout,
    ]);
    expect(outcome).not.toBe('timeout');
    const result = outcome as Awaited<ReturnType<typeof runGate>>;
    expect(result.passed).toBe(false);
    expect(result.output).toContain('ENOENT');
  });
});

describe('runGates', () => {
  it('returns results in registration order and keeps each gate output to itself under concurrency', async () => {
    // Durations are inverted against registration order, so a runner that reported completion order
    // would produce the reverse of what this asserts. This pins the property the per-gate buffering
    // exists to provide, so a later change that streams output cannot trade it away unnoticed.
    const gates = [
      node('setTimeout(() => console.log("marker-a"), 120)'),
      node('setTimeout(() => console.log("marker-b"), 60)'),
      node('console.log("marker-c")'),
    ].map((gate, index) => ({ ...gate, label: `gate-${'abc'[index]}` }));

    const results = await runGates(gates, 3, GRACE_MS);

    expect(results.map((result) => result.label)).toEqual(['gate-a', 'gate-b', 'gate-c']);
    expect(results.every((result) => result.passed)).toBe(true);
    expect(results[0].output).toContain('marker-a');
    expect(results[0].output).not.toContain('marker-b');
    expect(results[1].output).toContain('marker-b');
    expect(results[1].output).not.toContain('marker-c');
    expect(results[2].output).toContain('marker-c');
    expect(results[2].output).not.toContain('marker-a');
  });

  it('runs every gate even when an earlier one fails', async () => {
    const results = await runGates([node('process.exit(1)'), node('console.log("still ran")')], 1, GRACE_MS);
    expect(results[0].passed).toBe(false);
    expect(results[1].passed).toBe(true);
    expect(results[1].output).toContain('still ran');
  });
});
