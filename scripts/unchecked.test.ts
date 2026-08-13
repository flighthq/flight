import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { selectPackages } from './select';
import {
  describeElapsed,
  explainOverbroadSelection,
  getEscalationWidth,
  getSiblingTestPath,
  readMutantVerdict,
  terminateMutantWorker,
} from './unchecked';

describe('getEscalationWidth', () => {
  it('gives a small escalation set fewer workers than the machine offers', () => {
    // The measured inversion: each escalation worker runs the package's whole suite before it contributes,
    // so eight of them settling nineteen mutants cost 1m36s while eighty-eight sibling runs cost 23.5s.
    expect(getEscalationWidth(19, 8)).toBe(5);
    expect(getEscalationWidth(4, 8)).toBe(1);
    expect(getEscalationWidth(1, 8)).toBe(1);
  });

  it('never exceeds the pool it was given, however many mutants escalated', () => {
    expect(getEscalationWidth(400, 8)).toBe(8);
  });

  it('still yields a usable worker when nothing escalated', () => {
    // Guards the degenerate arm: `Math.ceil(0 / n)` is 0, and a concurrency of zero would hang the tier
    // rather than finish it instantly.
    expect(getEscalationWidth(0, 8)).toBe(1);
  });
});

describe('describeElapsed', () => {
  it('keeps sub-second work in milliseconds and longer work in seconds', () => {
    expect(describeElapsed(0)).toBe('0ms');
    expect(describeElapsed(999)).toBe('999ms');
    expect(describeElapsed(1000)).toBe('1.0s');
    expect(describeElapsed(59_400)).toBe('59.4s');
  });

  it('switches to minutes once seconds stop being readable at a glance', () => {
    expect(describeElapsed(60_000)).toBe('1m00s');
    expect(describeElapsed(125_000)).toBe('2m05s');
  });
});

describe('explainOverbroadSelection', () => {
  it('names the matched packages, not just how many there were', () => {
    const message = explainOverbroadSelection(['text'], ['text', 'textinput', 'textshaper']);
    expect(message).toContain('matches 3 packages');
    expect(message).toContain('textinput');
    expect(message).toContain('textshaper');
  });

  it('suggests the exactly-named package rather than the alphabetically first match', () => {
    const message = explainOverbroadSelection(['text'], ['bitmaptext', 'text', 'textinput']);
    expect(message).toContain('packages/text/src/');
    expect(message).not.toContain('packages/bitmaptext/src/');
  });

  it('falls back to the first match when no package is named exactly', () => {
    const message = explainOverbroadSelection(['scene'], ['scene2d', 'scene3d']);
    expect(message).toContain('packages/scene2d/src/');
  });

  it('summarizes the tail rather than printing every match of a very broad selector', () => {
    const packages = Array.from({ length: 20 }, (_, index) => `package${index}`);
    const message = explainOverbroadSelection(['e'], packages);
    expect(message).toContain('and 12 more');
    expect(message).not.toContain('package19');
  });

  it('fires on the real repository for a selector that reads like a single package', () => {
    // The guard's whole reason to exist, asserted against the live package list rather than a fixture: the
    // shared selector is a substring, so `text` — which IS a package name — also selects every package whose
    // name contains it. If this ever collapses to one, the fan-out is gone and so is the need for the guard.
    const matched = selectPackages(['text']);
    expect(matched).toContain('text');
    expect(matched.length).toBeGreaterThan(5);
    expect(selectPackages(['geometry'])).toEqual(['geometry']);
  });
});

describe('getSiblingTestPath', () => {
  it('names the colocated test file the repository convention guarantees', () => {
    expect(getSiblingTestPath('packages/geometry/src/matrix.ts')).toBe('packages/geometry/src/matrix.test.ts');
    expect(getSiblingTestPath('packages/scene2d/src/node2d.tsx')).toBe('packages/scene2d/src/node2d.test.tsx');
  });

  it('leaves a path with no TypeScript extension alone rather than inventing one', () => {
    expect(getSiblingTestPath('packages/geometry/src/matrix')).toBe('packages/geometry/src/matrix');
  });
});

describe('readMutantVerdict', () => {
  it('records a survivor only when the mutant was applied and every test still passed', () => {
    expect(readMutantVerdict({ applied: true, output: '', passed: true, timedOut: false })).toBe('survived');
  });

  it('records a kill when a test failed', () => {
    expect(readMutantVerdict({ applied: true, output: '', passed: false, timedOut: false })).toBe('killed');
  });

  it('refuses a verdict when the mutant was never applied, whatever the exit code', () => {
    // The instrument check, and the reason the load hook prints a marker at all. A run whose `load` hook
    // never fired tested UNMUTATED source and passed — by exit status alone that is identical to a killed
    // mutant, so a resolution mismatch anywhere in the harness would report as a package whose tests catch
    // everything. Both directions are asserted because only the passing one is dangerous.
    expect(readMutantVerdict({ applied: false, output: '', passed: true, timedOut: false })).toBe('unreached');
    expect(readMutantVerdict({ applied: false, output: '', passed: false, timedOut: false })).toBe('unreached');
  });

  it('counts an applied timeout as a kill, and an unapplied one as still unreached', () => {
    // A mutant that makes the code stop terminating — a loop bound moved past its exit — is one the tests
    // noticed, in the bluntest available way. Calling it a survivor would put an infinite loop on the list
    // of things nobody tests. But the marker is written at load time, before the module can run, so a hang
    // with no marker is the harness hanging short of the subject and is evidence about nothing.
    expect(readMutantVerdict({ applied: true, output: '', passed: false, timedOut: true })).toBe('killed');
    expect(readMutantVerdict({ applied: false, output: '', passed: false, timedOut: true })).toBe('unreached');
  });
});

describe('terminateMutantWorker', () => {
  afterEach(() => vi.useRealTimers());

  it('does not force a worker whose pipes close after SIGTERM', () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as ChildProcess;
    const signals: NodeJS.Signals[] = [];

    terminateMutantWorker(child, 25, (_target, signal) => {
      signals.push(signal);
      return true;
    });
    expect(signals).toEqual(['SIGTERM']);

    child.emit('close', 0, null);
    vi.advanceTimersByTime(25);
    expect(signals).toEqual(['SIGTERM']);
  });

  it('forces a worker that does not honor SIGTERM', () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as ChildProcess;
    const signals: NodeJS.Signals[] = [];

    terminateMutantWorker(child, 25, (_target, signal) => {
      signals.push(signal);
      return true;
    });
    vi.advanceTimersByTime(24);
    expect(signals).toEqual(['SIGTERM']);

    vi.advanceTimersByTime(1);
    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
  });
});
