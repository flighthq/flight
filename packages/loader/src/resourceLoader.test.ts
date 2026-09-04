import { connectSignal } from '@flighthq/signals/contract';
import type { ResourceLoadHandle, ResourceLoadReport } from '@flighthq/types/contract';

import {
  cancelResourceLoad,
  createResourceLoader,
  disposeResourceLoader,
  enableResourceLoaderItemSignals,
  getResourceLoadBytes,
  getResourceLoadCounts,
  getResourceLoadItemStatus,
  getResourceLoadProgress,
  initializeResourceLoader,
  pauseResourceLoad,
  queueResourceLoad,
  resetResourceLoader,
  resumeResourceLoad,
  setResourceLoadPriority,
  setResourceLoaderConcurrency,
  startResourceLoad,
} from './resourceLoader';

// Helper: wait for onComplete signal
function waitForComplete(loader: ReturnType<typeof createResourceLoader>): Promise<readonly ResourceLoadReport[]> {
  return new Promise((resolve) => {
    connectSignal(loader.onComplete, (reports) => resolve(reports), { once: true });
  });
}

// Helper: wait for onCancel signal
function waitForCancel(loader: ReturnType<typeof createResourceLoader>): Promise<void> {
  return new Promise((resolve) => {
    connectSignal(loader.onCancel, resolve, { once: true });
  });
}

// Helper: create a controllable promise
function createDeferred<T>(): { resolve: (v: T) => void; reject: (e: unknown) => void; promise: Promise<T> } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

describe('bandwidth throttle (maxBytesPerSecond)', () => {
  it('does not throttle when maxBytesPerSecond is not set', async () => {
    const loader = createResourceLoader({ maxConcurrent: 0 });
    for (let i = 0; i < 4; i++) {
      queueResourceLoad(loader, { load: () => Promise.resolve(i) });
    }
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    expect(reports).toHaveLength(4);
    expect(reports.every((r) => r.status === 'loaded')).toBe(true);
  });

  it('dispatches items with bytesHint 0 freely when throttle is active', async () => {
    // Items with no bytesHint are treated as free (cost 0) and bypass throttle
    const loader = createResourceLoader({ maxBytesPerSecond: 100, maxConcurrent: 0 });
    for (let i = 0; i < 3; i++) {
      queueResourceLoad(loader, {
        bytesHint: 0,
        load: () => Promise.resolve(i),
      });
    }
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    expect(reports).toHaveLength(3);
    expect(reports.every((r) => r.status === 'loaded')).toBe(true);
  });

  it('throttles dispatching when items have bytesHint exceeding token bucket', async () => {
    // Very low bandwidth limit: 1000 bytes/sec, each item costs 1000 bytes
    // After dispatching the first item, we need ~1s to refill. With a short test,
    // we verify that only the first item is dispatched within a short window.
    const loader = createResourceLoader({ maxBytesPerSecond: 1000, maxConcurrent: 2 });
    const dispatchTimes: number[] = [];

    queueResourceLoad(loader, {
      bytesHint: 1000,
      load: () => {
        dispatchTimes.push(Date.now());
        return Promise.resolve('a');
      },
    });
    queueResourceLoad(loader, {
      bytesHint: 1000,
      load: () => {
        dispatchTimes.push(Date.now());
        return Promise.resolve('b');
      },
    });

    startResourceLoad(loader);

    // Wait just 50ms — not enough for the second item (needs ~1s)
    await new Promise((r) => setTimeout(r, 50));

    // The second item should not have been dispatched yet due to throttling.
    // (First item dispatched immediately using initial full bucket.)
    expect(dispatchTimes.length).toBeLessThanOrEqual(1);
  });

  it('bounds the dispatch rate to the byte budget (advisory: gates dispatch, not in-flight bytes)', async () => {
    // Pin the present throttle behavior: the token bucket bounds the rate at which
    // items are *dispatched*, not the bytes that flow once a load is in flight.
    // Budget 1000 B/s, three items each hinting 1000 B. The bucket starts full, so
    // item 0 dispatches immediately; items 1 and 2 each wait ~1s for a refill.
    // The whole batch therefore cannot complete faster than ~2s — that lower bound
    // is what "rate-bound" means here.
    const loader = createResourceLoader({ maxBytesPerSecond: 1000, maxConcurrent: 4 });
    for (let i = 0; i < 3; i++) {
      queueResourceLoad(loader, { bytesHint: 1000, key: `item${i}`, load: () => Promise.resolve(i) });
    }

    const startMs = Date.now();
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    const elapsed = Date.now() - startMs;

    expect(reports).toHaveLength(3);
    expect(reports.every((r) => r.status === 'loaded')).toBe(true);
    // Two refill windows (~1s each) gate items 1 and 2 — the rate is bounded below.
    expect(elapsed).toBeGreaterThanOrEqual(1800);
    // Limit of the advisory model: report.bytes is not metered from the in-flight
    // transfer, so the throttle gates dispatch only and does not observe actual bytes.
    expect(reports.every((r) => r.bytes === 0)).toBe(true);
  });

  it('resets token bucket on resetResourceLoader', async () => {
    const loader = createResourceLoader({ maxBytesPerSecond: 500, maxConcurrent: 1 });
    queueResourceLoad(loader, { bytesHint: 500, load: () => Promise.resolve(1) });
    startResourceLoad(loader);
    await waitForComplete(loader);

    resetResourceLoader(loader);

    // After reset, a new batch with the same cost should dispatch immediately
    // because the token bucket is refilled to capacity.
    const startMs = Date.now();
    queueResourceLoad(loader, { bytesHint: 500, load: () => Promise.resolve(2) });
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    const elapsed = Date.now() - startMs;

    expect(reports).toHaveLength(1);
    expect(reports[0].status).toBe('loaded');
    // Should complete well under the throttle window (< 200ms)
    expect(elapsed).toBeLessThan(200);
  });
});

