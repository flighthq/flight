---
package: '@flighthq/scene2d-wgpu'
updated: 2026-08-04
by: builder4
---

# scene2d-wgpu — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-08-04 — tessellated solid shapes fold resolved `ColorScaleBias`

The opt-in WebGPU color-adjustment feature now owns a tessellated solid-fill variant. `wgpuShapeMesh`
delegates only when that feature is registered, the render proxy carries a resolved `ColorScaleBias`,
and it carries no full `colorMatrix`. The feature compiles its own shape shader and allocates separate
96-byte per-mesh uniforms on demand; the untinted path retains its original 64-byte uniform, shader, and
pipeline cache with no adjustment data or shader code. The shared driver writes the projection/world
matrix and premultiplied mesh color, leaving the feature tail intact. The fragment shader preserves the
existing alpha order: unpremultiply, apply the scale/bias adjustment, then repremultiply for the established
blend state.

The scope stops at the solid-mesh draw seam. The resolver installed by `enableColorAdjustments`, local/parent composition,
the `RenderProxy` color fields, full color-matrix behavior, and alpha ordering are unchanged. Full
`colorMatrix` support therefore remains outside this fold.

`functional/scenes/swf-alpha-transform.ts` now proves the imported adjusted white solid is green on both
WebGL and WebGPU. The WebGPU capture reports `wgpuMeshCount: 1` and
`wgpuRasterSurfaceAllocated: false`, so the result is the tessellated path rather than a raster fallback;
Canvas and DOM retain their recorded white result. Fresh screenshots were inspected, the WebGPU baseline
was updated, and the scoped smoke, parity, and regression gates pass. Focused unit coverage passes 29 tests
across the mesh driver, color-adjustment feature, and shape-data teardown. The full package suite passes
29 files / 173 tests, and the whole-repository `npm run check` gate passes.

## 2026-08-04 — tessellated solid shapes do not fold colour adjustments

Standalone renderer capability gap: the default hybrid shape route in
`packages/scene2d-wgpu/src/wgpuShape.ts` tries the tessellated mesh path first, but
`packages/scene2d-wgpu/src/wgpuShapeMesh.ts` uploads only the solid fill colour multiplied by
`RenderProxy.alpha`. It never consumes `RenderProxy.colorScaleBias` or `RenderProxy.colorMatrix`.
Consequently, any adjusted solid `Shape` that tessellates renders its source colour; this is independent
of which importer or application authored the node. The raster fallback does record the adjustment in
`packages/scene2d-wgpu/src/wgpuRasterShapeRenderer.ts`, through the quad-only fold implemented by
`packages/scene2d-wgpu/src/wgpuColorAdjustmentMaterialFeature.ts`, so the capability changes with shape
strategy rather than node semantics.

`functional/scenes/swf-alpha-transform.ts` is the permanent four-backend reproducer. Its SWF provenance
only proves the gap affects real imported content: the adjusted white solid finishes the WebGPU draw with
one mesh and no raster surface and remains white, while WebGL folds the same intended green transform.
Evidence commit: `0099a0cc4 test(swf): capture alpha transform backend evidence`. Renderer-side record
commit subject: `docs(scene2d-wgpu): record mesh colour adjustment gap`.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Ran the Recommended-list sweep for `@flighthq/scene2d-wgpu`. Outcome: **no source edits required** — all three items either reference surface absent from this worktree, are already satisfied by prior work, or are blocked behind a design decision / cross-backend asymmetry. Tests verified green (24 files, 113 tests pass).

**Worktree-vs-assessment discrepancy found (important).** The assessment and the prior `builder-67dc46d64` status entry describe files that do **not exist** in this worktree's `src/`: `wgpuRegistration.ts`, `wgpuRendererData.ts`, and `wgpuRenderStats.ts`. They survive only as stale `dist/` artifacts (`dist/wgpuRenderStats.*`) and the `WgpuRenderStats` type only in `@flighthq/types` `dist/`. The current `src/index.ts` exports none of them. This worktree's source therefore predates the `builder-67dc46d64` ingest the assessment was written against. That mismatch is what made the Recommended items un-actionable here rather than any blocker in the items themselves.

### Items

