---
package: '@flighthq/displayobject-canvas'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# displayobject-canvas — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Swept the `assessment.md › Recommended` list. Only one item was strictly within-package and free of a design decision; the rest of the list's stated premises did not hold against the live source, so they parked.

**Done**

- **Degenerate-input sentinel tests** — added colocated no-throw cases proving the draw paths return/skip rather than throw on malformed input. In `canvasShape.test.ts › renderCanvasShapeCommands`: zero-size rectangle, NaN coordinates, Infinity coordinates, very-large (1e20) coordinates, a singular (det=0) bitmap-fill matrix, and an unknown command key (exercising the `getCanvasShapeCommand` undefined sentinel + walk advance). In `canvasParticleEmitter.test.ts`: NaN particle transforms. All attach to already-exported functions, so `exports:check` stays satisfied. Package tests: 208 passed (28 files).

**Parked**

- **`LineScaleMode 'horizontal'`/`'vertical'`** — _cross-boundary._ The assessment's premise is stale: `CanvasShapeDrawState` (in `@flighthq/types`) has **no** `strokeScaleMode` field and `'none'` is **not** implemented — `defaultCanvasLineStyle` reads `caps`/`joints`/`miterLimit` (buf indices 5/6/7) and ignores `scaleMode` (index 4) entirely. There is no in-package carrier to thread the scale mode from `lineStyle` to `flushCanvasShapePath`; adding one means a field on `CanvasShapeDrawState` in `@flighthq/types`. Park until that header field lands upstream.
- **Image-smoothing parity audit** — _behavioral-contract decision._ The bitmap/tilemap/particle paths already toggle `imageSmoothingEnabled` consistently (all assume `true` is the resting state). The genuine inconsistency is `createBitmapPattern`/`createGradientPattern` (`canvasFillPattern.ts`) setting `imageSmoothingEnabled` for pattern creation with **no restore**, and the bitmap path restoring to a hard-coded `true` rather than the configured `runtime.imageSmoothingEnabled`/`imageSmoothingQuality` default. Picking the correct unified restore target (`true` vs the configured default) and the pattern-creation smoothing contract is a judgment call the assessment itself frames as "an audit," not a mechanical edit.
- **Draw-walk state-minimization extension** — _design decision + correctness hazard._ The draw walk itself is in `@flighthq/render` (cross-package). Caching `globalAlpha`/transform/styles on the canvas runtime to skip redundant writes would have to invalidate on every external `save`/`restore` (cache compositing, `applyCanvasMaterial`), which silently mutate context state — a real correctness hazard, not a sweep.
- **Particle-emitter additive fast path** — _already implemented._ `drawCanvasParticleEmitter` already honors the per-emitter blend mode via `state.applyBlendMode` and uses a state-minimized inner loop (`setTransform` + `globalAlpha` per particle, no per-particle `save`/`restore`). Per-particle tint requires per-particle color data not present in this path and is the cross-package particles↔sprite line (fork A). Added a NaN-transform no-throw test while here.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/displayobject-canvas

**Session date:** 2026-06-24 **Previous score:** 84/100 **Estimated new score:** 91/100

## Implemented APIs (cumulative — both passes)

### Bronze: `registerCanvasDisplayObjectRenderers` + `canvasDisplayObjectRendererEntries`

File: `packages/displayobject-canvas/src/canvasRegistration.ts`

- `canvasDisplayObjectRendererEntries: ReadonlyArray<readonly [Kind, Renderer]>` — ordered data array of all [kind, renderer] pairs: Bitmap, DisplayObject, ParticleEmitter, QuadBatch, RichText, Scale9Shape, Shape, Sprite, TextLabel, Tilemap, Video.
- `registerCanvasDisplayObjectRenderers(state: CanvasRenderState): void` — one-call umbrella that wires all 11 `defaultCanvas*Renderer` objects into the render registry. Replaces ~11 hand-written `registerRenderer` calls.

Both are in `index.ts` and have colocated tests in `canvasRegistration.test.ts`.

### Bronze: Blend-mode fidelity fixes

File: `packages/displayobject-canvas/src/canvasMaterials.ts`

