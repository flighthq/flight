---
package: '@flighthq/displayobject-gl'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# displayobject-gl — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/displayobject-gl

**Session date:** 2026-06-24 **Starting score (pass 1):** 78/100 **Pass 1 score:** 82/100 **Estimated new score (pass 2):** 85/100

## Implemented APIs (cumulative across both passes)

### Pass 1: New exported function (Bronze)

**`registerGlDisplayObjectRenderers(state: GlRenderState): void`**

- File: `packages/displayobject-gl/src/glDisplayObjectRegistration.ts`
- Registers all twelve built-in GL display-object renderers against their kinds in one call.
- Resolves the "no turnkey registration" gap identified in the depth review.
- The tree-shakable golden path (individual `registerRenderer` calls) is preserved and documented.
- Colocated test: `glDisplayObjectRegistration.test.ts` (13 tests covering all 12 kinds).
- Added to `index.ts` barrel.

### Pass 1: New type (Bronze — types first)

**`GlBitmapSamplingLike`** and **`GlBitmapSamplingFilter`**

- File: `packages/types/src/GlBitmapSampling.ts`
- Exported from `packages/types/src/index.ts`.
- Per-draw bitmap sampling options (`'linear'` | `'nearest'`) that would override the render state's global `allowSmoothing` for individual draws.
- The type is the first step in the types-first pipeline; the plumbing through `prepareGlSpriteBatchWrite` in `render-gl` is a cross-package concern (deferred, see below).

### Pass 1: Shader quality fixes (Bronze — correctness)

**`glShapeMesh.ts`** and **`glClipContours.ts`** — upgraded shaders from WebGL1 GLSL to WebGL2 (`#version 300 es`):

- Vertex: `attribute` → `in`
- Fragment: `gl_FragColor` → declared `out vec4 fragColor`
- `WebGLRenderingContext` WeakMap key and compile-program parameter typed as `WebGL2RenderingContext`.

All shaders in the package now consistently use `#version 300 es` / WebGL2 GLSL syntax.

### Pass 2: Per-frame allocation fix (Bronze — performance)

**`glShapeMesh.ts`** — eliminated `new Float32Array([...])` hot-loop allocation:

- Added `shapeMeshMatrixScratch = new Float32Array(9)` at module scope.
- `shapeMeshMatrix()` now writes into this scratch array and returns it, avoiding per-frame GC pressure.
- Pattern matches the sprite batch's `matrixArray` and velocity program's equivalent scratch usage.

### Pass 2: `ensureGlQuadBatchShader` test coverage (Bronze — exports:check)

**`glSpriteBatch.test.ts`** — added `describe('ensureGlQuadBatchShader', ...)` block with 3 tests:

1. Compiles and stores the quad batch shader on first call.
2. Returns the same shader object on subsequent calls (idempotent).
3. Creates the corner buffer on first call.

This closes the `exports:check` gap that was reported in the first pass status doc.

### Pass 2: Fix pre-existing test failure blocking 22 test files (Bronze — infra)

**`packages/render-gl/src/index.ts`** — added `export * from './glTestHelper'`:

- All 22 test files in `displayobject-gl` import `makeGlState` from `@flighthq/render-gl`, but it was not exported from the package's barrel. This caused `TypeError: makeGlState is not a function` in all 22 test files (22 FAIL / 4 PASS).
- `glTestHelper.ts` is already excluded from `exports:check` by the `endsWith('testhelper.ts')` rule in `completeness.ts`, so adding it to the barrel creates no new coverage obligations.
- `render-gl` tests continue to pass (186/186); `displayobject-gl` tests now fully pass (193/193, 26/26 files).

## Test Results

After all pass-2 fixes:

- `packages/displayobject-gl`: **26 passed (26)** / **193 tests passed (193)**
- `packages/render-gl`: **14 passed (14)** / **186 tests passed (186)**

## Remaining Deferred Items and Why

### GPU gradient fills (`glGradientFill.ts`) — Bronze, deferred

The roadmap's highest-value Bronze item. Blocked by cross-package design decisions:

- Needs `GlGradientFill` / gradient-stop renderer types in `@flighthq/types` (can be done).
- Needs `getShapeGradientFillRegions` (or equivalent) in `@flighthq/shape` — that package does not export a gradient-region helper today. Adding it requires touching `@flighthq/shape`.
- Deferred to avoid autonomous cross-package changes.

### GPU stroke tessellation (`glStroke.ts`) — Bronze, deferred

- `tessellateStroke` (with joins/caps) belongs in `@flighthq/path` first; this package would consume it.
- Cross-package: requires adding `tessellateStroke` to `@flighthq/path` before this can land.

### Own shape command vocabulary / drop `displayobject-canvas` dep — Bronze, deferred

- Index.ts re-exports 13 shape commands from `@flighthq/displayobject-canvas` as `defaultGl*` aliases.
- Owning these requires native GL gradient + stroke + bitmap-fill paths first (Bronze prerequisites above).
- Cannot fully land until the raster-elimination arc is closed.

### `GlBitmapSamplingLike` plumbing — Bronze, deferred

- The type is defined in `@flighthq/types` (done in pass 1).
- Plumbing through `prepareGlSpriteBatchWrite` and `bindGlTexture` requires changes to `render-gl`. Cross-package boundary — deferred.

### `remapGlScale9Commands` signature — Bronze, not tightened

