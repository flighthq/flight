import type { HostTextShaperProvider, ShapedRun } from '@flighthq/types/contract';

import { setTextShaperBackend } from './textShaper';
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

afterEach(() => {
  setTextShaperBackend(null);
});

describe('clearTextShaperCache', () => {
  it('removes all cached entries', () => {
    const tracker = _makeCountingBackend();
    setTextShaperBackend(tracker.backend);
    const cache = createTextShaperCache();
    shapeTextRunCached(cache, 'hi', {});
    shapeTextRunCached(cache, 'hi', {});
    expect(tracker.calls).toBe(1);
    clearTextShaperCache(cache);
    shapeTextRunCached(cache, 'hi', {});
    expect(tracker.calls).toBe(2);
  });

  it('cache remains usable after clearing', () => {
    const { backend } = _makeCountingBackend();
    setTextShaperBackend(backend);
    const cache = createTextShaperCache();
    shapeTextRunCached(cache, 'hi', {});
    clearTextShaperCache(cache);
    expect(shapeTextRunCached(cache, 'hi', {})).not.toBeNull();
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
    setTextShaperBackend(tracker.backend);
    const cache = createTextShaperCache();
    shapeTextRunCached(cache, 'hi', {});
    disposeTextShaperCache(cache);
    expect(shapeTextRunCached(cache, 'hi', {})).toBeNull();
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

function _hostWithAdvance(advanceWidth: number): { readonly text: { readonly shaper: HostTextShaperProvider } } {
  return {
    text: {
      shaper: {
        measureText: () => advanceWidth,
        shapeRun: () => ({ ..._stubRun, advanceWidth }),
      },
    },
  };
}
describe('shapeTextRunCached', () => {
  it('keeps cache entries isolated when callers interleave explicit hosts', () => {
    const cache = createTextShaperCache();
    const first = _hostWithAdvance(1);
    const second = _hostWithAdvance(2);
    expect(shapeTextRunCached(cache, 'hi', {}, undefined, first.text.shaper)?.advanceWidth).toBe(1);
    expect(shapeTextRunCached(cache, 'hi', {}, undefined, second.text.shaper)?.advanceWidth).toBe(2);
    expect(shapeTextRunCached(cache, 'hi', {}, undefined, first.text.shaper)?.advanceWidth).toBe(1);
  });

  it('returns null when no backend is set', () => {
    const cache = createTextShaperCache();
    expect(shapeTextRunCached(cache, 'hi', {})).toBeNull();
  });

  it('returns null when the backend is advances-only', () => {
    setTextShaperBackend({ measureText: (t) => t.length });
    const cache = createTextShaperCache();
    expect(shapeTextRunCached(cache, 'hi', {})).toBeNull();
  });

  it('returns a ShapedRun on success', () => {
    const { backend } = _makeCountingBackend();
    setTextShaperBackend(backend);
    const cache = createTextShaperCache();
    const run = shapeTextRunCached(cache, 'hi', {});
    expect(run).not.toBeNull();
    expect(run!.glyphCount).toBe(2);
  });

  it('returns the same object on the second call (cache hit)', () => {
    const { backend } = _makeCountingBackend();
    setTextShaperBackend(backend);
    const cache = createTextShaperCache();
    const r1 = shapeTextRunCached(cache, 'hi', {});
    const r2 = shapeTextRunCached(cache, 'hi', {});
    expect(r1).toBe(r2);
  });

  it('calls the backend once for repeated identical inputs', () => {
    const tracker = _makeCountingBackend();
    setTextShaperBackend(tracker.backend);
    const cache = createTextShaperCache();
    shapeTextRunCached(cache, 'hi', {});
    shapeTextRunCached(cache, 'hi', {});
    expect(tracker.calls).toBe(1);
  });

  it('calls the backend again for different text', () => {
    const tracker = _makeCountingBackend();
    setTextShaperBackend(tracker.backend);
    const cache = createTextShaperCache();
    shapeTextRunCached(cache, 'hi', {});
    shapeTextRunCached(cache, 'bye', {});
    expect(tracker.calls).toBe(2);
  });

  it('calls the backend again for different format', () => {
    const tracker = _makeCountingBackend();
    setTextShaperBackend(tracker.backend);
    const cache = createTextShaperCache();
    shapeTextRunCached(cache, 'hi', { size: 12 });
    shapeTextRunCached(cache, 'hi', { size: 16 });
    expect(tracker.calls).toBe(2);
  });

  it('calls the backend again for different options direction', () => {
    const tracker = _makeCountingBackend();
    setTextShaperBackend(tracker.backend);
    const cache = createTextShaperCache();
    shapeTextRunCached(cache, 'hi', {}, { direction: 'LeftToRight' });
    shapeTextRunCached(cache, 'hi', {}, { direction: 'RightToLeft' });
    expect(tracker.calls).toBe(2);
  });

  it('does not cache null results (no backend)', () => {
    const cache = createTextShaperCache();
    // First call: no backend, returns null, should not be cached.
    expect(shapeTextRunCached(cache, 'hi', {})).toBeNull();
    // Install a backend; now the same call should succeed.
    const tracker = _makeCountingBackend();
    setTextShaperBackend(tracker.backend);
    expect(shapeTextRunCached(cache, 'hi', {})).not.toBeNull();
    expect(tracker.calls).toBe(1);
  });
});