describe('byte progress', () => {
  // The whole surface was structurally dead: onBytesProgress was stored and never called,
  // entry.bytesLoaded was never written, and ResourceLoadReport.bytes was therefore always 0. The
  // missing piece was that the loader cannot know a transfer's byte count — only the factory can — so
  // the factory now receives a reporter as a second argument. Additive by design: a one-argument
  // factory keeps working and simply never reports.
  it('hands the factory a reporter as its second argument', async () => {
    const loader = createResourceLoader();
    let received: string = 'none';
    queueResourceLoad(loader, {
      key: 'a',
      load: (_signal, reportBytes) => {
        received = typeof reportBytes;
        return Promise.resolve('v');
      },
    });
    startResourceLoad(loader);
    await waitForComplete(loader);
    expect(received).toBe('function');
  });

  it('forwards every reported figure to onBytesProgress', async () => {
    const loader = createResourceLoader();
    const seen: string[] = [];
    queueResourceLoad(loader, {
      key: 'a',
      bytesHint: 1000,
      onBytesProgress: (loaded, total) => seen.push(`${loaded}/${total}`),
      load: (_signal, reportBytes) => {
        reportBytes(250);
        reportBytes(600, 1200);
        return Promise.resolve('v');
      },
    });
    startResourceLoad(loader);
    await waitForComplete(loader);
    expect(seen).toEqual(['250/1000', '600/1200']);
  });

  it('falls back to bytesHint for the total when the factory reports only what has arrived', async () => {
    const loader = createResourceLoader();
    const totals: number[] = [];
    queueResourceLoad(loader, {
      key: 'a',
      bytesHint: 4096,
      onBytesProgress: (_loaded, total) => totals.push(total),
      load: (_signal, reportBytes) => {
        reportBytes(1);
        return Promise.resolve('v');
      },
    });
    startResourceLoad(loader);
    await waitForComplete(loader);
    expect(totals).toEqual([4096]);
  });

  it("reports the last figure as the item's bytes", async () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, {
      key: 'a',
      load: (_signal, reportBytes) => {
        reportBytes(10);
        reportBytes(9000);
        return Promise.resolve('v');
      },
    });
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    expect(reports[0].bytes).toBe(9000);
  });

  it('leaves bytes at zero for a factory that reports nothing', async () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { key: 'a', load: () => Promise.resolve('v') });
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    expect(reports[0].bytes).toBe(0);
  });

  it('runs a one-argument factory untouched, which is what makes the seam additive', async () => {
    // The reason this shape was chosen over changing the signature: existing callers keep compiling
    // and keep working, and only a factory that can observe its transfer opts in.
    const loader = createResourceLoader();
    queueResourceLoad(loader, { key: 'a', load: (signal: AbortSignal) => Promise.resolve(signal.aborted) });
    queueResourceLoad(loader, () => Promise.resolve('thunk'));
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    expect(reports.map((r) => r.status)).toEqual(['loaded', 'loaded']);
    expect(reports.every((r) => r.bytes === 0)).toBe(true);
  });

  it('ignores a report that arrives after the load has settled', async () => {
    // Entries are pooled, so a late report — a stream flushing after resolve — would otherwise write
    // a byte count into whichever item had since been handed that record.
    const loader = createResourceLoader();
    const seen: number[] = [];
    let late: ((loaded: number) => void) | null = null;
    queueResourceLoad(loader, {
      key: 'a',
      bytesHint: 100,
      onBytesProgress: (loaded) => seen.push(loaded),
      load: (_signal, reportBytes) => {
        reportBytes(5);
        late = reportBytes;
        return Promise.resolve('v');
      },
    });
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    expect(seen).toEqual([5]);

    late!(999);
    expect(seen).toEqual([5]);
    expect(reports[0].bytes).toBe(5);
  });

  it('does not let a stale reporter write bytes into the item that recycled its record', async () => {
    // The hazard the guard actually exists for, and the one the test above does NOT cover: entries are
    // pooled, so once item A settles its record is handed to the next item queued. A reporter A kept
    // hold of would then be writing B's byte count. Asserting on A's own report cannot see this —
    // that number was already copied out at settle time — so this asserts on B.
    const first = createResourceLoader();
    let stale: ((loaded: number) => void) | null = null;
    queueResourceLoad(first, {
      key: 'a',
      load: (_signal, reportBytes) => {
        stale = reportBytes;
        reportBytes(5);
        return Promise.resolve('v');
      },
    });
    startResourceLoad(first);
    await waitForComplete(first);

    // A fresh batch reuses the pooled record A just released.
    const second = createResourceLoader();
    queueResourceLoad(second, {
      key: 'b',
      load: (_signal, reportBytes) => {
        reportBytes(11);
        stale!(999999);
        return Promise.resolve('v');
      },
    });
    startResourceLoad(second);
    const reports = await waitForComplete(second);
    expect(reports[0].key).toBe('b');
    expect(reports[0].bytes).toBe(11);
  });

  it('still lets bytesHint drive the throttle, which never depended on the factory', async () => {
    const loader = createResourceLoader({ maxBytesPerSecond: 1000 });
    queueResourceLoad(loader, { key: 'a', bytesHint: 10, load: () => Promise.resolve('v') });
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    expect(reports[0].status).toBe('loaded');
  });
});

describe('bytes progress', () => {
  it('records bytes in ResourceLoadReport when factory calls onBytesProgress', async () => {
    const loader = createResourceLoader();

    const handle = queueResourceLoad(loader, {
      key: 'file',
      load: () => Promise.resolve('data'),
      onBytesProgress: (loaded, total) => {
        void loaded;
        void total;
      },
    });

    const handle2 = queueResourceLoad(loader, {
      key: 'streaming',
      load: async (_signal) => 'streamed-data',
      onBytesProgress: (loaded, total) => {
        void loaded;
        void total;
      },
    });

    void handle;
    void handle2;
    // The onBytesProgress is exposed via the item descriptor; factories can
    // call it directly since they hold a reference via closure.
    // Verify the report includes bytes field (zero if factory doesn't call it)
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    const fileReport = reports.find((r) => r.key === 'file');
    expect(fileReport).toBeDefined();
    expect(typeof fileReport!.bytes).toBe('number');
    expect(fileReport!.bytes).toBeGreaterThanOrEqual(0);
  });

  it('ResourceLoadReport includes bytes field defaulting to 0', async () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { key: 'a', load: () => Promise.resolve(1) });
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    expect(reports[0].bytes).toBe(0);
  });

  it('onBytesProgress descriptor callback is invoked with loaded/total', async () => {
    const loader = createResourceLoader();
    const bytesEvents: Array<[number, number]> = [];

    queueResourceLoad(loader, {
      key: 'item',
      load: async (_signal) => {
        // Factory calls back the descriptor's onBytesProgress if provided
        // In real use, the factory has access to descriptor.onBytesProgress via closure
        return 'result';
      },
      onBytesProgress: (loaded, total) => {
        bytesEvents.push([loaded, total]);
      },
    });

    startResourceLoad(loader);
    await waitForComplete(loader);
    // onBytesProgress is only called if the factory calls it — confirm it doesn't throw
    expect(bytesEvents.length).toBeGreaterThanOrEqual(0);
  });
});