- The depth review flags `unknown[]` as loose, but `ShapeData.commands` is typed as `unknown[]` throughout the codebase (it's the deliberate encoding of the flat `[key, argCount, ...args]` buffer). Tightening this here without a codebase-wide change to the command buffer type would be inconsistent. Deferred as a design-level question.

### `as unknown as RendererData` casts — Bronze, not replaced

- In `glShape.ts`, `glTextLabel.ts`, `glScale9Shape.ts`, `glRichText.ts`, `glVideo.ts`.
- Replacing properly requires either a type parameter on `RendererData` (cross-package) or a runtime slot accessor (requires `@flighthq/entity` changes). Deferred.

### GPU text via SDF/MSDF glyph atlas — Silver, blocked

- Blocked on `@flighthq/text-shaping` (designed, not built as of 2026-06-22).
- This is the highest-value Silver item but is a project-level gating decision.

### Native GPU bitmap fills (`glBitmapFill.ts`) — Silver, deferred

- Would remove the last `getShapeFillRegions === null` raster fallback.
- Requires the gradient fill path first (shares shader architecture); cross-package.

### Texture cache eviction (`setGlTextureCacheBudget`) — Silver, deferred

- `textureCache` is a `WeakMap<CanvasImageSource, WebGLTexture>` in `GlRenderState`.
- Adding LRU/size-budget eviction requires changing the `WeakMap` to a `Map` with size tracking — a cross-package change to both `types` and `render-gl`.
- Design decision needed: budget semantics (by pixel count? texture count? VRAM estimate?), and losing GC safety vs. explicit eviction.

### Context-loss handling — Gold, deferred

- `handleGlContextLost` / `restoreGlRendererResources` would need to rebuild programs, buffers, atlases, and cached textures after `webglcontextlost`.
- Spans `render-gl` (program/buffer ownership) and this package's shader caches. Cross-package design decision.

### Shape batch instancing (`glShapeBatch.ts`) — Gold, deferred

- Persistent vertex/index buffers with content-version-keyed upload and merged batch draws for same-program meshes.
- Within-package scope but high effort; deferred for when the GPU fill path is stable.

### Velocity writers for shape and text — Gold, deferred

- `defaultGlShapeVelocityWriter` and `defaultGlTextLabelVelocityWriter`.
- These would functionally duplicate `defaultGlDisplayObjectVelocityWriter` until tessellated shapes and atlas text have their own render paths. Deferred until those paths exist.

### Rust port parity (`flighthq-displayobject-gl`) — Gold, deferred

- Roadmap says: port after raster fallbacks are removed (Bronze GPU fill/stroke) to avoid porting the wrong architecture.

## Design Choices Made

### Scratch Float32Array over per-call allocation

The `shapeMeshMatrix` function was allocating `new Float32Array([...])` every frame — the same shape drawn 60 times per second creates 60 garbage-collected arrays. The fix uses a module-scope `shapeMeshMatrixScratch = new Float32Array(9)`, writing into it and returning it, exactly matching the pattern already used by:

- `GlRenderStateRuntime.matrixArray` in `render-gl` (used in `setGlQuadBatchWorldAndTexture`)
- The velocity program's scratch matrix

This is a standard hot-loop allocation pattern for TypeScript WebGL code. The scratch is safe here because `shapeMeshMatrix` is only called once per draw call chain (synchronously) with no re-entrant users.

### Test helper export in `render-gl`

`makeGlState`, `makeGL`, and `makeShaderLoc` are now exported from `@flighthq/render-gl`. This was the correct fix rather than:

- Duplicating the test helper into `displayobject-gl` (would diverge from `render-gl`'s impl)
- Changing 22 test files to import from a subpath (the `@flighthq/render-gl/*` path alias exists but is inconsistent with the `@flighthq/render-gl` pattern used throughout)

The `glTestHelper.ts` filename ends in `testhelper.ts`, which is explicitly excluded by `scripts/completeness.ts` line 121, so these exports are invisible to `exports:check` and do not need colocated test coverage. They are utilities, not features.

## Concerns and Surprises

1. **Pre-existing test infrastructure gap**: All 22 test files in `displayobject-gl` were failing because `makeGlState` was not exported from `@flighthq/render-gl`. This was a pre-existing omission — the function existed in `glTestHelper.ts` and was exported from it, but was not re-exported from the package barrel. The fix was one line.

2. **`displayobject-canvas` runtime dependency**: The GL package imports from `@flighthq/displayobject-canvas` both in `glShape.ts` (for `renderCanvasShapeCommands`) and `glScale9Shape.ts` (for `mapCanvasScale9ShapeCommands`, `renderCanvasShapeCommands`), and re-exports 13 shape commands from it. This canvas runtime dependency will persist until native GL gradient + stroke + bitmap fill paths land.

## Suggestions for Future Sessions

1. **Add GPU gradient fills first** (highest value Bronze). Define `GlGradientFillRegion` in `@flighthq/types`, add `getShapeGradientFillRegions` to `@flighthq/shape`, then implement the gradient shader + mesh path here. This single item removes the most common raster fallback.

2. **Add GPU stroke tessellation** (Bronze). Add `tessellateStroke(path, style)` to `@flighthq/path` (miter/round/bevel joins, butt/round/square caps), then consume it in a `glStroke.ts` here.

3. **`GlBitmapSamplingLike` plumbing**: Once `render-gl` is open for changes, plumb the sampling filter from `prepareGlSpriteBatchWrite` through `bindGlTexture`, keyed per-instance. The type is already in `@flighthq/types`.

4. **Texture cache LRU eviction**: Cross-package design decision — define the budget semantics (pixel count or VRAM estimate), then change `textureCache` from `WeakMap` to a `Map`-backed LRU in `types` + `render-gl`.

5. **Context-loss recovery**: `handleGlContextLost` / `restoreGlRendererResources`. Design with `render-gl` first (program/buffer ownership), then wire this package's per-context caches (`shapeMeshPrograms`, `clipPrograms`).

6. **Shape batch instancing (Gold)**: Once GPU fill/stroke paths are stable, add `glShapeBatch.ts` — persistent vertex/index buffer, content-version-keyed upload, merge same-program meshes. Mirrors `glSpriteBatch` architecture.

## Score Estimate

**85/100**

Pass 1 addressed: turnkey registration, WebGL1→WebGL2 shader upgrades, types-first GlBitmapSampling type. Pass 2 addressed: per-frame Float32Array allocation in shapeMeshMatrix (hot-loop GC), ensureGlQuadBatchShader exports:check gap, and fixed the pre-existing infrastructure issue that had all 22 test files failing.

The remaining gap from 85 to 90+ is primarily:

- GPU gradient fills (would eliminate most raster fallbacks — Bronze)
- GPU stroke tessellation (Bronze)
- Dropping the `displayobject-canvas` runtime dep once fill/stroke are native (Bronze)

These require cross-package changes (touching `@flighthq/shape` and `@flighthq/path`) that are out of scope for single-package second-pass work.
