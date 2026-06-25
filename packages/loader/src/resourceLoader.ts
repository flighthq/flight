import { clearSignal, createSignal, emitSignal } from '@flighthq/signals';
import type {
  ResourceLoader,
  ResourceLoaderItemSignals,
  ResourceLoaderOptions,
  ResourceLoadHandle,
  ResourceLoadItem,
  ResourceLoadItemStatus,
  ResourceLoadReport,
} from '@flighthq/types';

// Internal key prefix for auto-assigned keys
const AUTO_KEY_PREFIX = '__item_';

interface PendingEntry {
  abortController: AbortController;
  bytesHint: number;
  bytesLoaded: number;
  group: string | undefined;
  key: string;
  onBytesProgress: ((loaded: number, total: number) => void) | undefined;
  priority: number;
  reject: (error: unknown) => void;
  resolve: (value: unknown) => void;
  retries: number;
  startedAt: number;
  timeoutMs: number;
  weight: number;
  wrappedLoad: (signal: AbortSignal) => Promise<unknown>;
}

// Pool for PendingEntry objects — avoids per-item allocation on the hot-path drain.
// Each acquire fills in all fields before use; release clears references to prevent GC leaks.
const pendingEntryPool: PendingEntry[] = [];

function acquirePendingEntry(): PendingEntry {
  const entry = pendingEntryPool.pop();
  if (entry !== undefined) return entry;
  return {
    abortController: new AbortController(),
    bytesHint: 0,
    bytesLoaded: 0,
    group: undefined,
    key: '',
    onBytesProgress: undefined,
    priority: 0,
    reject: _noop,
    resolve: _noop,
    retries: 0,
    startedAt: 0,
    timeoutMs: 0,
    weight: 1,
    wrappedLoad: _noopLoad,
  };
}

function releasePendingEntry(entry: PendingEntry): void {
  // Clear references to prevent GC leaks; primitive fields can stay
  entry.onBytesProgress = undefined;
  entry.reject = _noop;
  entry.resolve = _noop;
  entry.wrappedLoad = _noopLoad;
  // Replace with a fresh AbortController for next use
  entry.abortController = new AbortController();
  pendingEntryPool.push(entry);
}

function _noop(_value?: unknown): void {}
function _noopLoad(_signal: AbortSignal): Promise<unknown> {
  return Promise.resolve(undefined);
}

// Token-bucket state for bandwidth throttling
interface TokenBucket {
  lastRefillMs: number;
  maxBytesPerSecond: number;
  tokens: number;
}

function createTokenBucket(maxBytesPerSecond: number): TokenBucket {
  return {
    lastRefillMs: Date.now(),
    maxBytesPerSecond,
    tokens: maxBytesPerSecond, // Start with a full bucket
  };
}

function refillTokens(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(bucket.maxBytesPerSecond, bucket.tokens + elapsed * bucket.maxBytesPerSecond);
  bucket.lastRefillMs = now;
}

// Returns delay in ms until enough tokens are available for the given cost.
// Returns 0 if sufficient tokens are already available.
function tokenBucketDelayMs(bucket: TokenBucket, cost: number): number {
  refillTokens(bucket);
  if (cost === 0 || bucket.tokens >= cost) return 0;
  const deficit = cost - bucket.tokens;
  return Math.ceil((deficit / bucket.maxBytesPerSecond) * 1000);
}

function consumeTokens(bucket: TokenBucket, cost: number): void {
  bucket.tokens = Math.max(0, bucket.tokens - cost);
}

interface ResourceLoaderInternal extends ResourceLoader {
  cancelled: boolean;
  dedupeMap: Map<string, ResourceLoadHandle<unknown>>;
  errorPolicy: 'continue' | 'fail-fast';
  inFlight: Set<PendingEntry>;
  itemCounter: number;
  itemSignals: ResourceLoaderItemSignals | null;
  loaded: number;
  maxConcurrent: number;
  options: Readonly<ResourceLoaderOptions>;
  paused: boolean;
  pending: PendingEntry[];
  reports: ResourceLoadReport[];
  started: boolean;
  streaming: boolean;
  throttle: TokenBucket | null;
  total: number;
  totalWeight: number;
  weightLoaded: number;
}

