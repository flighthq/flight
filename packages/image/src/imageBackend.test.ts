import type { ImageResource, ImageBackend } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createWebImageBackend,
  explainImageOperation,
  getImageBackend,
  hasImageOperation,
  setImageBackend,
  explainImageBackend,
  installImageHostBackend,
  observeImageHostResult,
  resetImageBackendForTest,
} from './imageBackend';
import { loadImageResourceFromUrl } from './imageResourceFrom';

// Every test that installs a backend must put it back, or a later test sees a stale one.
afterEach(() => setImageBackend(null));

function recordingBackend(): { backend: ImageBackend; calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    backend: {
      [EntityRuntimeKey]: undefined,
      loadImageFromUrl(url, crossOrigin, signal): Promise<ImageResource> {
        calls.push([url, crossOrigin, signal]);
        return Promise.resolve({} as ImageResource);
      },
    },
    calls,
  };
}

describe('createWebImageBackend', () => {
  it('builds a backend without touching the DOM until it is called', () => {
    // Constructing must not decode anything; the DOM work belongs inside `loadImageFromUrl`.
    const backend = createWebImageBackend();
    expect(typeof backend.createImageFromBitmap).toBe('function');
    expect(typeof backend.loadImageFromUrl).toBe('function');
  });

  it('builds a fresh backend each call rather than a shared singleton', () => {
    expect(createWebImageBackend()).not.toBe(createWebImageBackend());
  });
});

describe('explainImageBackend', () => {
  afterEach(() => resetImageBackendForTest());

  it('reports host-not-enabled when no backend is installed', () => {
    resetImageBackendForTest();
    const explanation = explainImageBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setImageBackend(getImageBackend());
    expect(explainImageBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installImageHostBackend(getImageBackend());
    expect(explainImageBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installImageHostBackend({ ...getImageBackend() });
    installImageHostBackend({ ...getImageBackend() });
    expect(explainImageBackend().conflict).toBe(true);
  });
});

describe('explainImageOperation', () => {
  afterEach(() => resetImageBackendForTest());

  it('reports host support and respects a partial custom backend masking it', () => {
    installImageHostBackend(createWebImageBackend());
    expect(explainImageOperation('createImageFromBitmap')).toEqual({
      implemented: true,
      layer: 'host',
      operation: 'createImageFromBitmap',
    });

    setImageBackend({ [EntityRuntimeKey]: undefined, loadImageFromUrl: vi.fn() });
    expect(explainImageOperation('createImageFromBitmap')).toEqual({
      implemented: false,
      layer: 'none',
      operation: 'createImageFromBitmap',
    });
  });

  it('reports the unsupported Bitmap operation without claiming URL loading is absent', () => {
    const backend: ImageBackend = { [EntityRuntimeKey]: undefined, loadImageFromUrl: vi.fn() };
    setImageBackend(backend);

    expect(explainImageOperation('createImageFromBitmap')).toEqual({
      implemented: false,
      layer: 'none',
      operation: 'createImageFromBitmap',
    });
    expect(explainImageOperation('loadImageFromUrl')).toEqual({
      implemented: true,
      layer: 'custom',
      operation: 'loadImageFromUrl',
    });
  });

  it('reports no installed implementation without counting sentinel behavior as support', () => {
    resetImageBackendForTest();
    expect(explainImageOperation('createImageFromBitmap')).toEqual({
      implemented: false,
      layer: 'none',
      operation: 'createImageFromBitmap',
    });
    expect(explainImageOperation('loadImageFromUrl')).toEqual({
      implemented: false,
      layer: 'sentinel',
      operation: 'loadImageFromUrl',
    });
  });
});

describe('getImageBackend', () => {
  it('defaults lazily to a web backend rather than being registered at import', () => {
    expect(typeof getImageBackend().loadImageFromUrl).toBe('function');
  });

  it('caches the lazy default so repeated calls do not rebuild it', () => {
    expect(getImageBackend()).toBe(getImageBackend());
  });

  it('returns the installed backend once one is set', () => {
    const { backend } = recordingBackend();
    setImageBackend(backend);
    expect(getImageBackend()).toBe(backend);
  });
});

describe('hasImageOperation', () => {
  afterEach(() => resetImageBackendForTest());

  it('cannot diverge from the operation explanation across absent and partial backends', () => {
    for (const operation of ['createImageFromBitmap', 'loadImageFromUrl'] as const) {
      expect(hasImageOperation(operation)).toBe(explainImageOperation(operation).implemented);
    }

    setImageBackend({ [EntityRuntimeKey]: undefined, loadImageFromUrl: vi.fn() });
    for (const operation of ['createImageFromBitmap', 'loadImageFromUrl'] as const) {
      expect(hasImageOperation(operation)).toBe(explainImageOperation(operation).implemented);
    }

    setImageBackend(createWebImageBackend());
    for (const operation of ['createImageFromBitmap', 'loadImageFromUrl'] as const) {
      expect(hasImageOperation(operation)).toBe(explainImageOperation(operation).implemented);
      expect(hasImageOperation(operation)).toBe(true);
    }
  });
});

describe('installImageHostBackend', () => {
  afterEach(() => resetImageBackendForTest());

  it('installs a host backend that getImageBackend returns', () => {
    const backend = getImageBackend();
    installImageHostBackend(backend);
    expect(getImageBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = { ...getImageBackend() };
    const second = { ...getImageBackend() };
    installImageHostBackend(first);
    installImageHostBackend(second);
    expect(getImageBackend()).toBe(first);
    expect(explainImageBackend().conflict).toBe(true);
  });
});

describe('observeImageHostResult', () => {
  afterEach(() => resetImageBackendForTest());

  it('records a successful observation', () => {
    installImageHostBackend(getImageBackend());
    observeImageHostResult('loadImageFromUrl', true);
    const explanation = explainImageBackend();
    expect(explanation.operation).toBe('loadImageFromUrl');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installImageHostBackend(getImageBackend());
    observeImageHostResult('loadImageFromUrl', false);
    expect(explainImageBackend().viability).toBe('runtime-api-unavailable');
  });
});

describe('resetImageBackendForTest', () => {
  it('clears all backend slots', () => {
    setImageBackend(getImageBackend());
    installImageHostBackend(getImageBackend());
    observeImageHostResult('loadImageFromUrl', true);
    resetImageBackendForTest();
    expect(explainImageBackend().layer).toBe('host-not-enabled');
    expect(explainImageBackend().conflict).toBe(false);
    expect(explainImageBackend().viability).toBe('unobserved');
  });
});

describe('setImageBackend', () => {
  it('restores a working web default when passed null, rather than leaving a one-way door', () => {
    const { backend } = recordingBackend();
    setImageBackend(backend);
    setImageBackend(null);
    const restored = getImageBackend();
    // Not merely non-null: it must not be the backend that was uninstalled, and it must be usable.
    expect(restored).not.toBe(backend);
    expect(typeof restored.loadImageFromUrl).toBe('function');
  });

  it('routes loadImageResourceFromUrl through the active backend, arguments intact', async () => {
    // The seam is only real if the loader actually dispatches through it — a backend nobody calls
    // would satisfy every test above and change nothing.
    const { backend, calls } = recordingBackend();
    setImageBackend(backend);
    const signal = AbortSignal.abort === undefined ? undefined : new AbortController().signal;
    await loadImageResourceFromUrl('https://example.test/a.png', 'anonymous', signal);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('https://example.test/a.png');
    expect(calls[0]![1]).toBe('anonymous');
    expect(calls[0]![2]).toBe(signal);
  });
});
