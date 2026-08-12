import { getSiblingTestPath, readMutantVerdict } from './unchecked';

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
