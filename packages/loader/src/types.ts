// The loader-owned contracts. They import nothing from @flighthq/types, which re-exports them
// type-only for compatibility.

import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

interface LoaderEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export type ResourceLoadItemStatus = 'cancelled' | 'failed' | 'loaded' | 'pending' | 'running' | 'skipped';

// What a load knows about its own byte volume. The shape is deliberately not `loaded`/`total`: byte
// totals are not knowable up front, because `bytesHint` is optional per item and a factory may report
// only how much has arrived. Presenting partial knowledge as a denominator produces a bar that
// rescales downward as more headers arrive, which reads as progress going backwards.
//
// So the known part is labeled as known, and the caller decides whether it is enough to divide by.
// `getResourceLoadProgress` remains the honest 0..1 figure; these are for display detail.
export interface ResourceLoadBytes {
  // Bytes transferred so far across the whole load. Summed from what each item has reported, so it is
  // always valid and only ever grows — usable on its own as a "12.4 MB downloaded" readout.
  bytesLoaded: number;
  // The total for the items whose size is known, from `bytesHint` or a factory that reported one.
  // Grows as more items declare a size, so it is a floor on the eventual total, never the total.
  bytesTotalKnown: number;
  // How many items contributed to `bytesTotalKnown`. Compare against `ResourceLoadCounts.totalItems`
  // to judge whether the known total covers enough of the batch to divide by.
  itemsWithKnownBytes: number;
}

// How a load factory reports its own progress in bytes.
//
// Passed to `ResourceLoadItem.load` as a second argument, which is why the seam is additive: a factory
// written against the one-argument form keeps working untouched and simply never reports. Only a
// factory that can actually observe its transfer — a fetch reading a stream, an XHR with a progress
// event — has anything to say, and the loader cannot know the byte count on its behalf.
//
// `total` is optional: a source that knows only how much has arrived so far omits it, and the item's
// `bytesHint` stands in. Calls after the load settles are ignored rather than trusted, because the
// loader recycles its per-item records and a late report would otherwise write into another item's.
export type ResourceLoadBytesReporter = (loaded: number, total?: number) => void;

export interface ResourceLoadItem<T> {
  bytesHint?: number;
  group?: string;
  key?: string;
  // Performs the load. `signal` aborts it; `reportBytes` is how it reports its own transfer progress,
  // and a factory with nothing to report simply declares one parameter and ignores it.
  load: (signal: AbortSignal, reportBytes: ResourceLoadBytesReporter) => Promise<T>;
  // Called with each figure the factory reports through `reportBytes`. `total` falls back to
  // `bytesHint` when the factory reports only how much has arrived.
  onBytesProgress?: (loaded: number, total: number) => void;
  priority?: number;
  retries?: number;
  timeoutMs?: number;
  weight?: number;
}

export interface ResourceLoadHandle<T> {
  key: string;
  promise: Promise<T>;
}

// How many items a load is made of, split by where each one currently sits. Counts answer "3 of 12
// files" — a different question from progress, which is `getResourceLoadProgress`. They are reported
// separately rather than through the progress signal precisely so a caller has to say which one it
// wants; conflating them is what let a progress bar and a counter disagree.
export interface ResourceLoadCounts {
  // Items that have finished, whatever the outcome. A failed or skipped item is settled: this counts
  // completion, not success. Per-item outcomes live in `ResourceLoadReport.status`.
  settledItems: number;
  // Items currently being loaded. Distinct from `queuedItems` because a concurrency limit means most
  // of a queued batch is waiting rather than running, and a UI that shows "loading 4 of 200" means
  // this number, not the queue depth.
  inFlightItems: number;
  // Items accepted but not yet started.
  queuedItems: number;
  // Every item the loader knows about: settled + in-flight + queued.
  totalItems: number;
}

export interface ResourceLoadReport {
  attempts: number;
  bytes: number;
  elapsedMs: number;
  group: string | undefined;
  key: string;
  status: ResourceLoadReportStatus;
}

export type ResourceLoadReportStatus = 'cancelled' | 'failed' | 'loaded' | 'skipped';

export interface ResourceLoaderOptions {
  dedupe?: boolean;
  errorPolicy?: 'continue' | 'fail-fast';
  maxBytesPerSecond?: number;
  maxConcurrent?: number;
  retries?: number;
  retryBackoff?: 'exponential' | 'linear' | 'none';
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  streaming?: boolean;
  timeoutMs?: number;
}

export interface LoadProgress {
  readonly url: string;
  readonly loaded: number;
  readonly total: number;
  readonly phase: 'download' | 'upload';
}
export interface LoadOptions {
  readonly signal?: AbortSignal;
  readonly progress?: Signal<Readonly<LoadProgress>>;
}

export interface ResourceLoaderItemSignals extends LoaderEntity {
  onItemComplete: Signal<readonly [string, unknown]>;
  onItemError: Signal<readonly [string, unknown, number]>;
  onItemRetry: Signal<readonly [string, number, number]>;
  onItemStart: Signal<string>;
}

export interface ResourceLoader extends LoaderEntity {
  onCancel: Signal<void>;
  onComplete: Signal<readonly ResourceLoadReport[]>;
  onError: Signal<readonly [unknown, string]>;
  onPause: Signal<void>;
  // The 0..1 weighted fraction — the same number `getResourceLoadProgress` returns, so the signal and
  // the accessor can never disagree. It used to emit (loaded, total) item counts while the accessor
  // returned the weighted fraction, so a weighted batch had two live answers to one question and the
  // caller's choice of API silently decided which. Item counts are still available, by name, from
  // `getResourceLoadCounts`.
  onProgress: Signal<number>;
  onResume: Signal<void>;
}
