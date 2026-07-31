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