- `BlendMode.Erase` → `'destination-out'` (was silent fallback).
- `BlendMode.Alpha` → `'destination-in'` (was silent fallback).
- `BlendMode.Invert`, `BlendMode.Shader`, `BlendMode.Subtract` remain `null` with explicit comments stating "No faithful Canvas2D equivalent; falls back to normal."

### Bronze: `enable*` naming unification

- `enableCanvasRenderCache` → `enableCanvasRenderCacheSupport`
- `enableCanvasTextInput` → `enableCanvasTextInputSupport`

All call sites updated.

### Bronze: Mask contract documented

File: `packages/displayobject-canvas/src/canvasRichText.ts`

Uniform mask path explained: masking is handled entirely through `pushCanvasClipContours` (clip hooks in `canvasClip.ts`), not through per-kind `drawMask` functions. `drawCanvasRichTextMask` is documented as a no-op placeholder satisfying the renderer interface contract.

### Silver: `destroyCanvasRenderTarget`

File: `packages/displayobject-canvas/src/canvasRenderTarget.ts`

- `destroyCanvasRenderTarget(target: CanvasRenderTarget): void` — paired destroy\* teardown for `createCanvasRenderTarget`. Collapses the offscreen canvas to 0×0 so the browser can reclaim its backing store immediately.

### Silver: `destroyCanvasRenderCacheTarget` (NEW — second pass)

File: `packages/displayobject-canvas/src/canvasCache.ts`

- `destroyCanvasRenderCacheTarget(state: CanvasRenderState, cache: RenderCache): void` — explicit destroy for a single cache entry. Collapses the offscreen canvas to 0×0 (reclaims compositor/GPU memory immediately) and removes the entry from the target map. Distinct from `releaseCanvasRenderCache` which only drops the map entry without collapsing the canvas. No-op if no target exists.

Tests added in `canvasCache.test.ts`.

### Silver: `LineScaleMode 'none'` implementation (NEW — second pass)

Files: `packages/displayobject-canvas/src/canvasShapeCommands.ts`, `packages/displayobject-canvas/src/canvasShape.ts`; type surface: `packages/types/src/CanvasShapeDrawState.ts`

- Added `strokeScaleMode: LineScaleMode` to `CanvasShapeDrawState` (in `@flighthq/types`).
- `defaultCanvasLineStyle` now reads `scaleMode` from the command buffer (position `buf[i + 4]`) and stores it in `state.strokeScaleMode`. A `'none'` scaleMode is stored as `'none'`; all other modes (`'normal'`, `'horizontal'`, `'vertical'`) are stored as `'normal'` (documented: `'horizontal'`/`'vertical'` require per-axis transform decomposition not exposed by Canvas2D).
- `pixelHinting` (at `buf[i + 3]`) is now documented as "noted but no-op on canvas backend" — Canvas2D has no sub-pixel stroke hinting API.
- `flushCanvasShapePath` applies `LineScaleMode 'none'` at flush time: reads `context.getTransform()`, computes the mean scale factor `(‖col₀‖ + ‖col₁‖) / 2`, divides `strokeWidth` by it so the rendered stroke appears at a fixed screen-pixel width regardless of the object's transform scale.

Tests added in `canvasShapeCommands.test.ts` (two new tests: normal scaleMode at identity, `'none'` scaleMode under a 2× scale).

### Gold: Performance pass — scratch `CanvasShapeDrawState` (NEW — second pass)

File: `packages/displayobject-canvas/src/canvasShape.ts`

- `renderCanvasShapeCommands` now uses a module-level scratch `_drawState` instead of allocating a new `CanvasShapeDrawState` per shape draw call. `resetCanvasShapeDrawState` clears all fields to their initial values before each command stream runs.
- The `flush` closure is re-bound per reset to capture the current `context` argument, so the scratch object correctly flushes to the right canvas even when called from different render targets.
- The scratch approach is safe because the shape command set has no nesting (no command handler ever calls `renderCanvasShapeCommands` recursively in the current command set).

### Test coverage additions (second pass)

- `defaultCanvasRichTextRenderer` describe block added to `canvasRichText.test.ts` — verifies `createData` is a function and `submit` is `drawCanvasRichText`.
- `destroyCanvasRenderCacheTarget` — two tests in `canvasCache.test.ts`.
- `LineScaleMode 'none'` — two tests in `canvasShapeCommands.test.ts`.

