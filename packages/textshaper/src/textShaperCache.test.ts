import type { HostTextShaperProvider, ShapedRun } from '@flighthq/types/contract';

import {
  clearTextShaperCache,
  createTextShaperCache,
  disposeTextShaperCache,
  initializeTextShaperCache,
  shapeTextRunCached,
} from './textShaperCache';

const _stubRun: ShapedRun = {
  advanceWidth: 15,
  direction: 'LeftToRight',
  font: null,
  glyphCount: 2,
  glyphs: [],
  script: 'Latn',
};

function _makeCountingBackend(): { backend: HostTextShaperProvider; readonly calls: number } {
  let calls = 0;
  return {
    backend: {
      measureText: () => 0,
      shapeRun: () => {
        calls++;
        return { ..._stubRun };
      },
    },
    get calls() {
      return calls;
    },
  };
}

const _advancesOnly: HostTextShaperProvider = { measureText: (t) => t.length };

describe('clearTextShaperCache', () => {
  it('removes all cached entries', () => {
    const tracker = _makeCountingBackend();
    const cache = createTextShaperCache();
    shapeTextRunCached(tracker.backend, cache, 'hi', {});
    shapeTextRunCached(tracker.backend, cache, 'hi', {});
    expect(tracker.calls).toBe(1);
    clearTextShaperCache(cache);
    shapeTextRunCached(tracker.backend, cache, 'hi', {});
    expect(tracker.calls).toBe(2);
  });

  it('cache remains usable after clearing', () => {
    const { backend } = _makeCountingBackend();
    const cache = createTextShaperCache();
    shapeTextRunCached(backend, cache, 'hi', {});
    clearTextShaperCache(cache);
    expect(shapeTextRunCached(backend, cache, 'hi', {})).not.toBeNull();
  });
});

describe('createTextShaperCache', () => {
  it('allocates a new cache on each call', () => {
    expect(createTextShaperCache()).not.toBe(createTextShaperCache());
  });
});

describe('disposeTextShaperCache', () => {
  it('makes the cache unusable without calling the backend again', () => {
    const tracker = _makeCountingBackend();
    const cache = createTextShaperCache();
    shapeTextRunCached(tracker.backend, cache, 'hi', {});
    disposeTextShaperCache(cache);
    expect(shapeTextRunCached(tracker.backend, cache, 'hi', {})).toBeNull();
    expect(tracker.calls).toBe(1);
  });

  it('is idempotent', () => {
    const cache = createTextShaperCache();
    disposeTextShaperCache(cache);
    expect(() => disposeTextShaperCache(cache)).not.toThrow();
  });
});

describe('initializeTextShaperCache', () => {
  it('is the construction initializer of createTextShaperCache', () => {
    expect(typeof initializeTextShaperCache).toBe('function');
  });
});

describe('shapeTextRunCached', () => {
  it('keeps cache entries isolated when callers interleave different hosts', () => {
    const cache = createTextShaperCache();
    const first: HostTextShaperProvider = {
      measureText: () => 1,
      shapeRun: () => ({ ..._stubRun, advanceWidth: 1 }),
    };
    const second: HostTextShaperProvider = {
      measureText: () => 2,
      shapeRun: () => ({ ..._stubRun, advanceWidth: 2 }),
    };
    expect(shapeTextRunCached(first, cache, 'hi', {})?.advanceWidth).toBe(1);
    expect(shapeTextRunCached(second, cache, 'hi', {})?.advanceWidth).toBe(2);
    expect(shapeTextRunCached(first, cache, 'hi', {})?.advanceWidth).toBe(1);
  });

  it('returns null when the backend is advances-only', () => {
    const cache = createTextShaperCache();
    expect(shapeTextRunCached(_advancesOnly, cache, 'hi', {})).toBeNull();
  });

  it('returns a ShapedRun on success', () => {
    const { backend } = _makeCountingBackend();
    const cache = createTextShaperCache();
    const run = shapeTextRunCached(backend, cache, 'hi', {});
    expect(run).not.toBeNull();
    expect(run!.glyphCount).toBe(2);
  });

  it('returns the same object on the second call (cache hit)', () => {
    const { backend } = _makeCountingBackend();
    const cache = createTextShaperCache();
    const r1 = shapeTextRunCached(backend, cache, 'hi', {});
    const r2 = shapeTextRunCached(backend, cache, 'hi', {});
    expect(r1).toBe(r2);
  });

  it('calls the backend once for repeated identical inputs', () => {
    const tracker = _makeCountingBackend();
    const cache = createTextShaperCache();
    shapeTextRunCached(tracker.backend, cache, 'hi', {});
    shapeTextRunCached(tracker.backend, cache, 'hi', {});
    expect(tracker.calls).toBe(1);
  });

  it('calls the backend again for different text', () => {
    const tracker = _makeCountingBackend();
    const cache = createTextShaperCache();
    shapeTextRunCached(tracker.backend, cache, 'hi', {});
    shapeTextRunCached(tracker.backend, cache, 'bye', {});
    expect(tracker.calls).toBe(2);
  });

  it('calls the backend again for different format', () => {
    const tracker = _makeCountingBackend();
    const cache = createTextShaperCache();
    shapeTextRunCached(tracker.backend, cache, 'hi', { size: 12 });
    shapeTextRunCached(tracker.backend, cache, 'hi', { size: 16 });
    expect(tracker.calls).toBe(2);
  });

  it('calls the backend again for different options direction', () => {
    const tracker = _makeCountingBackend();
    const cache = createTextShaperCache();
    shapeTextRunCached(tracker.backend, cache, 'hi', {}, { direction: 'LeftToRight' });
    shapeTextRunCached(tracker.backend, cache, 'hi', {}, { direction: 'RightToLeft' });
    expect(tracker.calls).toBe(2);
  });

  it('does not cache null results (advances-only backend)', () => {
    const cache = createTextShaperCache();
    expect(shapeTextRunCached(_advancesOnly, cache, 'hi', {})).toBeNull();
    const tracker = _makeCountingBackend();
    expect(shapeTextRunCached(tracker.backend, cache, 'hi', {})).not.toBeNull();
    expect(tracker.calls).toBe(1);
  });
});