export function cancelResourceLoad(loader: ResourceLoader): void {
  const internal = loader as ResourceLoaderInternal;
  if (!internal.started || internal.cancelled) return;
  internal.cancelled = true;

  const cancelError = new DOMException('Load cancelled', 'AbortError');

  // Abort all in-flight entries — runEntry will catch the abort and call checkCompleteAfterCancel
  for (const entry of internal.inFlight) {
    entry.abortController.abort(cancelError);
  }

  // Record and reject all not-yet-dispatched pending entries
  for (const entry of internal.pending) {
    entry.abortController.abort(cancelError);
    const report: ResourceLoadReport = {
      attempts: 0,
      bytes: 0,
      elapsedMs: 0,
      group: entry.group,
      key: entry.key,
      status: 'cancelled',
    };
    internal.reports.push(report);
    entry.reject(cancelError);
    internal.loaded++;
    releasePendingEntry(entry);
  }
  internal.pending = [];

  emitSignal(loader.onCancel);

  // Complete immediately if nothing is currently running
  if (internal.inFlight.size === 0) {
    emitSignal(loader.onProgress, internal.loaded, internal.total);
    emitSignal(loader.onComplete, internal.reports);
  }
}

export function createResourceLoader(options?: Readonly<ResourceLoaderOptions>): ResourceLoader {
  const opts = options ?? {};
  const throttle =
    opts.maxBytesPerSecond !== undefined && opts.maxBytesPerSecond > 0
      ? createTokenBucket(opts.maxBytesPerSecond)
      : null;
  const out: ResourceLoaderInternal = {
    cancelled: false,
    dedupeMap: new Map(),
    errorPolicy: opts.errorPolicy ?? 'continue',
    inFlight: new Set(),
    itemCounter: 0,
    itemSignals: null,
    loaded: 0,
    maxConcurrent: opts.maxConcurrent ?? 6,
    onCancel: createSignal(),
    onComplete: createSignal(),
    onError: createSignal(),
    onPause: createSignal(),
    onProgress: createSignal(),
    onResume: createSignal(),
    options: opts,
    paused: false,
    pending: [],
    reports: [],
    started: false,
    streaming: opts.streaming ?? false,
    throttle,
    total: 0,
    totalWeight: 0,
    weightLoaded: 0,
  };
  return out;
}

export function disposeResourceLoader(loader: ResourceLoader): void {
  clearSignal(loader.onCancel);
  clearSignal(loader.onComplete);
  clearSignal(loader.onError);
  clearSignal(loader.onPause);
  clearSignal(loader.onProgress);
  clearSignal(loader.onResume);

  const internal = loader as ResourceLoaderInternal;
  if (internal.itemSignals !== null) {
    clearSignal(internal.itemSignals.onItemComplete);
    clearSignal(internal.itemSignals.onItemError);
    clearSignal(internal.itemSignals.onItemRetry);
    clearSignal(internal.itemSignals.onItemStart);
  }
}

export function enableResourceLoaderItemSignals(loader: ResourceLoader): ResourceLoaderItemSignals {
  const internal = loader as ResourceLoaderInternal;
  if (internal.itemSignals === null) {
    internal.itemSignals = {
      onItemComplete: createSignal(),
      onItemError: createSignal(),
      onItemRetry: createSignal(),
      onItemStart: createSignal(),
    };
  }
  return internal.itemSignals;
}

export function getResourceLoadItemStatus(loader: ResourceLoader, key: string): ResourceLoadItemStatus {
  const internal = loader as ResourceLoaderInternal;
  const report = internal.reports.find((r) => r.key === key);
  if (report !== undefined) return report.status;
  if (internal.pending.some((p) => p.key === key)) return 'pending';
  for (const entry of internal.inFlight) {
    if (entry.key === key) return 'running';
  }
  return 'pending';
}

export function getResourceLoadProgress(loader: ResourceLoader, group?: string): number {
  const internal = loader as ResourceLoaderInternal;
  if (!internal.started) return 0;

  if (group !== undefined) {
    const groupReports = internal.reports.filter((r) => r.group === group);
    const groupPending = internal.pending.filter((p) => p.group === group);
    let groupInFlight = 0;
    for (const entry of internal.inFlight) {
      if (entry.group === group) groupInFlight++;
    }
    const groupTotal = groupReports.length + groupPending.length + groupInFlight;
    if (groupTotal === 0) return 0;
    return groupReports.length / groupTotal;
  }

  if (internal.total === 0) return 1;
  if (internal.totalWeight > 0) {
    return internal.weightLoaded / internal.totalWeight;
  }
  return internal.loaded / internal.total;
}

