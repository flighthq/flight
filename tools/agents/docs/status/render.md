# @flighthq/render — status

## 2026-06-25 — builder R2-4 second-pass recovery

A parallel pass recovered ~94 lost types into `@flighthq/types` since the first recovery pass below. Re-checking the four candidates that were parked for "needs type X": the queue types are now present, so `renderQueue` is recoverable; the batch-driver type and the driver-specific `RenderStateRuntime` runtime fields are still absent, so the rest stay parked (editing `@flighthq/types` is out of scope by the hard boundary).

Re-confirmed that the live `src/` has diverged from `dist/` into a slimmer architecture: `installRenderAdaptHook` uses a module-level `_adaptHook` rather than a `runtime.renderAdaptHook` field, and `createRenderStateRuntime` initializes none of the driver fields (`drawContext`, `renderBatchFlushMap`, `renderBlendStack`). The driver/blend-stack/stats subsystem in `dist/` therefore depends on runtime state that does not exist in either `src/` or `@flighthq/types` today. Recovering it would require adding those fields to `RenderStateRuntime` — out of scope.

### Recovered

- `renderQueue` (`buildRenderQueue`, `clearRenderQueue`, `compareRenderQueueEntries`, `createRenderQueue`, `packRenderSortKey`, `pushRenderQueueEntry`, `sortRenderQueue`) — recovered as `src/renderQueue.ts` + colocated `src/renderQueue.test.ts` (22 tests). All of `RenderQueue`, `RenderQueueEntry`, and `RenderSortKey` are now present in `@flighthq/types` (`RenderQueue.ts`). The module depends only on `getNodeRuntime`, `getRenderStateRuntime`, and the existing `renderProxyMap` — none of the parked driver runtime fields — so it stands alone. Added the `export * from './renderQueue'` line to `src/index.ts` (alphabetized between `renderProxyAdapter` and `renderState`).

### Fossils skipped

- (none — no candidate implements a dropped/deprecated concept)

### Parked

- `renderBlendState` (`getRenderBlendStackDepth`, `popRenderBlendState`, `pushRenderBlendState`) — still needs a `renderBlendStack` field on `RenderStateRuntime` in `@flighthq/types` plus its initialization in `createRenderStateRuntime`. Field absent; recovering it requires editing `@flighthq/types` (forbidden).
- `renderDriver` (`drawRenderProxy`, `flushRenderBatch`, `registerRenderBatchFlush`, `submitRenderProxy`) — still needs type `RenderBatchFlushCallback` in `@flighthq/types` (absent) plus `RenderStateRuntime.drawContext` and `RenderStateRuntime.renderBatchFlushMap` runtime fields (absent). `BatchBarrier`, `BatchFormat`, `RenderDrawContext`/`RenderBatchKey`, `Renderable`, `RenderState` are present, but the flush-callback type and the runtime fields are not.
- `renderState.getRenderStateStats` — `RenderStateStats` type is now present, but the function reads `getRenderStateRuntime(state).drawContext`, and `drawContext` is not a declared field on `RenderStateRuntime`. Parked pending the driver runtime fields above; `src/renderState.ts` was not modified.

### Test result

`npm run test --workspace=packages/render` — 14 files, 165 tests passing (was 13 files / 143 before; `renderQueue` adds 1 file / 22 tests).

## 2026-06-25 — builder R2-4 lost-source recovery

Compared `packages/render/dist/*.js` against `packages/render/src/` to find source pruned by the integration curation. Three whole dist modules have no `src/` counterpart (`renderBlendState`, `renderDriver`, `renderQueue`), and one existing src file is missing an exported function (`renderState.getRenderStateStats`).

All four recovery candidates are genuine lost work (a blend save/restore stack, a batch-flush driver, a sortable render queue, and a render-state stats accessor) — none implement a dropped or deprecated concept. **However, every one of them depends on a type or runtime field that is not present in `@flighthq/types`.** The task's hard boundary forbids editing `@flighthq/types`, so all four are PARKED rather than recovered. Nothing was recovered into `src/` this pass; `index.ts` was not modified.

### Recovered

- (none — all candidates blocked on missing `@flighthq/types` surface; see Parked)

### Fossils skipped

- (none — no candidate implements a dropped/deprecated concept)

### Parked

- `renderBlendState` (`getRenderBlendStackDepth`, `popRenderBlendState`, `pushRenderBlendState`) — needs a `renderBlendStack` field on `RenderStateRuntime` in `@flighthq/types` (and its initialization in `createRenderStateRuntime`). The module reads `getRenderStateRuntime(state).renderBlendStack`, which is not declared on `RenderStateRuntime` today, so it would neither typecheck nor run.
- `renderDriver` (`drawRenderProxy`, `flushRenderBatch`, `registerRenderBatchFlush`, `submitRenderProxy`) — needs type `RenderBatchFlushCallback` in `@flighthq/types` (`BatchBarrier`, `BatchFormat`, `Renderable`, `RenderState` are present).
- `renderQueue` (`buildRenderQueue`, `clearRenderQueue`, `compareRenderQueueEntries`, `createRenderQueue`, `packRenderSortKey`, `pushRenderQueueEntry`, `sortRenderQueue`) — needs types `RenderQueue`, `RenderQueueEntry`, and `RenderSortKey` in `@flighthq/types`.
- `renderState.getRenderStateStats` — needs type `RenderStateStats` in `@flighthq/types` (returns `Readonly<RenderStateStats>`).

### Test result

`npm run test --workspace=packages/render` — 13 files, 143 tests passing (baseline; no source was edited this pass).