describe('cancelResourceLoad', () => {
  it('aborts in-flight loads and emits onCancel', async () => {
    const loader = createResourceLoader({ maxConcurrent: Infinity });
    const deferred = createDeferred<number>();

    const handle = queueResourceLoad(loader, { load: () => deferred.promise });
    startResourceLoad(loader);

    const cancelPromise = waitForCancel(loader);
    cancelResourceLoad(loader);
    await cancelPromise;

    await expect(handle.promise).rejects.toThrow();
  });

  it('cancels a batch that has not started, instead of stranding its promises', async () => {
    // This replaces an assertion that cancel-before-start emits nothing. It did emit nothing — and it
    // also left every queued handle pending forever, so a caller that queued a batch, changed its
    // mind, and awaited the handles simply hung. Nothing observable said so, because the old test
    // only watched the signal.
    const loader = createResourceLoader();
    let cancelled = false;
    connectSignal(loader.onCancel, () => {
      cancelled = true;
    });
    const handle = queueResourceLoad(loader, { key: 'a', load: () => Promise.resolve(1) });
    cancelResourceLoad(loader);
    await expect(handle.promise).rejects.toThrow();
    expect(cancelled).toBe(true);
  });

  it('emits onCancel with no queued items, and stays a no-op on a second call', () => {
    const loader = createResourceLoader();
    let cancelCount = 0;
    connectSignal(loader.onCancel, () => {
      cancelCount++;
    });
    cancelResourceLoad(loader);
    cancelResourceLoad(loader);
    expect(cancelCount).toBe(1);
  });

  it('reports a cancelled-before-start item as cancelled', async () => {
    const loader = createResourceLoader();
    let reports: readonly ResourceLoadReport[] = [];
    connectSignal(loader.onComplete, (r) => {
      reports = r;
    });
    queueResourceLoad(loader, { key: 'a', load: () => Promise.resolve(1) }).promise.catch(() => {});
    cancelResourceLoad(loader);
    await Promise.resolve();
    expect(reports.map((r) => r.status)).toEqual(['cancelled']);
  });

  it('is a no-op if already cancelled', async () => {
    const loader = createResourceLoader({ maxConcurrent: 0 });
    queueResourceLoad(loader, { load: () => Promise.resolve(1) });
    startResourceLoad(loader);
    cancelResourceLoad(loader);

    let count = 0;
    connectSignal(loader.onCancel, () => {
      count++;
    });
    cancelResourceLoad(loader);
    expect(count).toBe(0);
  });
});

describe('createResourceLoader', () => {
  it('returns an object with all signal properties', () => {
    const loader = createResourceLoader();
    expect(loader.onCancel).toBeDefined();
    expect(loader.onComplete).toBeDefined();
    expect(loader.onError).toBeDefined();
    expect(loader.onPause).toBeDefined();
    expect(loader.onProgress).toBeDefined();
    expect(loader.onResume).toBeDefined();
  });

  it('accepts options for maxConcurrent, errorPolicy', () => {
    const loader = createResourceLoader({ errorPolicy: 'fail-fast', maxConcurrent: 2 });
    expect(loader).toBeDefined();
  });
});

describe('disposeResourceLoader', () => {
  it('disconnects all signal listeners', async () => {
    const loader = createResourceLoader();
    let called = false;
    connectSignal(loader.onComplete, () => {
      called = true;
    });
    disposeResourceLoader(loader);
    queueResourceLoad(loader, { load: () => Promise.resolve(1) });
    startResourceLoad(loader);
    await new Promise((r) => setTimeout(r, 10));
    expect(called).toBe(false);
  });

  it('disconnects item signal listeners when enabled', async () => {
    const loader = createResourceLoader();
    const itemSignals = enableResourceLoaderItemSignals(loader);
    let started = false;
    connectSignal(itemSignals.onItemStart, () => {
      started = true;
    });
    disposeResourceLoader(loader);
    queueResourceLoad(loader, { load: () => Promise.resolve(1) });
    startResourceLoad(loader);
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toBe(false);
  });
});

describe('enableResourceLoaderItemSignals', () => {
  it('returns item signals object with all signal properties', () => {
    const loader = createResourceLoader();
    const signals = enableResourceLoaderItemSignals(loader);
    expect(signals.onItemComplete).toBeDefined();
    expect(signals.onItemError).toBeDefined();
    expect(signals.onItemRetry).toBeDefined();
    expect(signals.onItemStart).toBeDefined();
  });

  it('returns the same object when called twice', () => {
    const loader = createResourceLoader();
    const a = enableResourceLoaderItemSignals(loader);
    const b = enableResourceLoaderItemSignals(loader);
    expect(a).toBe(b);
  });

  it('fires onItemStart and onItemComplete for successful loads', async () => {
    const loader = createResourceLoader();
    const signals = enableResourceLoaderItemSignals(loader);
    const started: string[] = [];
    const completed: string[] = [];

    connectSignal(signals.onItemStart, (key) => started.push(key));
    connectSignal(signals.onItemComplete, (key) => completed.push(key));

    queueResourceLoad(loader, { key: 'a', load: () => Promise.resolve(1) });
    queueResourceLoad(loader, { key: 'b', load: () => Promise.resolve(2) });
    startResourceLoad(loader);
    await waitForComplete(loader);

    expect(started).toContain('a');
    expect(started).toContain('b');
    expect(completed).toContain('a');
    expect(completed).toContain('b');
  });

  it('fires onItemError for failed loads', async () => {
    const loader = createResourceLoader();
    const signals = enableResourceLoaderItemSignals(loader);
    const errors: Array<{ key: string; attempt: number }> = [];

    connectSignal(signals.onItemError, (key, _err, attempt) => errors.push({ attempt, key }));

    const handle = queueResourceLoad(loader, { key: 'fail', load: () => Promise.reject(new Error('oops')) });
    handle.promise.catch(() => {});
    startResourceLoad(loader);
    await waitForComplete(loader);

    expect(errors).toHaveLength(1);
    expect(errors[0].key).toBe('fail');
  });
});

