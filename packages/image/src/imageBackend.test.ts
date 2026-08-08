import type { Image, ImageBackend } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { createWebImageBackend, getImageBackend, setImageBackend } from './imageBackend';
import { loadImageResourceFromUrl } from './imageResourceFrom';

// Every test that installs a backend must put it back, or a later test sees a stale one.
afterEach(() => setImageBackend(null));

function recordingBackend(): { backend: ImageBackend; calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    backend: {
      loadImageFromUrl(url, crossOrigin, signal): Promise<Image> {
        calls.push([url, crossOrigin, signal]);
        return Promise.resolve({} as Image);
      },
    },
    calls,
  };
}

describe('createWebImageBackend', () => {
  it('builds a backend without touching the DOM until it is called', () => {
    // Constructing must not decode anything; the DOM work belongs inside `loadImageFromUrl`.
    const backend = createWebImageBackend();
    expect(typeof backend.loadImageFromUrl).toBe('function');
  });

  it('builds a fresh backend each call rather than a shared singleton', () => {
    expect(createWebImageBackend()).not.toBe(createWebImageBackend());
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
