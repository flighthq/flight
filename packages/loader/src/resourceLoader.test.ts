import { connectSignal } from '@flighthq/signals';

import { createResourceLoader, queueResourceLoad, startResourceLoad } from './resourceLoader';

describe('createResourceLoader', () => {
  it('returns an object with all signal properties', () => {
    const loader = createResourceLoader();
    expect(loader.onComplete).toBeDefined();
    expect(loader.onError).toBeDefined();
    expect(loader.onProgress).toBeDefined();
  });
});

describe('queueResourceLoad', () => {
  it('throws if called after loading has started', () => {
    const loader = createResourceLoader();
    startResourceLoad(loader);
    expect(() => queueResourceLoad(loader, () => Promise.resolve(1))).toThrow();
  });

  it('returns a promise that resolves with the loaded value', async () => {
    const loader = createResourceLoader();
    const result = queueResourceLoad(loader, () => Promise.resolve('hello'));
    startResourceLoad(loader);
    expect(await result).toBe('hello');
  });

  it('returns a promise that rejects when the factory throws', async () => {
    const loader = createResourceLoader();
    const result = queueResourceLoad(loader, () => Promise.reject(new Error('load failed')));
    connectSignal(loader.onError, () => {}); // suppress unhandled
    startResourceLoad(loader);
    await expect(result).rejects.toThrow('load failed');
  });

  it('fires onProgress after each item completes', async () => {
    const loader = createResourceLoader();
    const progress: Array<[number, number]> = [];
    connectSignal(loader.onProgress, (loaded, total) => {
      progress.push([loaded, total]);
    });

    queueResourceLoad(loader, () => Promise.resolve('a'));
    queueResourceLoad(loader, () => Promise.resolve('b'));
    queueResourceLoad(loader, () => Promise.resolve('c'));
    startResourceLoad(loader);

    await new Promise<void>((resolve) => connectSignal(loader.onComplete, resolve));

    expect(progress).toHaveLength(3);
    expect(progress[2]).toEqual([3, 3]);
  });

  it('fires onComplete after all items finish', async () => {
    const loader = createResourceLoader();
    let completed = false;
    connectSignal(loader.onComplete, () => {
      completed = true;
    });

    queueResourceLoad(loader, () => Promise.resolve(1));
    queueResourceLoad(loader, () => Promise.resolve(2));
    startResourceLoad(loader);

    await new Promise<void>((resolve) => connectSignal(loader.onComplete, resolve));
    expect(completed).toBe(true);
  });

  it('fires onError for a failed item but still completes', async () => {
    const loader = createResourceLoader();
    const errors: unknown[] = [];
    connectSignal(loader.onError, (err) => {
      errors.push(err);
    });

    queueResourceLoad(loader, () => Promise.resolve('ok'));
    const failing = queueResourceLoad(loader, () => Promise.reject(new Error('oops')));
    failing.catch(() => {}); // handle rejection
    startResourceLoad(loader);

    await new Promise<void>((resolve) => connectSignal(loader.onComplete, resolve));

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('oops');
  });

  it('loads items in parallel', async () => {
    const loader = createResourceLoader();
    const order: number[] = [];

    queueResourceLoad(
      loader,
      () =>
        new Promise<number>((resolve) =>
          setTimeout(() => {
            order.push(1);
            resolve(1);
          }, 20),
        ),
    );
    queueResourceLoad(
      loader,
      () =>
        new Promise<number>((resolve) =>
          setTimeout(() => {
            order.push(2);
            resolve(2);
          }, 5),
        ),
    );
    startResourceLoad(loader);

    await new Promise<void>((resolve) => connectSignal(loader.onComplete, resolve));

    // Parallel: item 2 (5ms) finishes before item 1 (20ms)
    expect(order).toEqual([2, 1]);
  });
});

describe('startResourceLoad', () => {
  it('fires onComplete immediately when queue is empty', () => {
    const loader = createResourceLoader();
    let called = false;
    connectSignal(loader.onComplete, () => {
      called = true;
    });
    startResourceLoad(loader);
    expect(called).toBe(true);
  });

  it('fires onProgress(0, 0) for an empty queue', () => {
    const loader = createResourceLoader();
    let args: [number, number] | null = null;
    connectSignal(loader.onProgress, (loaded, total) => {
      args = [loaded, total];
    });
    startResourceLoad(loader);
    expect(args).toEqual([0, 0]);
  });

  it('is a no-op if called a second time', () => {
    const loader = createResourceLoader();
    let count = 0;
    connectSignal(loader.onComplete, () => {
      count++;
    });
    startResourceLoad(loader);
    startResourceLoad(loader);
    expect(count).toBe(1);
  });
});