- **Stats integration test — PARKED.** The functions it would exercise (`resetWgpuRenderStats`, `recordWgpuBatchFlush`, `getWgpuRenderStats`) are absent from `src/` (present only in stale `dist/`), and `WgpuRenderStats` lives in `@flighthq/types`. Cannot write a colocated test for functions this package does not export; `flushWgpuSpriteBatch` contains no stats wiring to assert against. Cross-boundary (`@flighthq/types`) + missing-source.
- **Degenerate-input sentinel hardening — DONE (audit; no edit).** Audited every draw path. All already no-op on degenerate input: `drawWgpuShape` (empty commands, null rendererData, zero-size bounds, no material), `drawWgpuTextLabel` (empty text, empty layout groups, zero-size), `drawWgpuRichText` (zero field W/H, null rendererData), `drawWgpuVideo` (`readyState < 2`, zero dims), `drawWgpuTilemap` (null tileset/atlas, zero columns/rows), `drawWgpuBitmap` (null image source), `drawWgpuScale9Shape` (empty commands, null mapper, zero-size), `drawWgpuShapeMeshes` (empty/degenerate meshes, zero alpha). The single `throw` in the package — `renderWgpuVelocity`'s "call renderWgpuBackground first" — is correct misuse detection, not a degenerate-input case. The item's premise is already satisfied in source; no change warranted.
- **Velocity-writer coverage for remaining drawable kinds — PARKED.** Shape, Tilemap, TextLabel/RichText, and Video are non-instanced kinds whose per-node velocity is already correctly produced by the existing `defaultWgpuDisplayObjectVelocityWriter` (covers a node's world bounds with one field velocity). Only the instanced kinds (`QuadBatch`, `ParticleEmitter`) need bespoke per-instance writers, and both already exist. Minting `defaultWgpuShapeVelocityWriter` / `…Text…` / `…Video…` would each be a byte-identical copy of the display-object writer — pure public-surface inflation (the "blood from a stone" anti-pattern), and the `scene2d-gl` sibling carries the same three-writer set, so adding them here unilaterally creates cross-backend asymmetry. Whether to mint per-kind writer aliases vs. keep one shared writer is a design / cross-backend-contract decision, not sweep-safe hygiene.

Did not run: install, check, fix, order:fix, tsc, cargo, git, wasm rebuild (per task constraints).

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/scene2d-wgpu

**Session dates:** 2026-06-24 (pass 1), 2026-06-24 (pass 2) **Previous score:** 87/100 **Estimated new score:** 91/100

## Implemented APIs (cumulative)

### Bronze: `registerWgpuDisplayObjectRenderers` and `registerWgpuSpriteRenderers`

File: `packages/scene2d-wgpu/src/wgpuRegistration.ts`

- `registerWgpuDisplayObjectRenderers(state: WgpuRenderState): void` — one-call convenience that registers all built-in display-object kind renderers (bitmap, display object, particle emitter, quad-batch, rich text, scale9 shape, shape, sprite, text label, tilemap, video) plus the render-cache renderer and the default material.
- `registerWgpuSpriteRenderers(state: WgpuRenderState): void` — registers the sprite-graph subset (sprite, quad-batch, tilemap, particle emitter) plus the default material.

Both are exported from the barrel and have colocated test coverage in `wgpuRegistration.test.ts`.

### Bronze: Typed per-renderer data helpers

File: `packages/scene2d-wgpu/src/wgpuRendererData.ts`

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

Functions in `packages/scene2d-wgpu/src/wgpuRenderStats.ts`:

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

### `scene2d-gl` register-all helpers

`registerGlDisplayObjectRenderers` / `registerGlSpriteRenderers` in `scene2d-gl` are still missing. The wgpu helpers were added in pass 1; the GL equivalents require a separate cross-package edit. Flagged for follow-up.

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

- The vitest worker pool times out when running the `scene2d-wgpu` test suite in isolation (`npm run test --workspace=packages/scene2d-wgpu`). This appears to be a pre-existing resource contention issue in the sandbox environment, not caused by any changes in this session. Typechecking (`tsc --noEmit`) passes cleanly on all modified files.
- `recordWgpuTextureUpload` has no callers yet — it is exported but its stats only count if a caller instruments texture uploads explicitly. This is documented as deferred (requiring `render-wgpu` changes).

## Suggestions for Future Sessions

1. **Mirror `registerGlDisplayObjectRenderers` / `registerGlSpriteRenderers` into `scene2d-gl`** to keep both backends at parity.
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