export function pauseResourceLoad(loader: ResourceLoader): void {
  const internal = loader as ResourceLoaderInternal;
  if (!internal.started || internal.paused || internal.cancelled) return;
  internal.paused = true;
  emitSignal(loader.onPause);
}

export function queueResourceLoad<T>(
  loader: ResourceLoader,
  item: Readonly<ResourceLoadItem<T>> | (() => Promise<T>),
): ResourceLoadHandle<T> {
  const internal = loader as ResourceLoaderInternal;

  if (internal.started && !internal.streaming) {
    throw new Error('Cannot queue resources after loading has started');
  }

  // Normalize thunk to descriptor
  const descriptor: ResourceLoadItem<T> =
    typeof item === 'function' ? { load: (_signal: AbortSignal) => (item as () => Promise<T>)() } : item;

  const key = descriptor.key ?? `${AUTO_KEY_PREFIX}${internal.itemCounter++}`;
  const weight = descriptor.weight ?? 1;
  const priority = descriptor.priority ?? 0;
  const retries = descriptor.retries ?? internal.options.retries ?? 0;
  const timeoutMs = descriptor.timeoutMs ?? internal.options.timeoutMs ?? 0;
  const group = descriptor.group;
  const bytesHint = descriptor.bytesHint ?? 0;
  const onBytesProgress = descriptor.onBytesProgress;

  // Deduplication
  const dedupe = internal.options.dedupe !== false;
  if (dedupe && descriptor.key !== undefined) {
    const existing = internal.dedupeMap.get(key);
    if (existing !== undefined) return existing as ResourceLoadHandle<T>;
  }

  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res as (value: unknown) => void;
    reject = rej;
  });

  const entry = acquirePendingEntry();
  // AbortController is fresh from acquirePendingEntry / releasePendingEntry
  entry.bytesHint = bytesHint;
  entry.bytesLoaded = 0;
  entry.group = group;
  entry.key = key;
  entry.onBytesProgress = onBytesProgress;
  entry.priority = priority;
  entry.reject = reject;
  entry.resolve = resolve;
  entry.retries = retries;
  entry.startedAt = 0;
  entry.timeoutMs = timeoutMs;
  entry.weight = weight;
  entry.wrappedLoad = descriptor.load as (signal: AbortSignal) => Promise<unknown>;

  internal.pending.push(entry);
  internal.total++;
  internal.totalWeight += weight;

  const handle: ResourceLoadHandle<T> = { key, promise };

  if (dedupe && descriptor.key !== undefined) {
    internal.dedupeMap.set(key, handle as ResourceLoadHandle<unknown>);
  }

  // If streaming and started, try to dispatch immediately
  if (internal.started && internal.streaming) {
    void drainQueue(internal, loader);
  }

  return handle;
}

export function resetResourceLoader(loader: ResourceLoader): void {
  const internal = loader as ResourceLoaderInternal;
  // Abort all in-flight loads before reset
  for (const entry of internal.inFlight) {
    entry.abortController.abort();
  }
  for (const entry of internal.pending) {
    entry.abortController.abort();
    releasePendingEntry(entry);
  }
  internal.cancelled = false;
  internal.dedupeMap.clear();
  internal.inFlight.clear();
  internal.loaded = 0;
  internal.paused = false;
  internal.pending = [];
  internal.reports = [];
  internal.started = false;
  internal.total = 0;
  internal.totalWeight = 0;
  internal.weightLoaded = 0;
  // Reset throttle bucket if present
  if (internal.throttle !== null) {
    internal.throttle.tokens = internal.throttle.maxBytesPerSecond;
    internal.throttle.lastRefillMs = Date.now();
  }
}

export function resumeResourceLoad(loader: ResourceLoader): void {
  const internal = loader as ResourceLoaderInternal;
  if (!internal.paused || internal.cancelled) return;
  internal.paused = false;
  emitSignal(loader.onResume);
  void drainQueue(internal, loader);
}

