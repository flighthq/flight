import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  ResourceLoadBytes,
  ResourceLoadBytesReporter,
  ResourceLoadCounts,
  ResourceLoadHandle,
  ResourceLoadItem,
  ResourceLoadItemStatus,
  ResourceLoadReport,
  ResourceLoader,
  ResourceLoaderItemSignals,
  ResourceLoaderOptions,
  EntityConstruction,
} from '@flighthq/types/contract';

// Internal key prefix for auto-assigned keys
const AUTO_KEY_PREFIX = '__item_';

interface PendingEntry {
  abortController: AbortController;
  bytesHint: number;
  bytesLoaded: number;
  // The loader generation this entry belongs to. resetResourceLoader bumps the loader's generation,
  // which orphans every entry already in flight: their eventual settlement finds a stale stamp and is
  // discarded instead of being recorded against the batch that replaced them.
  generation: number;
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
  wrappedLoad: (signal: AbortSignal, reportBytes: ResourceLoadBytesReporter) => Promise<unknown>;
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
    generation: 0,
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
  generation: number;
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
  if (internal.cancelled) return;
  // Cancelling before start is a real cancellation, not a no-op. It used to return early, which left
  // every queued handle's promise pending forever — a caller that queued a batch, changed its mind,
  // and awaited the handles deadlocked. A cancel that does not cancel is the half-wired feature this
  // package's charter calls a defect outright.
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
    _countEntrySettled(internal, entry);
    releasePendingEntry(entry);
  }
  internal.pending = [];

  emitSignal(loader.onCancel);

  // Complete immediately if nothing is currently running
  if (internal.inFlight.size === 0) {
    emitSignal(loader.onProgress, getResourceLoadProgress(loader));
    emitSignal(loader.onComplete, internal.reports);
  }
}

export function createResourceLoader(options?: Readonly<ResourceLoaderOptions>): ResourceLoader {
  const out = allocateEntity<ResourceLoaderInternal>();
  initializeResourceLoader(out, options);
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
    internal.itemSignals = (() => {
      const out = allocateEntity<ResourceLoaderItemSignals>();
      out.onItemComplete = createSignal();
      out.onItemError = createSignal();
      out.onItemRetry = createSignal();
      out.onItemStart = createSignal();
      return finishEntity(out);
    })();
  }
  return internal.itemSignals;
}

export function getResourceLoadBytes(loader: Readonly<ResourceLoader>): ResourceLoadBytes {
  const internal = loader as ResourceLoaderInternal;
  let bytesLoaded = 0;
  let bytesTotalKnown = 0;
  let itemsWithKnownBytes = 0;
  // Settled items contribute their measured transfer; in-flight and queued contribute what they have
  // reported and what they declared. A hint counts as known even before the item starts, which is what
  // lets the known total grow ahead of the bytes rather than lag them.
  for (const report of internal.reports) {
    bytesLoaded += report.bytes;
    if (report.bytes > 0) {
      bytesTotalKnown += report.bytes;
      itemsWithKnownBytes++;
    }
  }
  for (const entry of internal.inFlight) {
    bytesLoaded += entry.bytesLoaded;
    if (entry.bytesHint > 0) {
      bytesTotalKnown += entry.bytesHint;
      itemsWithKnownBytes++;
    }
  }
  for (const entry of internal.pending) {
    if (entry.bytesHint > 0) {
      bytesTotalKnown += entry.bytesHint;
      itemsWithKnownBytes++;
    }
  }
  return { bytesLoaded, bytesTotalKnown, itemsWithKnownBytes };
}

export function getResourceLoadCounts(loader: Readonly<ResourceLoader>): ResourceLoadCounts {
  const internal = loader as ResourceLoaderInternal;
  const settledItems = internal.reports.length;
  const inFlightItems = internal.inFlight.size;
  const queuedItems = internal.pending.length;
  return {
    settledItems,
    inFlightItems,
    queuedItems,
    totalItems: settledItems + inFlightItems + queuedItems,
  };
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

// The 0..1 completion fraction, and the single answer to "how far along is this batch" — the same
// number `onProgress` emits. Weighted by each item's `weight` (default 1), so an unweighted batch is
// the item fraction and a weighted one reflects the work the caller said each item represents.
//
// Weight is the contract currency because it is knowable before the first byte moves: the caller
// supplies it, so the bar starts at a truthful 0 and never rescales. Bytes cannot play that role —
// `bytesHint` is optional per item, so a byte denominator grows as headers arrive and the bar slides
// backwards. Bytes are reporting, via `getResourceLoadBytes`; counts are a separate question, via
// `getResourceLoadCounts`.
//
// Never returns NaN: every division below is guarded by the zero check in front of it.
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

  // A batch of nothing is complete rather than un-started: callers await a loader and branch on 1, and
  // reporting 0 for an empty batch would strand that. Also the only guard against dividing by zero on
  // `total` below.
  if (internal.total === 0) return 1;
  if (internal.totalWeight > 0) {
    return internal.weightLoaded / internal.totalWeight;
  }
  // Reached only when every item was explicitly given `weight: 0`, which makes the weighted fraction
  // undefined; the item fraction is the sensible answer for a batch that declined to weight itself.
  return internal.loaded / internal.total;
}

