import { connectSignal, createSignal } from '@flighthq/signals';
import type { AssetDescriptor, AssetLoadProgress, AssetManifest } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  acquireAsset,
  createAssetLibrary,
  disposeAssetLibrary,
  getAsset,
  getAssetRefCount,
  loadAssetGroup,
  registerAssetDescriptor,
  registerAssetLoader,
  registerAssetManifest,
  releaseAsset,
  releaseAssetGroup,
} from './assetLibrary';

// A mock loader adapter: counts load calls, records disposed values, and holds each load open until
// flush() so tests can observe in-flight state (dedup, bounded concurrency). Each load resolves a
// fresh, stable value object keyed by id, so identity assertions distinguish shared vs. re-loaded.
function createMockAdapter() {
  let loadCalls = 0;
  let inFlight = 0;
  let peak = 0;
  const disposed: unknown[] = [];
  const pending: Array<() => void> = [];

  return {
    adapter: {
      load(descriptor: Readonly<AssetDescriptor>): Promise<{ id: string }> {
        loadCalls++;
        inFlight++;
        peak = Math.max(peak, inFlight);
        return new Promise<{ id: string }>((resolve) => {
          pending.push(() => {
            inFlight--;
            resolve({ id: descriptor.id });
          });
        });
      },
      dispose(value: { id: string }): void {
        disposed.push(value);
      },
    },
    disposed,
    flush(): void {
      const wave = pending.splice(0);
      for (const settle of wave) settle();
    },
    get inFlight() {
      return inFlight;
    },
    get loadCalls() {
      return loadCalls;
    },
    get peak() {
      return peak;
    },
    get pendingCount() {
      return pending.length;
    },
  };
}

// Registers `type`, records a one-descriptor manifest for `id`, and returns the mock so a test can
// acquire and drive the load.
function libraryWith(id: string, type = 'image') {
  const library = createAssetLibrary();
  const mock = createMockAdapter();
  registerAssetLoader(library, type, mock.adapter);
  registerAssetManifest(library, [{ id, url: `${id}.bin`, type }]);
  return { library, mock };
}

// Runs pending microtasks so loader continuations settle between flush waves.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('acquireAsset', () => {
  it('drops a rejected entry so a later acquire retries', async () => {
    const library = createAssetLibrary();
    let attempts = 0;
    registerAssetLoader(library, 'image', {
      dispose(): void {},
      load(): Promise<{ id: string }> {
        attempts++;
        return attempts === 1 ? Promise.reject(new Error('temporary')) : Promise.resolve({ id: 'hero' });
      },
    });
    registerAssetDescriptor(library, { id: 'hero', type: 'image', url: 'hero.bin' });

    await expect(acquireAsset(library, 'hero')).rejects.toThrow('temporary');
    await expect(acquireAsset(library, 'hero')).resolves.toEqual({ id: 'hero' });
    expect(attempts).toBe(2);
    expect(getAssetRefCount(library, 'hero')).toBe(1);
  });

  it('resolves the adapter loaded value and calls load once', async () => {
    const { library, mock } = libraryWith('hero');
    const promise = acquireAsset<{ id: string }>(library, 'hero');
    expect(mock.loadCalls).toBe(1);
    mock.flush();
    const value = await promise;
    expect(value).toEqual({ id: 'hero' });
    expect(getAsset(library, 'hero')).toBe(value);
  });

  it('shares one in-flight load across concurrent acquires (dedup)', async () => {
    const { library, mock } = libraryWith('hero');
    const first = acquireAsset<{ id: string }>(library, 'hero');
    const second = acquireAsset<{ id: string }>(library, 'hero');
    expect(mock.loadCalls).toBe(1);
    expect(getAssetRefCount(library, 'hero')).toBe(2);
    mock.flush();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(getAsset(library, 'hero')).toBe(a);
  });

  it('rejects when no descriptor is recorded for the id', async () => {
    const library = createAssetLibrary();
    await expect(acquireAsset(library, 'missing')).rejects.toThrow(/no descriptor/);
  });

  it('rejects when no adapter is registered for the descriptor type', async () => {
    const library = createAssetLibrary();
    registerAssetManifest(library, [{ id: 'hero', url: 'hero.bin', type: 'image' }]);
    await expect(acquireAsset(library, 'hero')).rejects.toThrow(/no loader/);
  });
});