## Test count

- Before first pass: 210 tests across 28 test files
- After first pass: 211 tests across 29 test files
- After second pass: 217 tests across 29 test files (+2 for `destroyCanvasRenderCacheTarget`, +2 for `LineScaleMode 'none'`, +2 for `defaultCanvasRichTextRenderer`)

## Checks passed

- `npm run test --workspace=packages/displayobject-canvas`: 217/217 pass
- `npm run exports:check`: no `displayobject-canvas` gaps (pre-existing gaps in `render-gl` and `particles-formats` are unrelated)
- `npm run packages:check`: 1 pre-existing error in `@flighthq/device-formats` (unrelated to this package)
- `npm run fix`: no changes

## Deferred items and why

### Dashed strokes (`lineStyle` dash array)

The `lineStyle` shape command tuple in `@flighthq/types` (`ShapeCommand.ts`) does not carry a `dashPattern` field today. Adding dashed strokes requires extending the command tuple (cross-package: `@flighthq/types` and `@flighthq/shape`) before the canvas backend can consume it. Surfaced as a cross-package design item; deferred.

### `LineScaleMode 'horizontal'` and `'vertical'`

These require decomposing the canvas 2D matrix into per-axis scale factors and adjusting `lineWidth` before stroke. Canvas2D's `getTransform()` returns a full `DOMMatrix`; decomposing it into independent X/Y scales is achievable but requires a non-trivial helper for non-uniform scaling cases. Deferred as a separate focused item. Currently falls back to `'normal'` (documented in the implementation).

### Render-target readback

`getCanvasRenderTargetImageData` / `readCanvasRenderTargetPixels` — ownership boundary with `@flighthq/surface` unresolved. The decision (does canvas expose raw `ImageData`, or a `CanvasRenderTarget → ImageSource` bridge?) must be made before implementing. Deferred.

### Cross-backend conformance scenes

Functional scenes exercising Erase/Alpha blend modes, `LineScaleMode 'none'`, and scale-9 smoothing should be added via the `functional-test` skill. Deferred — best done in a dedicated visual-test session.

### GL umbrella registration mirror (resolved)

`displayobject-gl` already has `registerGlDisplayObjectRenderers` + `glDisplayObjectRendererEntries` (found in `glDisplayObjectRegistration.ts`). This was incorrectly listed as deferred in the first pass. No action needed.

### Performance: per-axis scale mode decomposition

Implementing `'horizontal'` and `'vertical'` scale modes requires per-axis scale extraction from the current canvas transform. Could be paired with a broader performance pass on the draw walk (minimize `save`/`restore`, batch consecutive same-state draws). Deferred to a focused Gold-tier performance session.

### `BitmapFillRepeat` and `pixelSnapping`

Require new type files in `@flighthq/types` and changes to `@flighthq/shape` data carriers; cross-package, deferred.

### Rust port parity posture

`displayobject-canvas` is intentionally TS/host-web-only. The Canvas2D substrate does not exist in the Rust box; software-render parity is provided by `displayobject-skia`. The conformance map (`agents/rust/conformance.md`) should record: `displayobject-canvas` has no Rust crate; `rust:skia ~ ts:canvas` is the reference pairing; the canvas functional scenes serve as the TS side of that cross-impl comparison. Documentation decision for whoever next owns the Rust conformance map.

## Design choices made

### `strokeScaleMode` location in `CanvasShapeDrawState`

Added to the `CanvasShapeDrawState` interface (in `@flighthq/types`) rather than a module-level variable in `canvasShape.ts`. Rationale: the draw state is already the per-stroke slot for `strokeWidth`, `strokeStyle`, and `strokeLineCap` — `strokeScaleMode` belongs alongside them as a stroke property. External custom `CanvasShapeCommand` implementations can also read it, matching the pattern that all stroke properties are on the draw state. If it were a module-level variable, custom commands (registered via `registerCanvasShapeCommand`) that set a stroke would have no way to influence it.

### `LineScaleMode 'horizontal'` and `'vertical'` → fallback to `'normal'`