export function initializeResourceLoader(
  out: EntityConstruction<ResourceLoaderInternal>,
  options?: Readonly<ResourceLoaderOptions>,
): void {
  const opts = options ?? {};
  const throttle =
    opts.maxBytesPerSecond !== undefined && opts.maxBytesPerSecond > 0
      ? createTokenBucket(opts.maxBytesPerSecond)
      : null;
  out.cancelled = false;
  out.dedupeMap = new Map();
  out.errorPolicy = opts.errorPolicy ?? 'continue';
  out.generation = 0;
  out.inFlight = new Set();
  out.itemCounter = 0;
  out.itemSignals = null;
  out.loaded = 0;
  out.maxConcurrent = opts.maxConcurrent ?? 6;
  out.onCancel = createSignal();
  out.onComplete = createSignal();
  out.onError = createSignal();
  out.onPause = createSignal();
  out.onProgress = createSignal();
  out.onResume = createSignal();
  out.options = opts;
  out.paused = false;
  out.pending = [];
  out.reports = [];
  out.started = false;
  out.streaming = opts.streaming ?? false;
  out.throttle = throttle;
  out.total = 0;
  out.totalWeight = 0;
  out.weightLoaded = 0;
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
  entry.generation = internal.generation;
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
  entry.wrappedLoad = descriptor.load as (
    signal: AbortSignal,
    reportBytes: ResourceLoadBytesReporter,
  ) => Promise<unknown>;

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
  // Bump the generation first: every entry already dispatched is now orphaned, so when its abort
  // finally rejects, runEntry discards it instead of recording a failure against the batch that
  // replaced it. Without this an in-flight load surviving a reset lands on the *next* batch — a
  // phantom onError for a key the new batch never queued, an extra report, and an inflated loaded
  // count that can complete the new batch early.
  internal.generation++;
  // Abort all in-flight loads before reset. They are not released here: they are still running, and
  // returning them to the pool would hand a live entry to the next queueResourceLoad.
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
    emitSignal(loader.onProgress, getResourceLoadProgress(loader));
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
  if (_isOrphaned(entry, internal)) {
    releasePendingEntry(entry);
    return;
  }
  if (internal.itemSignals !== null) {
    emitSignal(internal.itemSignals.onItemStart, entry.key);
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const signal = entry.abortController.signal;

  // The byte reporter handed to this attempt. It is scoped to the attempt rather than to the entry
  // because entries are pooled: a factory that reports after settling — a stream that flushes late, a
  // retry whose predecessor is still draining — would otherwise write a byte count into whichever
  // item had since been handed that record. `live` is closed over, so the report simply stops
  // counting once the attempt is done, which is the honest answer for a figure nobody is waiting on.
  let live = true;
  const reportBytes: ResourceLoadBytesReporter = (loaded, total) => {
    if (!live) return;
    entry.bytesLoaded = loaded;
    entry.onBytesProgress?.(loaded, total ?? entry.bytesHint);
  };

  // Apply timeout if configured
  if (entry.timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      entry.abortController.abort(new DOMException('Load timed out', 'TimeoutError'));
    }, entry.timeoutMs);
  }

  try {
    // Race the factory against the abort signal so cancellation/timeout is always honored,
    // even if the factory itself does not check the signal.
    const value = await Promise.race([entry.wrappedLoad(signal, reportBytes), abortSignalPromise(signal)]);

    if (timeoutId !== undefined) clearTimeout(timeoutId);
    live = false;

    if (_isOrphaned(entry, internal)) {
      internal.inFlight.delete(entry);
      releasePendingEntry(entry);
      return;
    }

    // If cancelled between the race resolving and here, treat as cancelled
    if (internal.cancelled) {
      internal.inFlight.delete(entry);
      _countEntrySettled(internal, entry);
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

    entry.resolve(value);

    if (internal.itemSignals !== null) {
      emitSignal(internal.itemSignals.onItemComplete, entry.key, value);
    }

    settleEntry(entry, internal, loader);
  } catch (error) {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    live = false;

    if (_isOrphaned(entry, internal)) {
      internal.inFlight.delete(entry);
      releasePendingEntry(entry);
      return;
    }

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
      _countEntrySettled(internal, entry);
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
        _countEntrySettled(internal, entry);
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

// Records one entry as finished, whatever its outcome. Both counters advance together and in exactly
// one place, because "how much of the batch is done" is one question with two units: `loaded` counts
// items, `weightLoaded` counts the weight the caller assigned them.
//
// The weight half used to advance only on success, so any batch containing a failure or a cancellation
// left getResourceLoadProgress permanently short of 1 — a weighted progress bar stuck at 0.67 on a
// batch that had already emitted onComplete. A failed item is still a finished item; progress measures
// completion, not success. (The per-item outcome is in its ResourceLoadReport.status, which is where a
// caller asks whether the batch went well.)
function _countEntrySettled(internal: ResourceLoaderInternal, entry: Readonly<PendingEntry>): void {
  internal.loaded++;
  internal.weightLoaded += entry.weight;
}

// True when `entry` was dispatched under a previous generation — i.e. resetResourceLoader ran while it
// was in flight — so nothing it reports belongs to the current batch.
function _isOrphaned(entry: Readonly<PendingEntry>, internal: Readonly<ResourceLoaderInternal>): boolean {
  return entry.generation !== internal.generation;
}

function checkCompleteAfterCancel(internal: ResourceLoaderInternal, loader: ResourceLoader): void {
  if (internal.inFlight.size === 0) {
    emitSignal(loader.onProgress, getResourceLoadProgress(loader));
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
    _countEntrySettled(internal, entry);
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
  _countEntrySettled(internal, entry);
  emitSignal(loader.onProgress, getResourceLoadProgress(loader));

  releasePendingEntry(entry);

  if (internal.loaded === internal.total) {
    emitSignal(loader.onComplete, internal.reports);
    return;
  }

  // Drain more items if available
  void drainQueue(internal, loader);
}