describe('createAssetLibrary', () => {
  it('creates an empty library with no resident assets', () => {
    const library = createAssetLibrary();
    expect(getAsset(library, 'hero')).toBeNull();
    expect(getAssetRefCount(library, 'hero')).toBe(0);
  });
});

describe('disposeAssetLibrary', () => {
  it('disposes every resident asset and empties the library', async () => {
    const { library, mock } = libraryWith('hero');
    await (() => {
      const p = acquireAsset(library, 'hero');
      mock.flush();
      return p;
    })();
    // A second acquire on the same id shares the resident value (refcount 2, one loaded value).
    await acquireAsset(library, 'hero');
    expect(getAssetRefCount(library, 'hero')).toBe(2);

    disposeAssetLibrary(library);
    expect(mock.disposed).toEqual([{ id: 'hero' }]);
    expect(getAsset(library, 'hero')).toBeNull();
    expect(getAssetRefCount(library, 'hero')).toBe(0);
  });
});

describe('getAsset', () => {
  it('returns null before load and the value once resident', async () => {
    const { library, mock } = libraryWith('hero');
    expect(getAsset(library, 'hero')).toBeNull();
    const promise = acquireAsset(library, 'hero');
    // Still loading — not yet resident.
    expect(getAsset(library, 'hero')).toBeNull();
    mock.flush();
    const value = await promise;
    expect(getAsset(library, 'hero')).toBe(value);
  });
});

describe('getAssetRefCount', () => {
  it('counts acquires and drops to zero when freed', async () => {
    const { library, mock } = libraryWith('hero');
    const promise = acquireAsset(library, 'hero');
    mock.flush();
    await promise;
    await acquireAsset(library, 'hero');
    expect(getAssetRefCount(library, 'hero')).toBe(2);
    releaseAsset(library, 'hero');
    expect(getAssetRefCount(library, 'hero')).toBe(1);
    releaseAsset(library, 'hero');
    expect(getAssetRefCount(library, 'hero')).toBe(0);
  });
});

describe('loadAssetGroup', () => {
  it('makes successfully loaded assets accessible even when another group member fails', async () => {
    const library = createAssetLibrary();
    let failNextId: string | null = null;
    const disposed: unknown[] = [];
    const adapter = {
      load(descriptor: Readonly<AssetDescriptor>): Promise<{ id: string }> {
        if (descriptor.id === failNextId) {
          return Promise.reject(new Error(`load failed: ${descriptor.id}`));
        }
        return Promise.resolve({ id: descriptor.id });
      },
      dispose(value: { id: string }): void {
        disposed.push(value);
      },
    };
    registerAssetLoader(library, 'image', adapter);
    registerAssetManifest(library, [
      { id: 'ok-1', url: 'ok-1.bin', type: 'image', groups: ['mixed'] },
      { id: 'bad', url: 'bad.bin', type: 'image', groups: ['mixed'] },
      { id: 'ok-2', url: 'ok-2.bin', type: 'image', groups: ['mixed'] },
    ]);
    failNextId = 'bad';

    await expect(loadAssetGroup(library, 'mixed')).rejects.toThrow('load failed: bad');

    expect(getAsset(library, 'ok-1')).toEqual({ id: 'ok-1' });
    expect(getAsset(library, 'ok-2')).toEqual({ id: 'ok-2' });
    // The failed asset never became resident.
    expect(getAsset(library, 'bad')).toBeNull();
  });

  it('preloads a group through the loader with bounded concurrency and aggregate progress', async () => {
    const library = createAssetLibrary();
    const mock = createMockAdapter();
    registerAssetLoader(library, 'image', mock.adapter);

    const count = 10;
    const manifest: AssetManifest = Array.from({ length: count }, (_unused, i) => ({
      id: `tile-${i}`,
      url: `tile-${i}.bin`,
      type: 'image',
      groups: ['level'],
    }));
    registerAssetManifest(library, manifest);

    const ticks: AssetLoadProgress[] = [];
    const progress = createSignal<(p: Readonly<AssetLoadProgress>) => void>();
    connectSignal(progress, (p) => {
      ticks.push({ loaded: p.loaded, total: p.total });
    });

    const done = loadAssetGroup(library, 'level', { progress });
    // The loader dispatches at most its default concurrency (6) at once.
    expect(mock.peak).toBe(6);

    let settled = false;
    void done.then(() => {
      settled = true;
    });
    while (!settled) {
      mock.flush();
      await tick();
    }
    await done;

    expect(mock.loadCalls).toBe(count);
    expect(mock.peak).toBeLessThanOrEqual(6);
    for (let i = 0; i < count; i++) {
      expect(getAsset(library, `tile-${i}`)).toEqual({ id: `tile-${i}` });
      expect(getAssetRefCount(library, `tile-${i}`)).toBe(1);
    }
    expect(ticks[ticks.length - 1]).toEqual({ loaded: count, total: count });
  });

  it('resolves immediately for an unknown or empty group', async () => {
    const library = createAssetLibrary();
    await expect(loadAssetGroup(library, 'nope')).resolves.toBeUndefined();
  });
});