export function setResourceLoaderConcurrency(loader: ResourceLoader, maxConcurrent: number): void {
  const internal = loader as ResourceLoaderInternal;
  internal.maxConcurrent = maxConcurrent;
  // If more slots are now available, drain the queue
  if (internal.started && !internal.paused && !internal.cancelled) {
    void drainQueue(internal, loader);
  }
}

export function setResourceLoadPriority(loader: ResourceLoader, key: string, priority: number): void {
  const internal = loader as ResourceLoaderInternal;
  const entry = internal.pending.find((p) => p.key === key);
  if (entry !== undefined) {
    entry.priority = priority;
  }
}

export function startResourceLoad(loader: ResourceLoader): void {
  const internal = loader as ResourceLoaderInternal;
  if (internal.started && !internal.streaming) return;
  internal.started = true;

  if (internal.total === 0) {
    emitSignal(loader.onProgress, 0, 0);
    emitSignal(loader.onComplete, []);
    return;
  }

  void drainQueue(internal, loader);
}

// Sort pending items by priority (higher = first), then insertion order
function sortPendingByPriority(pending: PendingEntry[]): void {
  pending.sort((a, b) => b.priority - a.priority);
}

async function drainQueue(internal: ResourceLoaderInternal, loader: ResourceLoader): Promise<void> {
  const maxConcurrent = internal.maxConcurrent <= 0 ? Infinity : internal.maxConcurrent;

  while (
    internal.pending.length > 0 &&
    !internal.paused &&
    !internal.cancelled &&
    internal.inFlight.size < maxConcurrent
  ) {
    sortPendingByPriority(internal.pending);
    const entry = internal.pending[0];
    if (entry === undefined) break;

    // Token-bucket throttle: if a bytesHint is set and we have a throttle, check available tokens
    if (internal.throttle !== null && entry.bytesHint > 0) {
      const waitMs = tokenBucketDelayMs(internal.throttle, entry.bytesHint);
      if (waitMs > 0) {
        // Wait for tokens to refill, then try again
        await delay(waitMs);
        // Re-check state after the delay
        if (internal.paused || internal.cancelled || internal.pending.length === 0) break;
        continue;
      }
      consumeTokens(internal.throttle, entry.bytesHint);
    }

    internal.pending.shift();
    internal.inFlight.add(entry);
    entry.startedAt = Date.now();
    void runEntry(entry, internal, loader, 0);
  }
}

// Returns a promise that rejects when the abort signal fires
function abortSignalPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