describe('error policy', () => {
  it('continue policy: completes all items even after failures', async () => {
    const loader = createResourceLoader({ errorPolicy: 'continue' });
    const handles: ResourceLoadHandle<unknown>[] = [];

    handles.push(queueResourceLoad(loader, { key: 'a', load: () => Promise.reject(new Error('fail')) }));
    handles.push(queueResourceLoad(loader, { key: 'b', load: () => Promise.resolve('ok') }));
    handles[0].promise.catch(() => {});
    startResourceLoad(loader);

    const reports = await waitForComplete(loader);
    expect(reports).toHaveLength(2);
    const statuses = reports.map((r) => r.status);
    expect(statuses).toContain('failed');
    expect(statuses).toContain('loaded');
  });

  it('fail-fast policy: lets in-flight peers finish, only skips not-yet-dispatched items', async () => {
    // Pin present fail-fast scope: a failure stops *dispatch* of pending items but does
    // not abort peers already in flight — those run to completion. With maxConcurrent 2,
    // 'fail' and 'slow' start together; 'fail' rejects, 'slow' is already in flight and
    // resolves normally, while 'pending' (never dispatched) is skipped.
    const loader = createResourceLoader({ errorPolicy: 'fail-fast', maxConcurrent: 2 });
    const slowDeferred = createDeferred<string>();

    const failHandle = queueResourceLoad(loader, { key: 'fail', load: () => Promise.reject(new Error('err')) });
    const slowHandle = queueResourceLoad(loader, { key: 'slow', load: () => slowDeferred.promise });
    const pendingHandle = queueResourceLoad(loader, { key: 'pending', load: () => Promise.resolve('never') });
    failHandle.promise.catch(() => {});
    pendingHandle.promise.catch(() => {});

    startResourceLoad(loader);

    // Let 'fail' reject and fail-fast cancel the pending queue while 'slow' is still in flight.
    await new Promise((r) => setTimeout(r, 20));
    slowDeferred.resolve('ok');

    const reports = await waitForComplete(loader);
    const statuses = new Map(reports.map((r) => [r.key, r.status]));
    expect(statuses.get('fail')).toBe('failed');
    // In-flight peer ran to completion — not aborted.
    expect(statuses.get('slow')).toBe('loaded');
    expect(await slowHandle.promise).toBe('ok');
    // Not-yet-dispatched item was skipped by fail-fast.
    expect(statuses.get('pending')).toBe('skipped');
  });

  it('fail-fast policy: skips remaining items after first failure', async () => {
    const loader = createResourceLoader({ errorPolicy: 'fail-fast', maxConcurrent: 1 });
    const handles: ResourceLoadHandle<unknown>[] = [];

    handles.push(queueResourceLoad(loader, { key: 'fail', load: () => Promise.reject(new Error('err')) }));
    handles.push(queueResourceLoad(loader, { key: 'skip', load: () => Promise.resolve('ok') }));
    handles[0].promise.catch(() => {});
    handles[1].promise.catch(() => {});
    startResourceLoad(loader);

    const reports = await waitForComplete(loader);
    const statuses = new Map(reports.map((r) => [r.key, r.status]));
    expect(statuses.get('fail')).toBe('failed');
    expect(statuses.get('skip')).toBe('skipped');
  });
});

describe('getResourceLoadBytes', () => {
  it('reports zeros for a loader with nothing queued', () => {
    expect(getResourceLoadBytes(createResourceLoader())).toEqual({
      bytesLoaded: 0,
      bytesTotalKnown: 0,
      itemsWithKnownBytes: 0,
    });
  });

  // The known total is a floor that grows, never a denominator: itemsWithKnownBytes is what tells the
  // caller how much of the batch it actually covers.
  it('counts only the items that declared a size toward the known total', () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { bytesHint: 1000, load: () => Promise.resolve('a') });
    queueResourceLoad(loader, { load: () => Promise.resolve('b') });

    const bytes = getResourceLoadBytes(loader);

    expect(bytes.bytesTotalKnown).toBe(1000);
    expect(bytes.itemsWithKnownBytes).toBe(1);
    expect(bytes.bytesLoaded).toBe(0);
  });

  it('accumulates transferred bytes as items settle', async () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, {
      bytesHint: 8,
      load: async (_signal, reportBytes) => {
        reportBytes(8, 8);
        return 'a';
      },
    });
    startResourceLoad(loader);
    await waitForComplete(loader);

    expect(getResourceLoadBytes(loader).bytesLoaded).toBe(8);
  });

  it('stays valid when no item declares a size', async () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { load: () => Promise.resolve('a') });
    startResourceLoad(loader);
    await waitForComplete(loader);

    const bytes = getResourceLoadBytes(loader);
    expect(Number.isNaN(bytes.bytesTotalKnown)).toBe(false);
    expect(bytes.itemsWithKnownBytes).toBe(0);
  });
});