describe('registerAssetDescriptor', () => {
  it('copies caller-owned group data into the catalog', () => {
    const library = createAssetLibrary();
    const groups = ['boot'];
    registerAssetDescriptor(library, { groups, id: 'hero', type: 'image', url: 'hero.bin' });
    groups.push('mutated');

    expect(library.runtime.descriptors.get('hero')?.groups).toEqual(['boot']);
    expect(library.runtime.groups.has('mutated')).toBe(false);
  });

  it('moves replacement group membership instead of retaining stale groups', () => {
    const library = createAssetLibrary();
    registerAssetDescriptor(library, { id: 'hero', url: 'hero-a.bin', type: 'image', groups: ['boot', 'shared'] });
    registerAssetDescriptor(library, { id: 'hero', url: 'hero-b.bin', type: 'image', groups: ['level', 'shared'] });

    expect(library.runtime.groups.get('boot')).toBeUndefined();
    expect(library.runtime.groups.get('level')).toEqual(['hero']);
    expect(library.runtime.groups.get('shared')).toEqual(['hero']);
  });

  it('rejects changing an acquired descriptor but permits equivalent registration', async () => {
    const library = createAssetLibrary();
    const mock = createMockAdapter();
    registerAssetLoader(library, 'image', mock.adapter);
    const descriptor = { id: 'hero', url: 'hero.bin', type: 'image' as const, groups: ['boot'] };
    registerAssetDescriptor(library, descriptor);
    const pending = acquireAsset(library, 'hero');

    expect(() => registerAssetDescriptor(library, { ...descriptor, groups: ['boot'] })).not.toThrow();
    expect(() => registerAssetDescriptor(library, { ...descriptor, url: 'replacement.bin' })).toThrow(
      /cannot replace acquired descriptor/,
    );

    mock.flush();
    await pending;
  });
});

describe('registerAssetLoader', () => {
  it('is last-write-wins for a type', async () => {
    const library = createAssetLibrary();
    const first = createMockAdapter();
    const second = createMockAdapter();
    registerAssetLoader(library, 'image', first.adapter);
    registerAssetLoader(library, 'image', second.adapter);
    registerAssetManifest(library, [{ id: 'hero', url: 'hero.bin', type: 'image' }]);
    const promise = acquireAsset(library, 'hero');
    second.flush();
    await promise;
    expect(first.loadCalls).toBe(0);
    expect(second.loadCalls).toBe(1);
  });
});

