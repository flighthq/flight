import type { ShapedRun, TextShaperBackend } from '@flighthq/types';

import { setTextShaperBackend } from './textShaper';
import {
  clearTextShaperCache,
  createTextShaperCache,
  disposeTextShaperCache,
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

function _makeCountingBackend(): { backend: TextShaperBackend; readonly calls: number } {
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
    const { backend } = _makeCountingBackend();
    setTextShaperBackend(backend);
    const cache = createTextShaperCache();
    shapeTextRunCached(cache, 'hi', {});
    expect(cache._entries.size).toBe(1);
    clearTextShaperCache(cache);
    expect(cache._entries.size).toBe(0);
  });

  it('cache remains usable after clearing', () => {
    const { backend } = _makeCountingBackend();
    setTextShaperBackend(backend);
    const cache = createTextShaperCache();
    shapeTextRunCached(cache, 'hi', {});
    clearTextShaperCache(cache);
    shapeTextRunCached(cache, 'hi', {});
    expect(cache._entries.size).toBe(1);
  });
});

describe('createTextShaperCache', () => {
  it('returns an empty cache', () => {
    const cache = createTextShaperCache();
    expect(cache._entries.size).toBe(0);
  });

  it('allocates a new cache on each call', () => {
    expect(createTextShaperCache()).not.toBe(createTextShaperCache());
  });
});

describe('disposeTextShaperCache', () => {
  it('clears all entries', () => {
    const { backend } = _makeCountingBackend();
    setTextShaperBackend(backend);
    const cache = createTextShaperCache();
    shapeTextRunCached(cache, 'hi', {});
    disposeTextShaperCache(cache);
    expect(cache._entries.size).toBe(0);
  });
});

describe('shapeTextRunCached', () => {
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
    expect(cache._entries.size).toBe(0);
    // Install a backend; now the same call should succeed.
    const { backend } = _makeCountingBackend();
    setTextShaperBackend(backend);
    expect(shapeTextRunCached(cache, 'hi', {})).not.toBeNull();
    expect(cache._entries.size).toBe(1);
  });
});