async function runEntry(
  entry: PendingEntry,
  internal: ResourceLoaderInternal,
  loader: ResourceLoader,
  attempt: number,
): Promise<void> {
  if (internal.itemSignals !== null) {
    emitSignal(internal.itemSignals.onItemStart, entry.key);
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const signal = entry.abortController.signal;

  // Apply timeout if configured
  if (entry.timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      entry.abortController.abort(new DOMException('Load timed out', 'TimeoutError'));
    }, entry.timeoutMs);
  }

  try {
    // Race the factory against the abort signal so cancellation/timeout is always honored,
    // even if the factory itself does not check the signal.
    // Bytes tracking: factories that report sub-item progress call `descriptor.onBytesProgress`
    // from their own closure. The entry's `onBytesProgress` is a tracking shim (set up in
    // queueResourceLoad) that also writes `entry.bytesLoaded`, enabling the report's `bytes`
    // field. Factories that do not call `onBytesProgress` leave `entry.bytesLoaded` at 0.
    const value = await Promise.race([entry.wrappedLoad(signal), abortSignalPromise(signal)]);

    if (timeoutId !== undefined) clearTimeout(timeoutId);

    // If cancelled between the race resolving and here, treat as cancelled
    if (internal.cancelled) {
      internal.inFlight.delete(entry);
      internal.loaded++;
      releasePendingEntry(entry);
      checkCompleteAfterCancel(internal, loader);
      return;
    }

    const elapsedMs = Date.now() - entry.startedAt;
    const report: ResourceLoadReport = {
      attempts: attempt + 1,
      bytes: entry.bytesLoaded,
      elapsedMs,
      group: entry.group,
      key: entry.key,
      status: 'loaded',
    };
    internal.reports.push(report);
    internal.weightLoaded += entry.weight;

    entry.resolve(value);

    if (internal.itemSignals !== null) {
      emitSignal(internal.itemSignals.onItemComplete, entry.key, value);
    }

    settleEntry(entry, internal, loader);
  } catch (error) {
    if (timeoutId !== undefined) clearTimeout(timeoutId);

    // If cancelled, record as cancelled and update batch completion
    if (internal.cancelled) {
      const report: ResourceLoadReport = {
        attempts: attempt + 1,
        bytes: entry.bytesLoaded,
        elapsedMs: Date.now() - entry.startedAt,
        group: entry.group,
        key: entry.key,
        status: 'cancelled',
      };
      internal.reports.push(report);
      entry.reject(error);
      internal.inFlight.delete(entry);
      internal.loaded++;
      releasePendingEntry(entry);
      checkCompleteAfterCancel(internal, loader);
      return;
    }

    const isAbortOrTimeout =
      error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');

    // Retry on any non-abort/timeout error
    if (attempt < entry.retries && !isAbortOrTimeout) {
      const delayMs = computeRetryDelay(attempt, internal);

      if (internal.itemSignals !== null) {
        emitSignal(internal.itemSignals.onItemRetry, entry.key, attempt + 1, delayMs);
      }

      await delay(delayMs);

      // Check again after delay in case cancelled
      if (internal.cancelled) {
        internal.inFlight.delete(entry);
        internal.loaded++;
        releasePendingEntry(entry);
        checkCompleteAfterCancel(internal, loader);
        return;
      }

      void runEntry(entry, internal, loader, attempt + 1);
      return;
    }

    // Hard failure
    const elapsedMs = Date.now() - entry.startedAt;
    const report: ResourceLoadReport = {
      attempts: attempt + 1,
      bytes: entry.bytesLoaded,
      elapsedMs,
      group: entry.group,
      key: entry.key,
      status: 'failed',
    };
    internal.reports.push(report);

    if (internal.itemSignals !== null) {
      emitSignal(internal.itemSignals.onItemError, entry.key, error, attempt + 1);
    }

    entry.reject(error);
    emitSignal(loader.onError, error, entry.key);

    // Fail-fast: cancel remaining pending loads before settling
    if (internal.errorPolicy === 'fail-fast') {
      cancelRemainingEntries(internal);
      settleEntry(entry, internal, loader);
      return;
    }

    settleEntry(entry, internal, loader);
  }
}

function checkCompleteAfterCancel(internal: ResourceLoaderInternal, loader: ResourceLoader): void {
  if (internal.inFlight.size === 0) {
    emitSignal(loader.onProgress, internal.loaded, internal.total);
    emitSignal(loader.onComplete, internal.reports);
  }
}

function cancelRemainingEntries(internal: ResourceLoaderInternal): void {
  for (const entry of internal.pending) {
    entry.abortController.abort();
    const report: ResourceLoadReport = {
      attempts: 0,
      bytes: 0,
      elapsedMs: 0,
      group: entry.group,
      key: entry.key,
      status: 'skipped',
    };
    internal.reports.push(report);
    entry.reject(new DOMException('Load skipped due to fail-fast error policy', 'AbortError'));
    internal.loaded++;
    releasePendingEntry(entry);
  }
  internal.pending = [];
}

function computeRetryDelay(attempt: number, internal: ResourceLoaderInternal): number {
  const backoff = internal.options.retryBackoff ?? 'none';
  const baseMs = internal.options.retryBaseDelayMs ?? 100;
  const maxMs = internal.options.retryMaxDelayMs ?? 10000;

  if (backoff === 'none') return 0;
  if (backoff === 'linear') return Math.min(baseMs * (attempt + 1), maxMs);
  // exponential
  return Math.min(baseMs * Math.pow(2, attempt), maxMs);
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function settleEntry(entry: PendingEntry, internal: ResourceLoaderInternal, loader: ResourceLoader): void {
  internal.inFlight.delete(entry);
  internal.loaded++;
  emitSignal(loader.onProgress, internal.loaded, internal.total);

  releasePendingEntry(entry);

  if (internal.loaded === internal.total) {
    emitSignal(loader.onComplete, internal.reports);
    return;
  }

  // Drain more items if available
  void drainQueue(internal, loader);
}
