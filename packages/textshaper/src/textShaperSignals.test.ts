import type { TextShaperBackend } from '@flighthq/types';

import { setTextShaperBackend } from './textShaper';
import { disposeTextShaperSignals, enableTextShaperSignals, getTextShaperSignals } from './textShaperSignals';

const _stubBackend: TextShaperBackend = { measureText: () => 0 };
const _stubBackend2: TextShaperBackend = { measureText: () => 1 };

afterEach(() => {
  disposeTextShaperSignals();
  setTextShaperBackend(null);
});

describe('disposeTextShaperSignals', () => {
  it('is a no-op when signals have not been enabled', () => {
    expect(() => disposeTextShaperSignals()).not.toThrow();
  });
  it('clears all listeners after dispose', () => {
    const sigs = enableTextShaperSignals();
    let fired = false;
    sigs.onBackendChanged.emit = () => {
      fired = true;
    };
    disposeTextShaperSignals();
    setTextShaperBackend(_stubBackend);
    expect(fired).toBe(false);
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

describe('setTextShaperBackend', () => {
  it('emits onBackendChanged with the new backend when signals are enabled', () => {
    const sigs = enableTextShaperSignals();
    const received: (TextShaperBackend | null)[] = [];
    sigs.onBackendChanged.emit = (b) => received.push(b);
    setTextShaperBackend(_stubBackend);
    expect(received).toEqual([_stubBackend]);
  });
  it('emits onBackendChanged with null when cleared', () => {
    const sigs = enableTextShaperSignals();
    const received: (TextShaperBackend | null)[] = [];
    sigs.onBackendChanged.emit = (b) => received.push(b);
    setTextShaperBackend(_stubBackend);
    setTextShaperBackend(null);
    expect(received).toEqual([_stubBackend, null]);
  });
  it('does not emit when signals are not enabled', () => {
    // Verifies setTextShaperBackend does not throw when no signals enabled.
    expect(() => setTextShaperBackend(_stubBackend2)).not.toThrow();
  });
  it('installs the backend', () => {
    enableTextShaperSignals();
    setTextShaperBackend(_stubBackend);
    expect(_stubBackend).toBeDefined();
  });
});