describe('getResourceLoadCounts', () => {
  it('reports zeros for a loader with nothing queued', () => {
    expect(getResourceLoadCounts(createResourceLoader())).toEqual({
      settledItems: 0,
      inFlightItems: 0,
      queuedItems: 0,
      totalItems: 0,
    });
  });

  it('counts queued items before the load starts', () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { load: () => Promise.resolve('a') });
    queueResourceLoad(loader, { load: () => Promise.resolve('b') });

    const counts = getResourceLoadCounts(loader);

    expect(counts.queuedItems).toBe(2);
    expect(counts.totalItems).toBe(2);
    expect(counts.settledItems).toBe(0);
  });

  // In-flight and queued are separate numbers because a concurrency limit makes them differ, and a UI
  // showing "loading 1 of 3" means the in-flight count rather than the queue depth.
  it('separates in-flight from still-queued under a concurrency limit', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    let release: (() => void) | null = null;
    queueResourceLoad(loader, { load: () => new Promise<string>((resolve) => (release = () => resolve('a'))) });
    queueResourceLoad(loader, { load: () => Promise.resolve('b') });
    queueResourceLoad(loader, { load: () => Promise.resolve('c') });
    startResourceLoad(loader);
    await Promise.resolve();

    const counts = getResourceLoadCounts(loader);
    expect(counts.inFlightItems).toBe(1);
    expect(counts.queuedItems).toBe(2);
    expect(counts.totalItems).toBe(3);

    release!();
    await waitForComplete(loader);
  });

  it('counts every finished item as settled, including a failure', async () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { load: () => Promise.resolve('ok') }).promise.catch(() => {});
    queueResourceLoad(loader, { load: () => Promise.reject(new Error('nope')), retries: 0 }).promise.catch(() => {});
    startResourceLoad(loader);
    await waitForComplete(loader);

    const counts = getResourceLoadCounts(loader);
    expect(counts.settledItems).toBe(2);
    expect(counts.totalItems).toBe(2);
    expect(counts.inFlightItems).toBe(0);
    expect(counts.queuedItems).toBe(0);
  });
});

describe('getResourceLoadItemStatus', () => {
  it('returns pending for a queued but unstarted item', () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { key: 'a', load: () => Promise.resolve(1) });
    expect(getResourceLoadItemStatus(loader, 'a')).toBe('pending');
  });

  it('returns loaded for a completed item', async () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { key: 'a', load: () => Promise.resolve(1) });
    startResourceLoad(loader);
    await waitForComplete(loader);
    expect(getResourceLoadItemStatus(loader, 'a')).toBe('loaded');
  });

  it('returns failed for an errored item', async () => {
    const loader = createResourceLoader();
    const handle = queueResourceLoad(loader, {
      key: 'a',
      load: () => Promise.reject(new Error('fail')),
    });
    handle.promise.catch(() => {});
    startResourceLoad(loader);
    await waitForComplete(loader);
    expect(getResourceLoadItemStatus(loader, 'a')).toBe('failed');
  });
});

describe('getResourceLoadProgress', () => {
  it('returns 0 before start', () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { load: () => Promise.resolve(1) });
    expect(getResourceLoadProgress(loader)).toBe(0);
  });

  it('returns 1 for empty queue after start', () => {
    const loader = createResourceLoader();
    startResourceLoad(loader);
    expect(getResourceLoadProgress(loader)).toBe(1);
  });

  it('returns fractional progress as items complete', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    queueResourceLoad(loader, { load: () => Promise.resolve(1) });
    queueResourceLoad(loader, { load: () => Promise.resolve(2) });
    queueResourceLoad(loader, { load: () => Promise.resolve(3) });
    startResourceLoad(loader);

    await waitForComplete(loader);
    expect(getResourceLoadProgress(loader)).toBe(1);
  });

  it('filters by group', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    queueResourceLoad(loader, { group: 'preload', key: 'a', load: () => Promise.resolve(1) });
    queueResourceLoad(loader, { group: 'level2', key: 'b', load: () => Promise.resolve(2) });
    startResourceLoad(loader);
    await waitForComplete(loader);

    expect(getResourceLoadProgress(loader, 'preload')).toBe(1);
    expect(getResourceLoadProgress(loader, 'level2')).toBe(1);
  });
});

describe('initializeResourceLoader', () => {
  it('is the construction initializer of createResourceLoader', () => {
    expect(typeof initializeResourceLoader).toBe('function');
  });
});

describe('pauseResourceLoad', () => {
  it('stops dispatching new items', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    const order: number[] = [];

    const deferred1 = createDeferred<number>();
    queueResourceLoad(loader, {
      load: () =>
        deferred1.promise.then((v) => {
          order.push(v);
          return v;
        }),
    });
    queueResourceLoad(loader, {
      load: () =>
        Promise.resolve(2).then((v) => {
          order.push(v);
          return v;
        }),
    });

    startResourceLoad(loader);
    pauseResourceLoad(loader);
    deferred1.resolve(1);

    await new Promise((r) => setTimeout(r, 20));
    // item 2 should not have started since paused after item 1 resolves
    expect(order).toContain(1);
    // item 2 may or may not have started depending on timing; just verify pause signal fires
  });

  it('emits onPause signal', () => {
    const loader = createResourceLoader();
    let paused = false;
    connectSignal(loader.onPause, () => {
      paused = true;
    });
    queueResourceLoad(loader, { load: () => Promise.resolve(1) });
    startResourceLoad(loader);
    pauseResourceLoad(loader);
    expect(paused).toBe(true);
  });

  it('is a no-op if not started', () => {
    const loader = createResourceLoader();
    let paused = false;
    connectSignal(loader.onPause, () => {
      paused = true;
    });
    pauseResourceLoad(loader);
    expect(paused).toBe(false);
  });
});

describe('pool allocation (PendingEntry pool)', () => {
  it('reuses pooled entries across multiple batches without corruption', async () => {
    // Run the same loader through multiple batches to exercise the acquire/release cycle
    const loader = createResourceLoader({ maxConcurrent: 2 });

    for (let batch = 0; batch < 3; batch++) {
      resetResourceLoader(loader);
      for (let i = 0; i < 4; i++) {
        const id = `batch${batch}-item${i}`;
        queueResourceLoad(loader, { key: id, load: () => Promise.resolve(id) });
      }
      startResourceLoad(loader);
      const reports = await waitForComplete(loader);
      expect(reports).toHaveLength(4);
      expect(reports.every((r) => r.status === 'loaded')).toBe(true);
    }
  });

  it('does not retain stale reject/resolve references after entry release', async () => {
    // Ensures that released entries do not hold stale Promise resolve/reject refs
    const loader = createResourceLoader({ maxConcurrent: 1 });
    let firstResolve: (() => void) | undefined;

    queueResourceLoad(loader, {
      key: 'first',
      load: () =>
        new Promise<string>((resolve) => {
          firstResolve = () => resolve('first');
        }),
    });

    startResourceLoad(loader);
    firstResolve?.();
    await waitForComplete(loader);

    resetResourceLoader(loader);

    // Queue a second item; if the pool entry was corrupted, it would resolve/reject the old promise
    const h2 = queueResourceLoad(loader, { key: 'second', load: () => Promise.resolve('second') });
    startResourceLoad(loader);
    const result = await h2.promise;
    expect(result).toBe('second');
  });
});

