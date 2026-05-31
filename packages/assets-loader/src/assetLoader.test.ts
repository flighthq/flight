import { connectSignal } from '@flighthq/signals';

import { createAssetLoader, queueAssetLoad, startAssetLoad } from './assetLoader';

describe('createAssetLoader', () => {
  it('returns an object with all signal properties', () => {
    const loader = createAssetLoader();
    expect(loader.onComplete).toBeDefined();
    expect(loader.onError).toBeDefined();
    expect(loader.onProgress).toBeDefined();
  });
});

describe('queueAssetLoad', () => {
  it('throws if called after loading has started', () => {
    const loader = createAssetLoader();
    startAssetLoad(loader);
    expect(() => queueAssetLoad(loader, () => Promise.resolve(1))).toThrow();
  });

  it('returns a promise that resolves with the loaded value', async () => {
    const loader = createAssetLoader();
    const result = queueAssetLoad(loader, () => Promise.resolve('hello'));
    startAssetLoad(loader);
    expect(await result).toBe('hello');
  });

  it('returns a promise that rejects when the factory throws', async () => {
    const loader = createAssetLoader();
    const result = queueAssetLoad(loader, () => Promise.reject(new Error('load failed')));
    connectSignal(loader.onError, () => {}); // suppress unhandled
    startAssetLoad(loader);
    await expect(result).rejects.toThrow('load failed');
  });

  it('fires onProgress after each item completes', async () => {
    const loader = createAssetLoader();
    const progress: Array<[number, number]> = [];
    connectSignal(loader.onProgress, (loaded, total) => {
      progress.push([loaded, total]);
    });

    queueAssetLoad(loader, () => Promise.resolve('a'));
    queueAssetLoad(loader, () => Promise.resolve('b'));
    queueAssetLoad(loader, () => Promise.resolve('c'));
    startAssetLoad(loader);

    await new Promise<void>((resolve) => connectSignal(loader.onComplete, resolve));

    expect(progress).toHaveLength(3);
    expect(progress[2]).toEqual([3, 3]);
  });

  it('fires onComplete after all items finish', async () => {
    const loader = createAssetLoader();
    let completed = false;
    connectSignal(loader.onComplete, () => {
      completed = true;
    });

    queueAssetLoad(loader, () => Promise.resolve(1));
    queueAssetLoad(loader, () => Promise.resolve(2));
    startAssetLoad(loader);

    await new Promise<void>((resolve) => connectSignal(loader.onComplete, resolve));
    expect(completed).toBe(true);
  });

  it('fires onError for a failed item but still completes', async () => {
    const loader = createAssetLoader();
    const errors: unknown[] = [];
    connectSignal(loader.onError, (err) => {
      errors.push(err);
    });

    queueAssetLoad(loader, () => Promise.resolve('ok'));
    const failing = queueAssetLoad(loader, () => Promise.reject(new Error('oops')));
    failing.catch(() => {}); // handle rejection
    startAssetLoad(loader);

    await new Promise<void>((resolve) => connectSignal(loader.onComplete, resolve));

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('oops');
  });

  it('loads items in parallel', async () => {
    const loader = createAssetLoader();
    const order: number[] = [];

    queueAssetLoad(
      loader,
      () =>
        new Promise<number>((resolve) =>
          setTimeout(() => {
            order.push(1);
            resolve(1);
          }, 20),
        ),
    );
    queueAssetLoad(
      loader,
      () =>
        new Promise<number>((resolve) =>
          setTimeout(() => {
            order.push(2);
            resolve(2);
          }, 5),
        ),
    );
    startAssetLoad(loader);

    await new Promise<void>((resolve) => connectSignal(loader.onComplete, resolve));

    // Parallel: item 2 (5ms) finishes before item 1 (20ms)
    expect(order).toEqual([2, 1]);
  });
});

describe('startAssetLoad', () => {
  it('fires onComplete immediately when queue is empty', () => {
    const loader = createAssetLoader();
    let called = false;
    connectSignal(loader.onComplete, () => {
      called = true;
    });
    startAssetLoad(loader);
    expect(called).toBe(true);
  });

  it('fires onProgress(0, 0) for an empty queue', () => {
    const loader = createAssetLoader();
    let args: [number, number] | null = null;
    connectSignal(loader.onProgress, (loaded, total) => {
      args = [loaded, total];
    });
    startAssetLoad(loader);
    expect(args).toEqual([0, 0]);
  });

  it('is a no-op if called a second time', () => {
    const loader = createAssetLoader();
    let count = 0;
    connectSignal(loader.onComplete, () => {
      count++;
    });
    startAssetLoad(loader);
    startAssetLoad(loader);
    expect(count).toBe(1);
  });
});
