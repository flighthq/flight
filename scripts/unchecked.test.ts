import { selectPackages } from './select';
import { explainOverbroadSelection, getSiblingTestPath, readMutantVerdict } from './unchecked';

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