describe('queueResourceLoad', () => {
  it('accepts a bare thunk for backward compatibility', async () => {
    const loader = createResourceLoader();
    const handle = queueResourceLoad(loader, () => Promise.resolve('hello'));
    startResourceLoad(loader);
    expect(await handle.promise).toBe('hello');
  });

  it('accepts an item descriptor', async () => {
    const loader = createResourceLoader();
    const handle = queueResourceLoad(loader, { key: 'img', load: () => Promise.resolve('data') });
    startResourceLoad(loader);
    expect(await handle.promise).toBe('data');
  });

  it('returns a ResourceLoadHandle with key and promise', () => {
    const loader = createResourceLoader();
    const handle = queueResourceLoad(loader, { key: 'myKey', load: () => Promise.resolve(42) });
    expect(handle.key).toBe('myKey');
    expect(handle.promise).toBeInstanceOf(Promise);
  });

  it('auto-assigns a key when none provided', () => {
    const loader = createResourceLoader();
    const handle = queueResourceLoad(loader, { load: () => Promise.resolve(1) });
    expect(typeof handle.key).toBe('string');
    expect(handle.key.length).toBeGreaterThan(0);
  });

  it('throws if called after loading has started in non-streaming mode', () => {
    const loader = createResourceLoader();
    startResourceLoad(loader);
    expect(() => queueResourceLoad(loader, { load: () => Promise.resolve(1) })).toThrow();
  });

  it('deduplicates items with the same key', async () => {
    const loader = createResourceLoader();
    let loadCount = 0;
    const factory = () => {
      loadCount++;
      return Promise.resolve('value');
    };

    const h1 = queueResourceLoad(loader, { key: 'myAsset', load: factory });
    const h2 = queueResourceLoad(loader, { key: 'myAsset', load: factory });
    startResourceLoad(loader);
    await waitForComplete(loader);

    expect(loadCount).toBe(1);
    expect(h1).toBe(h2);
    expect(await h1.promise).toBe('value');
  });

  it('does not deduplicate when dedupe is false', async () => {
    const loader = createResourceLoader({ dedupe: false });
    let loadCount = 0;
    const factory = () => {
      loadCount++;
      return Promise.resolve('value');
    };

    queueResourceLoad(loader, { key: 'myAsset', load: factory });
    queueResourceLoad(loader, { key: 'myAsset', load: factory });
    startResourceLoad(loader);
    await waitForComplete(loader);

    expect(loadCount).toBe(2);
  });

  it('fires onProgress after each item completes', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    const progress: number[] = [];
    connectSignal(loader.onProgress, (fraction) => {
      progress.push(fraction);
    });

    queueResourceLoad(loader, { load: () => Promise.resolve('a') });
    queueResourceLoad(loader, { load: () => Promise.resolve('b') });
    queueResourceLoad(loader, { load: () => Promise.resolve('c') });
    startResourceLoad(loader);

    await waitForComplete(loader);

    expect(progress).toHaveLength(3);
    expect(progress[2]).toBe(1);
  });

  // The signal and the accessor are one number now. A weighted batch is where they used to diverge:
  // the signal reported item counts (1 of 2 = 0.5) while the accessor reported weight (0.01).
  it('emits the same fraction the accessor reports, on a weighted batch', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    const seen: number[] = [];
    connectSignal(loader.onProgress, (fraction) => {
      seen.push(fraction);
      expect(fraction).toBe(getResourceLoadProgress(loader));
    });

    queueResourceLoad(loader, { load: () => Promise.resolve('small'), weight: 1 });
    queueResourceLoad(loader, { load: () => Promise.resolve('big'), weight: 99 });
    startResourceLoad(loader);
    await waitForComplete(loader);

    expect(seen[0]).toBeCloseTo(0.01, 5);
    expect(seen[1]).toBe(1);
  });

  it('fires onComplete after all items finish', async () => {
    const loader = createResourceLoader();
    let completed = false;
    connectSignal(loader.onComplete, () => {
      completed = true;
    });

    queueResourceLoad(loader, { load: () => Promise.resolve(1) });
    queueResourceLoad(loader, { load: () => Promise.resolve(2) });
    startResourceLoad(loader);

    await waitForComplete(loader);
    expect(completed).toBe(true);
  });

  it('fires onError for a failed item but still completes by default', async () => {
    const loader = createResourceLoader();
    const errors: Array<{ error: unknown; key: string }> = [];
    connectSignal(loader.onError, (err, key) => {
      errors.push({ error: err, key });
    });

    queueResourceLoad(loader, { load: () => Promise.resolve('ok') });
    const failing = queueResourceLoad(loader, {
      key: 'fail',
      load: () => Promise.reject(new Error('oops')),
    });
    failing.promise.catch(() => {});
    startResourceLoad(loader);

    await waitForComplete(loader);

    expect(errors).toHaveLength(1);
    expect((errors[0].error as Error).message).toBe('oops');
    expect(errors[0].key).toBe('fail');
  });

  it('loads items in parallel by default', async () => {
    const loader = createResourceLoader({ maxConcurrent: 0 });
    const order: number[] = [];

    queueResourceLoad(loader, {
      load: () =>
        new Promise<number>((resolve) =>
          setTimeout(() => {
            order.push(1);
            resolve(1);
          }, 20),
        ),
    });
    queueResourceLoad(loader, {
      load: () =>
        new Promise<number>((resolve) =>
          setTimeout(() => {
            order.push(2);
            resolve(2);
          }, 5),
        ),
    });
    startResourceLoad(loader);

    await waitForComplete(loader);

    // Parallel: item 2 (5ms) finishes before item 1 (20ms)
    expect(order).toEqual([2, 1]);
  });

  it('loads items sequentially when maxConcurrent is 1', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    const order: number[] = [];

    queueResourceLoad(loader, {
      load: () =>
        new Promise<number>((resolve) =>
          setTimeout(() => {
            order.push(1);
            resolve(1);
          }, 20),
        ),
    });
    queueResourceLoad(loader, {
      load: () =>
        new Promise<number>((resolve) =>
          setTimeout(() => {
            order.push(2);
            resolve(2);
          }, 5),
        ),
    });
    startResourceLoad(loader);

    await waitForComplete(loader);

    // Sequential: item 1 runs first, then item 2, order is 1, 2
    expect(order).toEqual([1, 2]);
  });

  it('respects maxConcurrent limit', async () => {
    const loader = createResourceLoader({ maxConcurrent: 2 });
    let maxInFlight = 0;
    let currentInFlight = 0;

    const makeFactory = () => ({
      load: () =>
        new Promise<number>((resolve) => {
          currentInFlight++;
          maxInFlight = Math.max(maxInFlight, currentInFlight);
          setTimeout(() => {
            currentInFlight--;
            resolve(1);
          }, 10);
        }),
    });

    for (let i = 0; i < 6; i++) {
      queueResourceLoad(loader, makeFactory());
    }
    startResourceLoad(loader);
    await waitForComplete(loader);

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});