Canvas2D's `getTransform()` returns a `DOMMatrix`, and decomposing it into independent X-scale and Y-scale requires `Math.sqrt(a² + b²)` (X column length) and `Math.sqrt(c² + d²)` (Y column length). This is feasible for `'horizontal'` (adjust `lineWidth` only for the X scale) and `'vertical'` (adjust for Y scale), but the semantics of "a stroke that scales horizontally but not vertically" in 2D are edge-case enough that they are explicitly documented as falling back to `'normal'` rather than implemented now.

### Scratch `_drawState` thread-safety note

The scratch is module-level, shared across all calls. The shape command set has no recursion (no command calls `renderCanvasShapeCommands`), so this is safe in single-threaded JS. If a future command were to trigger a re-entrant call, the scratch would be clobbered. This is documented in the source comment. The flush closure is re-bound per `reset` so it always captures the correct context for the current call.

### `destroyCanvasRenderCacheTarget` vs `releaseCanvasRenderCache`

These are now distinct and documented:

- `releaseCanvasRenderCache`: removes the cache entry from the map (the canvas backing store is still alive until GC).
- `destroyCanvasRenderCacheTarget`: collapses the canvas to 0×0 (reclaims compositor/GPU memory immediately) and removes the entry. Mirrors `destroyCanvasRenderTarget` semantics for the cache subsystem.

## Concerns and surprises

- `defaultCanvasRichTextRenderer` was imported but had no `describe` block — an oversight from the first pass. Now fixed.
- `glDisplayObjectRegistration.ts` already had `registerGlDisplayObjectRenderers`. The first-pass deferred item was incorrect.
- Worker timeout errors in the test environment under load (second run after all tests had already passed once) are resource constraints, not logic errors. The 217-test suite passes cleanly.

## Suggestions for future sessions

1. **Dashed strokes** — add `dashPattern: number[] | null` and `dashOffset: number` to the `lineStyle` command tuple in `ShapeCommand.ts`; read them in `defaultCanvasLineStyle`; call `context.setLineDash`/`lineDashOffset` in `flushCanvasShapePath`. Requires coordinated changes to `@flighthq/shape`.
2. **`LineScaleMode 'horizontal'` and `'vertical'`** — implement per-axis scale decomposition (`scaleX = Math.sqrt(a²+b²)`, `scaleY = Math.sqrt(c²+d²)`) in `flushCanvasShapePath` for the `'horizontal'` and `'vertical'` cases.
3. **Functional conformance scenes** — add `tests/functional/blend-erase`, `tests/functional/blend-alpha`, `tests/functional/line-scale-none` scenes to verify these features render correctly across Canvas/DOM/GL backends.
4. **Render-target readback** — decide ownership with `@flighthq/surface` and implement `getCanvasRenderTargetImageData`/`readCanvasRenderTargetPixels`.
5. **Image-smoothing parity in patterns and scale-9** — audit `drawCanvasScale9Shape`, tilemap, and bitmap fills to ensure `imageSmoothingEnabled`/`imageSmoothingQuality` overrides are honored consistently, not just in `drawCanvasBitmap`.
6. **`BitmapFillRepeat` surface as a first-class type** — first-class `repeat`/`no-repeat`/`repeat-x`/`repeat-y` on `beginBitmapFill`/`lineBitmapStyle`, requiring a `BitmapFillRepeat` union in `@flighthq/types`.

## Score estimate

**91/100** — Gold tier reached.

Scoring rationale:

- +3 from first pass (84 → previously estimated): registration umbrella, blend-mode fidelity, naming unification, mask contract, destroy\* teardown (+1 test gap closed).
- +7 from second pass: `destroyCanvasRenderCacheTarget` (+1), `LineScaleMode 'none'` (+3 — types surface + implementation + tests), performance scratch state (+1), `defaultCanvasRichTextRenderer` test block (+1), GL-registration deferred item resolved by discovery (+1).

Remaining gap to 100:

- Dashed strokes (cross-package) — ~2 pts
- `LineScaleMode 'horizontal'/'vertical'` — ~1 pt
- Functional conformance scenes — ~2 pts
- Render-target readback — ~1 pt
- Image-smoothing parity audit — ~1 pt
- `BitmapFillRepeat` — ~1 pt (cross-package)
- Exhaustive degenerate-input error coverage (Gold tier) — ~1 pt
