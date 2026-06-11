import { createSignal, emitSignal } from '@flighthq/signals';
import type { AssetLoader } from '@flighthq/types';

interface QueuedItem {
  factory: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

interface AssetLoaderInternal extends AssetLoader {
  items: QueuedItem[];
  loaded: number;
  started: boolean;
  total: number;
}

export function createAssetLoader(): AssetLoader {
  const out: AssetLoaderInternal = {
    items: [],
    loaded: 0,
    started: false,
    total: 0,
    onComplete: createSignal(),
    onError: createSignal(),
    onProgress: createSignal(),
  };
  return out;
}

export function queueAssetLoad<T>(loader: AssetLoader, factory: () => Promise<T>): Promise<T> {
  const internal = loader as AssetLoaderInternal;
  if (internal.started) {
    throw new Error('Cannot queue assets after loading has started');
  }
  return new Promise<T>((resolve, reject) => {
    internal.items.push({
      factory: factory as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
  });
}

export function startAssetLoad(loader: AssetLoader): void {
  const internal = loader as AssetLoaderInternal;
  if (internal.started) return;
  internal.started = true;
  internal.total = internal.items.length;
  internal.loaded = 0;

  if (internal.total === 0) {
    emitSignal(loader.onProgress, 0, 0);
    emitSignal(loader.onComplete);
    return;
  }

  for (const item of internal.items) {
    void runQueuedItem(item, internal, loader);
  }
}

async function runQueuedItem(item: QueuedItem, internal: AssetLoaderInternal, loader: AssetLoader): Promise<void> {
  try {
    const value = await item.factory();
    item.resolve(value);
  } catch (error) {
    item.reject(error);
    emitSignal(loader.onError, error);
  } finally {
    internal.loaded++;
    emitSignal(loader.onProgress, internal.loaded, internal.total);
    if (internal.loaded === internal.total) {
      emitSignal(loader.onComplete);
    }
  }
}