describe('registerAssetManifest', () => {
  it('records descriptors and group membership without loading', async () => {
    const library = createAssetLibrary();
    const mock = createMockAdapter();
    registerAssetLoader(library, 'image', mock.adapter);
    registerAssetManifest(library, [
      { id: 'a', url: 'a.bin', type: 'image', groups: ['boot'] },
      { id: 'b', url: 'b.bin', type: 'image', groups: ['boot'] },
    ]);
    // Nothing loaded from recording alone.
    expect(mock.loadCalls).toBe(0);
    expect(getAsset(library, 'a')).toBeNull();
    // The recorded descriptor makes acquire resolvable.
    const promise = acquireAsset(library, 'a');
    mock.flush();
    await promise;
    expect(getAsset(library, 'a')).toEqual({ id: 'a' });
  });
});

describe('releaseAsset', () => {
  it('disposes the orphaned value when released while the load is still in flight', async () => {
    const { library, mock } = libraryWith('hero');
    const promise = acquireAsset(library, 'hero');
    // Release before the load settles — refcount drops to zero, entry removed.
    releaseAsset(library, 'hero');
    expect(getAssetRefCount(library, 'hero')).toBe(0);
    expect(getAsset(library, 'hero')).toBeNull();

    // Let the load resolve — the continuation detects the orphan and disposes the value.
    mock.flush();
    await promise;
    expect(mock.disposed).toHaveLength(1);
    expect(mock.disposed[0]).toEqual({ id: 'hero' });
    // The value is not retained.
    expect(getAsset(library, 'hero')).toBeNull();
  });

  it('disposes and drops the asset at reference count zero', async () => {
    const { library, mock } = libraryWith('hero');
    const promise = acquireAsset(library, 'hero');
    mock.flush();
    const value = await promise;
    await acquireAsset(library, 'hero');

    releaseAsset(library, 'hero');
    // Still held by the second acquire — not disposed.
    expect(mock.disposed).toEqual([]);
    expect(getAsset(library, 'hero')).toBe(value);

    releaseAsset(library, 'hero');
    // Last holder gone — disposed once and dropped.
    expect(mock.disposed).toEqual([value]);
    expect(getAsset(library, 'hero')).toBeNull();
  });

  it('is a no-op when releasing below zero', () => {
    const { library, mock } = libraryWith('hero');
    releaseAsset(library, 'hero');
    releaseAsset(library, 'hero');
    expect(mock.disposed).toEqual([]);
    expect(getAssetRefCount(library, 'hero')).toBe(0);
  });

  it('keeps the asset loaded when one of two holders releases', async () => {
    const { library, mock } = libraryWith('hero');
    const first = acquireAsset<{ id: string }>(library, 'hero');
    const second = acquireAsset<{ id: string }>(library, 'hero');
    expect(mock.loadCalls).toBe(1);
    mock.flush();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(getAssetRefCount(library, 'hero')).toBe(2);

    releaseAsset(library, 'hero');
    expect(getAssetRefCount(library, 'hero')).toBe(1);
    expect(mock.disposed).toEqual([]);
    expect(getAsset(library, 'hero')).toBe(a);
  });
});

describe('releaseAssetGroup', () => {
  it('releases and disposes every group member', async () => {
    const library = createAssetLibrary();
    const mock = createMockAdapter();
    registerAssetLoader(library, 'image', mock.adapter);
    registerAssetManifest(library, [
      { id: 'a', url: 'a.bin', type: 'image', groups: ['level'] },
      { id: 'b', url: 'b.bin', type: 'image', groups: ['level'] },
    ]);

    const done = loadAssetGroup(library, 'level');
    let settled = false;
    void done.then(() => {
      settled = true;
    });
    while (!settled) {
      mock.flush();
      await tick();
    }
    await done;

    expect(getAssetRefCount(library, 'a')).toBe(1);
    expect(getAssetRefCount(library, 'b')).toBe(1);

    releaseAssetGroup(library, 'level');
    expect(mock.disposed).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(getAsset(library, 'a')).toBeNull();
    expect(getAsset(library, 'b')).toBeNull();
  });

  it('is a no-op for an unknown group', () => {
    const library = createAssetLibrary();
    expect(() => releaseAssetGroup(library, 'nope')).not.toThrow();
  });
});