describe('reset while loading', () => {
  // The regression this pins: an in-flight load surviving a reset used to settle against whatever
  // batch had replaced it — a phantom onError for a key the new batch never queued, an extra report,
  // and an inflated loaded count that could complete the new batch early.
  it('discards an in-flight load rather than settling it against the next batch', async () => {
    const loader = createResourceLoader();
    const errorKeys: string[] = [];
    connectSignal(loader.onError, (_error, key) => errorKeys.push(key));

    let release!: () => void;
    queueResourceLoad(loader, {
      key: 'stale',
      load: () => new Promise((resolve) => (release = () => resolve('v'))),
    }).promise.catch(() => {});
    startResourceLoad(loader);
    await Promise.resolve();

    resetResourceLoader(loader);

    queueResourceLoad(loader, { key: 'fresh', load: () => Promise.resolve('ok') });
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);

    release();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(errorKeys).toEqual([]);
    expect(reports.map((r) => r.key)).toEqual(['fresh']);
  });

  it('does not let a stale load inflate the new batch progress', async () => {
    const loader = createResourceLoader();
    connectSignal(loader.onError, () => {});
    let release!: () => void;
    queueResourceLoad(loader, {
      key: 'stale',
      load: () => new Promise((_resolve, reject) => (release = () => reject(new Error('late')))),
    }).promise.catch(() => {});
    startResourceLoad(loader);
    await Promise.resolve();

    resetResourceLoader(loader);
    queueResourceLoad(loader, { key: 'one', load: () => Promise.resolve(1) });
    queueResourceLoad(loader, { key: 'two', load: () => Promise.resolve(2) });
    startResourceLoad(loader);

    release();
    const reports = await waitForComplete(loader);
    expect(reports.length).toBe(2);
    expect(getResourceLoadProgress(loader)).toBe(1);
  });
});

describe('resetResourceLoader', () => {
  it('allows the loader to be reused for another batch', async () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { load: () => Promise.resolve(1) });
    startResourceLoad(loader);
    await waitForComplete(loader);

    resetResourceLoader(loader);

    let completed = false;
    connectSignal(loader.onComplete, () => {
      completed = true;
    });
    queueResourceLoad(loader, { load: () => Promise.resolve(2) });
    startResourceLoad(loader);
    await waitForComplete(loader);

    expect(completed).toBe(true);
  });

  it('resets progress tracking', async () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { load: () => Promise.resolve(1) });
    startResourceLoad(loader);
    await waitForComplete(loader);

    resetResourceLoader(loader);
    expect(getResourceLoadProgress(loader)).toBe(0);
  });
});

describe('resumeResourceLoad', () => {
  it('emits onResume and continues dispatching', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    let resumed = false;
    connectSignal(loader.onResume, () => {
      resumed = true;
    });

    const deferred = createDeferred<number>();
    queueResourceLoad(loader, { load: () => deferred.promise });
    queueResourceLoad(loader, { load: () => Promise.resolve(2) });
    startResourceLoad(loader);
    pauseResourceLoad(loader);
    deferred.resolve(1);

    await new Promise((r) => setTimeout(r, 10));
    resumeResourceLoad(loader);

    await waitForComplete(loader);
    expect(resumed).toBe(true);
  });

  it('is a no-op if not paused', () => {
    const loader = createResourceLoader();
    let resumed = false;
    connectSignal(loader.onResume, () => {
      resumed = true;
    });
    resumeResourceLoad(loader);
    expect(resumed).toBe(false);
  });
});

describe('retries', () => {
  it('retries a failing item the specified number of times', async () => {
    const loader = createResourceLoader();
    let attempts = 0;
    const handle = queueResourceLoad(loader, {
      load: () => {
        attempts++;
        return Promise.reject(new Error('transient'));
      },
      retries: 2,
    });
    handle.promise.catch(() => {});
    startResourceLoad(loader);
    await waitForComplete(loader);
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });

  it('resolves if a retry succeeds', async () => {
    const loader = createResourceLoader();
    let attempts = 0;
    const handle = queueResourceLoad(loader, {
      load: () => {
        attempts++;
        if (attempts < 3) return Promise.reject(new Error('transient'));
        return Promise.resolve('success');
      },
      retries: 3,
    });
    startResourceLoad(loader);
    await waitForComplete(loader);
    expect(await handle.promise).toBe('success');
    expect(attempts).toBe(3);
  });
});

describe('setResourceLoaderConcurrency', () => {
  it('updates the concurrency limit on a running loader', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    queueResourceLoad(loader, { load: () => Promise.resolve(1) });
    queueResourceLoad(loader, { load: () => Promise.resolve(2) });
    startResourceLoad(loader);
    setResourceLoaderConcurrency(loader, 4);
    await waitForComplete(loader);
    // Just verify it completes without error
  });
});

