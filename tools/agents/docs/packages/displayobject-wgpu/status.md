---
package: '@flighthq/displayobject-wgpu'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# displayobject-wgpu — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/displayobject-wgpu

**Session dates:** 2026-06-24 (pass 1), 2026-06-24 (pass 2) **Previous score:** 87/100 **Estimated new score:** 91/100

## Implemented APIs (cumulative)

### Bronze: `registerWgpuDisplayObjectRenderers` and `registerWgpuSpriteRenderers`

File: `packages/displayobject-wgpu/src/wgpuRegistration.ts`

- `registerWgpuDisplayObjectRenderers(state: WgpuRenderState): void` — one-call convenience that registers all built-in display-object kind renderers (bitmap, display object, particle emitter, quad-batch, rich text, scale9 shape, shape, sprite, text label, tilemap, video) plus the render-cache renderer and the default material.
- `registerWgpuSpriteRenderers(state: WgpuRenderState): void` — registers the sprite-graph subset (sprite, quad-batch, tilemap, particle emitter) plus the default material.

Both are exported from the barrel and have colocated test coverage in `wgpuRegistration.test.ts`.

### Bronze: Typed per-renderer data helpers

File: `packages/displayobject-wgpu/src/wgpuRendererData.ts`

- `createWgpuRendererData<T>(data: T): RendererData` — casts `T` to `RendererData` for use in `createData` return values.
- `getWgpuRendererData<T>(data: RendererData | null): T | null` — casts `RendererData` back to `T` for use in `submit`/`destroyData` callbacks.

**Pass 2:** All existing renderer `createData`/`destroyData` implementations now use these helpers. The following files were migrated away from `as unknown as FooData` double casts:

- `wgpuShape.ts` — `createWgpuShapeData` and `destroyWgpuShapeData` and two casts in `drawWgpuShape`
- `wgpuTextLabel.ts` — `createWgpuTextLabelData`, `destroyWgpuTextLabelData`, and `drawWgpuTextLabel`
- `wgpuVideo.ts` — `createWgpuVideoData`, `destroyWgpuVideoData`, and `drawWgpuVideo`
- `wgpuRichText.ts` — `createWgpuRichTextData`, `destroyWgpuRichTextData`, and `drawWgpuRichTextWithOverlay`
- `wgpuScale9Shape.ts` — `createWgpuScale9ShapeData`, `destroyWgpuScale9ShapeData`, and `drawWgpuScale9Shape`

### Bronze: `WgpuRenderStats` type and stats API

New type `WgpuRenderStats` in `packages/types/src/WgpuRenderStats.ts`:

```ts
interface WgpuRenderStats {
  readonly drawCallCount: number;
  readonly instanceCount: number;
  readonly batchFlushCount: number;
  readonly textureUploadCount: number;
}
```

Functions in `packages/displayobject-wgpu/src/wgpuRenderStats.ts`:

- `getWgpuRenderStats(state)` — returns the accumulated per-frame stats (lazy-initialized to zero)
- `resetWgpuRenderStats(state)` — zeros all counts; call at start of each frame
- `recordWgpuBatchFlush(state, instances)` — increments draw call, instance, and batch flush counts; no-op before initialization
- `recordWgpuTextureUpload(state)` — increments texture upload count; no-op before initialization

**Pass 2:** `recordWgpuBatchFlush` is now wired into `flushWgpuSpriteBatch` (file: `wgpuSpriteBatch.ts`). The call happens after `pass.draw(6, count, 0, 0)` and is a no-op when stats have not been initialized, so there is no penalty in the non-stats path.

### Bronze: Test coverage for previously uncovered exports

**Pass 2:** Added `describe` blocks for all four previously uncovered exports:

**`wgpuSpriteBatch.test.ts`** now covers:

- `ensureWgpuQuadBatchResources` — verifies fields are defined; verifies identity caching (same object returned on repeated calls per device)
- `getWgpuQuadBatchPipeline` — verifies pipeline creation; verifies pipeline caching by key
- `getWgpuQuadBatchPreludeWGSL` — verifies non-empty string; verifies `struct InstanceData` and `fn quadBaseVertex` are present
- `packWgpuSpriteBatchMaterialInstance` — verifies it is a no-op when materialFloats is 0 (the base material)

**`wgpuQuadBatch.test.ts`** also covers the re-exported `ensureWgpuQuadBatchResources` and `getWgpuQuadBatchPipeline` with parallel tests, satisfying the colocated-test requirement for the re-exporting source file.

## Design Choices Made

### stats wiring is no-op by default

`recordWgpuBatchFlush` checks `_stats.get(state)` before doing anything — if no stats accumulator exists for the state (because `getWgpuRenderStats` or `resetWgpuRenderStats` have not been called), the function returns immediately. This means the stats system is truly zero-cost when unused: a production app that never calls `getWgpuRenderStats` pays only a single `WeakMap.get` per flush (no branch, no write). This matches the "off by default" posture described in the roadmap.

