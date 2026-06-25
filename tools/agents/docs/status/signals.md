# @flighthq/signals — status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source by merging gitignored `dist/` build output (`.js` impl + comments, `.d.ts` types) back into `src/`, per the camera pattern.

### Recovered

- **throttle.ts** — expanded from the single `connectSignalAtRate` survivor to the full module proven by `dist/throttle.js` / `dist/throttle.d.ts`:
  - `connectSignalAtFrameRate(source, fps, slot)` — the canonical name; frame-tick accumulating throttle (the old `connectSignalAtRate` body).
  - `connectSignalAtRate` — now a `@deprecated` alias for `connectSignalAtFrameRate`.
  - `connectSignalDebounced(source, delayMs, slot, options?)` — debounce with leading/trailing edges (`Date.now()`/`setTimeout` clock).
  - `connectSignalThrottled(source, intervalMs, slot, options?)` — payload-preserving throttle with leading/trailing edges.
  - `SignalThrottleOptions` interface (`leading?`, `trailing?`) — local to the module (not a cross-package type), matching the `.d.ts`.
  - All four use only `connectSignal` / `disconnectSignal` from the current `slot.ts` (the return value of `connectSignal` is ignored), and the only cross-package type is `Signal`, which is present in `@flighthq/types`. No type gap.
  - `src/throttle.test.ts` reconstructed from `dist/throttle.test.js` (vitest globals, `vi.useFakeTimers()`); index already re-exported `./throttle`, so no barrel change.

Result: `npm run test --workspace=packages/signals` → 5 files, 40 tests, all passing.

### Parked

- **scope.ts** (+ scope.test.ts, `export * from './scope'`) — a `SignalScope` connection collector (`addSignalConnectionToScope`, `connectSignalInScope`, `connectSignalOnceInScope`, `createSignalScope`, `disconnectSignalScope`). PARKED: needs types `SignalScope` and `SignalConnection` in `@flighthq/types` (neither exists there today), and depends on the connection-handle slot API below (`connectSignal`/`connectSignalOnce` returning `SignalConnection`, `disconnectSignalConnection`). Recovering it would require editing `@flighthq/types`, which is outside this task's hard boundary.

- **slot.ts connection-handle API** — `dist/slot.js`/`.d.ts` describe a richer, divergent `slot` module whose `connectSignal`/`connectSignalOnce` return a `SignalConnection<T>` handle, plus `disconnectAllSlots` (+ deprecated `disconnectAllSignals`), `disconnectSignalConnection`, `getSignalConnections`, `getSignalSlotCount`, `isSignalConnectionActive`, `pauseSignalConnection`, `resumeSignalConnection`. PARKED: the entire handle model imports the `SignalConnection` type, which is not in `@flighthq/types`. The live `src/slot.ts` is a different, working (void-returning) API — replacing it with the dist version would (a) require a new `@flighthq/types` type and (b) change the public signature of the surviving `connectSignal`. Both are out of boundary / design decisions. Left the live `slot.ts` untouched.

### Fossils skipped

None. No dropped-concept (DisplayObject cacheAsBitmap/scrollRect, OpenFL Loader, Stage setters, Bitmap pixelSnapping, Video smoothing) modules exist in this package's `dist/`.

## 2026-06-25 — builder R2-4 second-pass recovery

Re-examined the two items parked last pass now that the parallel types pass has landed `SignalScope`, `SignalConnection`, and `SignalConnectOptions` in `@flighthq/types` (all three confirmed present in `packages/types/src/`). The type-availability blocker is resolved; a second, structural blocker remains.

### Recovered

- None. No new function or module was merged from `dist/` into `src/` this pass.

### Skipped (fossil)

- None. This package's `dist/` contains no dropped-concept modules (no DisplayObject cacheAsBitmap/scrollRect, OpenFL Loader, Stage setters, Bitmap pixelSnapping, lifecycle/traversal wrappers).

### Parked

- **scope.ts** (+ `scope.test.ts`, `export * from './scope'`) — the `SignalScope` connection collector (`addSignalConnectionToScope`, `connectSignalInScope`, `connectSignalOnceInScope`, `createSignalScope`, `disconnectSignalScope`). The type blocker is now gone (`SignalScope`/`SignalConnection`/`SignalConnectOptions` exist in `@flighthq/types`). PARKED on a structural blocker instead: every scope function is built on the connection-handle slot API — `connectSignal`/`connectSignalOnce` returning a `SignalConnection<T>` with `.connected`, and `disconnectSignalScope` calling `disconnectSignalConnection`. The live `src/slot.ts` is a deliberately-simplified, void-returning API (newer than the `dist` build — `slot.ts`/`slot.test.ts` were rewritten Jun 24–25, after the Jun 24 10:23 dist) and has none of those. Recovering scope therefore requires first restoring the rich slot API below, which is a design decision (reverting a deliberate redesign), not a mechanical merge.

- **slot.ts connection-handle API** — the `dist/slot.js`/`.d.ts` rich `slot` module: `connectSignal`/`connectSignalOnce` returning `SignalConnection<T>`, plus `disconnectAllSlots` (+ deprecated `disconnectAllSignals`), `disconnectSignalConnection`, `getSignalConnections`, `getSignalSlotCount`, `isSignalConnectionActive`, `pauseSignalConnection`, `resumeSignalConnection` (a tombstone-based, reentrancy-safe dispatch). The `SignalConnection` type it needs now exists in `@flighthq/types`, so the type gap is closed. PARKED on judgment: the live `src/slot.ts` is a different, newer, currently-passing API — it makes `connectSignal` return `void`, drops the handle model, and adds `clearSignal`. The `throttle.ts` module already in `src/` is written against this void-returning API. Restoring the dist version would change the public signature of the surviving `connectSignal`, delete `clearSignal`, and replace a deliberately-chosen simpler module — a design decision outside this task's mechanical-recovery scope. Left `src/slot.ts` untouched; all 40 existing tests pass.

Result: `npm run test --workspace=packages/signals` → 5 files, 40 tests, all passing. No source files changed this pass.