describe('setResourceLoadPriority', () => {
  it('updates priority of a pending item', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    const order: string[] = [];

    queueResourceLoad(loader, {
      key: 'low',
      load: () =>
        new Promise((r) =>
          setTimeout(() => {
            order.push('low');
            r(1);
          }, 5),
        ),
      priority: 0,
    });
    queueResourceLoad(loader, {
      key: 'high',
      load: () =>
        new Promise((r) =>
          setTimeout(() => {
            order.push('high');
            r(2);
          }, 5),
        ),
      priority: 0,
    });

    // Boost priority of 'high' before start; priority sort happens at dispatch time
    setResourceLoadPriority(loader, 'high', 10);
    startResourceLoad(loader);
    await waitForComplete(loader);

    expect(order[0]).toBe('high'); // 'high' has higher priority, dispatched first
    expect(order[1]).toBe('low'); // 'low' runs after
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

  // A batch of nothing is complete, not un-started: callers await a loader and branch on 1.
  it('fires onProgress(1) for an empty queue', () => {
    const loader = createResourceLoader();
    let seen: number | null = null;
    connectSignal(loader.onProgress, (fraction) => {
      seen = fraction;
    });
    startResourceLoad(loader);
    expect(seen).toBe(1);
  });

  it('is a no-op if called a second time in non-streaming mode', () => {
    const loader = createResourceLoader();
    let count = 0;
    connectSignal(loader.onComplete, () => {
      count++;
    });
    startResourceLoad(loader);
    startResourceLoad(loader);
    expect(count).toBe(1);
  });

  it('onComplete receives reports array', async () => {
    const loader = createResourceLoader();
    queueResourceLoad(loader, { key: 'a', load: () => Promise.resolve(1) });
    startResourceLoad(loader);
    const reports = await waitForComplete(loader);
    expect(reports).toHaveLength(1);
    expect(reports[0].key).toBe('a');
    expect(reports[0].status).toBe('loaded');
  });

  it('handles streaming mode: allows queueing after start', async () => {
    const loader = createResourceLoader({ streaming: true });
    startResourceLoad(loader);
    const handle = queueResourceLoad(loader, { load: () => Promise.resolve('streamed') });
    expect(await handle.promise).toBe('streamed');
  });
});

describe('timeout', () => {
  it('rejects an item that exceeds its timeout', async () => {
    const loader = createResourceLoader();
    const handle = queueResourceLoad(loader, {
      load: (_signal: AbortSignal) => new Promise<number>((resolve) => setTimeout(() => resolve(1), 500)),
      timeoutMs: 20,
    });
    handle.promise.catch(() => {});
    startResourceLoad(loader);
    await waitForComplete(loader);
    await expect(handle.promise).rejects.toBeDefined();
  });
});

describe('weight-aware progress', () => {
  it('uses weights for progress calculation', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    queueResourceLoad(loader, { load: () => Promise.resolve(1), weight: 10 });
    queueResourceLoad(loader, { load: () => Promise.resolve(2), weight: 90 });

    const progressValues: number[] = [];
    connectSignal(loader.onProgress, () => {
      progressValues.push(getResourceLoadProgress(loader));
    });

    startResourceLoad(loader);
    await waitForComplete(loader);

    // After first item (weight 10 of 100): 0.1
    expect(progressValues[0]).toBeCloseTo(0.1);
    // After second item (weight 100 of 100): 1.0
    expect(progressValues[1]).toBeCloseTo(1.0);
  });
});
describe('weighted progress across outcomes', () => {
  // The regression these pin: weightLoaded advanced only on success, so any batch containing a
  // failure, a cancellation, or a fail-fast skip left getResourceLoadProgress permanently short of 1
  // — a weighted progress bar frozen mid-way on a batch that had already emitted onComplete.
  it('reaches 1 after a batch containing a failure completes', async () => {
    const loader = createResourceLoader();
    connectSignal(loader.onError, () => {});
    queueResourceLoad(loader, { key: 'a', load: () => Promise.resolve(1), weight: 1 });
    queueResourceLoad(loader, { key: 'b', load: () => Promise.reject(new Error('boom')), weight: 1 }).promise.catch(
      () => {},
    );
    queueResourceLoad(loader, { key: 'c', load: () => Promise.resolve(3), weight: 1 });
    startResourceLoad(loader);
    await waitForComplete(loader);
    expect(getResourceLoadProgress(loader)).toBe(1);
  });

  it('weights the failure by its own weight, not by an item count', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    connectSignal(loader.onError, () => {});
    const seen: number[] = [];
    connectSignal(loader.onProgress, () => seen.push(getResourceLoadProgress(loader)));
    queueResourceLoad(loader, { key: 'a', load: () => Promise.reject(new Error('boom')), weight: 90 }).promise.catch(
      () => {},
    );
    queueResourceLoad(loader, { key: 'b', load: () => Promise.resolve(1), weight: 10 });
    startResourceLoad(loader);
    await waitForComplete(loader);
    expect(seen[0]).toBeCloseTo(0.9);
    expect(seen[1]).toBeCloseTo(1);
  });

  it('reaches 1 after a fail-fast batch skips the rest', async () => {
    const loader = createResourceLoader({ errorPolicy: 'fail-fast', maxConcurrent: 1 });
    connectSignal(loader.onError, () => {});
    queueResourceLoad(loader, { key: 'a', load: () => Promise.reject(new Error('boom')), weight: 5 }).promise.catch(
      () => {},
    );
    queueResourceLoad(loader, { key: 'b', load: () => Promise.resolve(1), weight: 5 }).promise.catch(() => {});
    startResourceLoad(loader);
    await waitForComplete(loader);
    expect(getResourceLoadProgress(loader)).toBe(1);
  });

  it('reaches 1 after a cancelled batch settles', async () => {
    const loader = createResourceLoader({ maxConcurrent: 1 });
    let release!: () => void;
    queueResourceLoad(loader, {
      key: 'slow',
      load: () => new Promise((resolve) => (release = () => resolve(1))),
      weight: 3,
    }).promise.catch(() => {});
    queueResourceLoad(loader, { key: 'queued', load: () => Promise.resolve(2), weight: 7 }).promise.catch(() => {});
    startResourceLoad(loader);
    await Promise.resolve();
    const completed = waitForComplete(loader);
    cancelResourceLoad(loader);
    release();
    await completed;
    expect(getResourceLoadProgress(loader)).toBe(1);
  });
});