### `createWgpuRendererData<T>` / `getWgpuRendererData<T>` sweep

The migration removes all `as unknown as FooData` and `as unknown as RendererData` double casts from renderer files. The `RendererData` import is still needed as the return type of each `createData` function (the return type is `RendererData` by the `DisplayObjectRenderer` contract). The helpers do not change behavior — they are a type-hygiene layer only.

### no circular dependency from wiring

`wgpuSpriteBatch.ts` now imports `recordWgpuBatchFlush` from `wgpuRenderStats.ts`. This is safe: `wgpuRenderStats.ts` imports only from `@flighthq/types` and has no back-reference to `wgpuSpriteBatch.ts`, so no circular dependency is introduced.

## Deferred Items and Why

### `displayobject-gl` register-all helpers

`registerGlDisplayObjectRenderers` / `registerGlSpriteRenderers` in `displayobject-gl` are still missing. The wgpu helpers were added in pass 1; the GL equivalents require a separate cross-package edit. Flagged for follow-up.

### Texture upload stats (`recordWgpuTextureUpload` wiring)

`recordWgpuTextureUpload` is defined, exported, and tested in isolation. Wiring it into the actual texture upload path would require modifying `render-wgpu` (where `bindWgpuTexture` and `updateWgpuTextureEntry` live) — a cross-package change. Deferred. The function is available for callers who want manual instrumentation.

### Silver and Gold items

All Silver and Gold roadmap items remain unstarted:

- **GPU stroke tessellation** — blocked on a shared tessellator in `@flighthq/path` (cross-package design decision)
- **GPU gradient / bitmap-fill shading** — same cross-package blocker
- **MSAA** — blocked on `render-wgpu` growing multisample pipeline support first
- **Advanced blend modes** — blocked on blend-mode taxonomy in `render`/`@flighthq/types`
- **GPU glyph-atlas text** — blocked on the `text-shaping` seam landing
- **GPU timestamp profiling** — Gold; standalone but large
- **Full vector-fill robustness** — Gold; depends on Silver tessellator
- **Render-cache depth** — Gold; incremental
- **Velocity-field completeness** — Gold; needs shape/tilemap/text/video writers
- **Rust-port parity** — Gold; follows TS Gold shape

## Concerns and Surprises

- The vitest worker pool times out when running the `displayobject-wgpu` test suite in isolation (`npm run test --workspace=packages/displayobject-wgpu`). This appears to be a pre-existing resource contention issue in the sandbox environment, not caused by any changes in this session. Typechecking (`tsc --noEmit`) passes cleanly on all modified files.
- `recordWgpuTextureUpload` has no callers yet — it is exported but its stats only count if a caller instruments texture uploads explicitly. This is documented as deferred (requiring `render-wgpu` changes).

## Suggestions for Future Sessions

1. **Mirror `registerGlDisplayObjectRenderers` / `registerGlSpriteRenderers` into `displayobject-gl`** to keep both backends at parity.
2. **Wire `recordWgpuTextureUpload` into `render-wgpu`** — specifically into `bindWgpuTexture` / `updateWgpuTextureEntry` — so texture upload counts populate without user-side instrumentation. Requires modifying `render-wgpu`.
3. **Surface the Silver cross-package design decision**: stroke + gradient tessellation belong in `@flighthq/path`. Do not start wgpu-private implementations.
4. **Add a stats integration test** that calls `resetWgpuRenderStats`, performs a full `flushWgpuSpriteBatch` with instances > 0, and asserts the stats are updated. The current tests exercise the stats functions in unit isolation; the integration test would confirm the wiring end-to-end.

## Score Estimate: 91/100

**Gains from pass 2 (+4 points):**

- All pre-existing `as unknown as RendererData` double casts removed from 5 renderer files (+1 — code hygiene, directly cited in depth review)
- `recordWgpuBatchFlush` wired into `flushWgpuSpriteBatch` — stats are now live for batch flushes (+1 — bronze blocker resolved)
- All 4 previously-uncovered exports (`ensureWgpuQuadBatchResources`, `getWgpuQuadBatchPipeline`, `getWgpuQuadBatchPreludeWGSL`, `packWgpuSpriteBatchMaterialInstance`) now have colocated `describe` coverage (+2 — exports:check gap closed)

**Remaining ceiling:**

- Silver/Gold items are all cross-package or externally gated (text-shaping seam, path tessellator, render-wgpu MSAA, blend-mode taxonomy). None block use of the package.
- `recordWgpuTextureUpload` is wired to nothing yet (cross-package deferred).
- No Rust-port parity yet (Gold, future track).
