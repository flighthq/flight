import {
  disposeTextShaperSignals,
  enableTextShaperSignals,
  getTextShaperSignals,
  initializeTextShaperSignals,
} from './textShaperSignals';

afterEach(() => {
  disposeTextShaperSignals();
});

describe('disposeTextShaperSignals', () => {
  it('is a no-op when signals have not been enabled', () => {
    expect(() => disposeTextShaperSignals()).not.toThrow();
  });
  it('getTextShaperSignals returns null after dispose', () => {
    enableTextShaperSignals();
    disposeTextShaperSignals();
    expect(getTextShaperSignals()).toBeNull();
  });
});

describe('enableTextShaperSignals', () => {
  it('returns a TextShaperSignals entity with onBackendChanged', () => {
    const sigs = enableTextShaperSignals();
    expect(sigs).not.toBeNull();
    expect(typeof sigs.onBackendChanged).toBe('object');
    expect(typeof sigs.onBackendChanged.emit).toBe('function');
  });
  it('is idempotent: returns the same entity on repeat calls', () => {
    const s1 = enableTextShaperSignals();
    const s2 = enableTextShaperSignals();
    expect(s1).toBe(s2);
  });
});

describe('getTextShaperSignals', () => {
  it('returns null before signals are enabled', () => {
    expect(getTextShaperSignals()).toBeNull();
  });
  it('returns the active signals entity after enabling', () => {
    const sigs = enableTextShaperSignals();
    expect(getTextShaperSignals()).toBe(sigs);
  });
});

describe('initializeTextShaperSignals', () => {
  it('is the construction initializer of createTextShaperSignals', () => {
    expect(typeof initializeTextShaperSignals).toBe('function');
  });
});
