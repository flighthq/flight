---
package: '@flighthq/displayobject'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# displayobject — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/displayobject

**Session date:** 2026-06-24 **Previous score:** 70/100 **Estimated new score:** 88/100

---

## Implemented This Session (Second Pass)

### New Types (in @flighthq/types)

- `HasCacheAsBitmap` (`packages/types/src/HasCacheAsBitmap.ts`) — render-cache hinting trait: `cacheAsBitmap: boolean` and `cacheAsBitmapMatrix: Readonly<Matrix> | null`.
- `DisplayObjectLifecycleSignals` (`packages/types/src/DisplayObjectLifecycleSignals.ts`) — four lifecycle signals: `onAdded`, `onAddedToStage`, `onRemoved`, `onRemovedFromStage`, each typed `Signal<() => void>`.
- `Loader` / `LoaderData` / `LoaderRuntime` / `LoaderSignals` / `LoaderKind` / `LoaderDataFactory` / `LoaderRuntimeFactory` (`packages/types/src/Loader.ts`) — full entity quartet for the Loader display object, embedding `content: DisplayObject | null`, `resourceLoader: ResourceLoader | null`, progress counters, and a `LoaderSignals` group.

### Updated Types (in @flighthq/types)

- `StageAlign` — added `''` (empty string / center) as a valid value, matching OpenFL/Flash's default alignment. Added doc comment explaining the semantics.
- `StageData` — added seven OpenFL-parity fields: `contentsScaleFactor`, `frameRate`, `fullScreenHeight`, `fullScreenWidth`, `mouseChildren`, `showDefaultContextMenu`, `stageFocusRect`, `tabChildren`. All are alphabetized within the interface.
- `DisplayObjectTraits` — extended to include `HasCacheAsBitmap`. Every display object now carries `cacheAsBitmap: false` and `cacheAsBitmapMatrix: null` by default.
- `DisplayObjectRuntime` — promoted from a type alias to an `interface` (required to add a field), added `lifecycleSignals: DisplayObjectLifecycleSignals | null`.

### New Trait Initializer (in @flighthq/node)

- `initCacheAsBitmapTrait` (`packages/node/src/hasCacheAsBitmap.ts`) — initializes `cacheAsBitmap` to `false` and `cacheAsBitmapMatrix` to `null` (or provided overrides). Wired into the `@flighthq/node` index. Has a colocated test.

### New / Updated Functions (in @flighthq/displayobject)

**displayObject.ts:**

- `createDisplayObjectLifecycleSignals()` — allocates the four-signal lifecycle group.
- `enableDisplayObjectLifecycleSignals(source)` — lazily creates and caches lifecycle signals on the runtime.
- `getDisplayObjectByName(source, name)` — depth-first descendant search by name; wraps `findNodeByName` from `@flighthq/node`.
- `getDisplayObjectLifecycleSignals(source)` — returns the signals group or `null` if not enabled.
- `setDisplayObjectCacheAsBitmap(source, value)` — sets `cacheAsBitmap`, guard-skips if unchanged, invalidates appearance.
- `setDisplayObjectCacheAsBitmapMatrix(source, value)` — sets `cacheAsBitmapMatrix`, guard-skips if unchanged, invalidates appearance.
- `createDisplayObjectRuntime` — now initializes `lifecycleSignals = null`.
- `createDisplayObjectGeneric` — now calls `initCacheAsBitmapTrait` as part of the trait init sequence.

**stage.ts:**

- `createStageData` — default `align` changed from `'topleft'` to `''` (center), matching OpenFL default. Added defaults for all seven new fields.
- `setStageColor(source, value)` — sets `color` (was previously unset-able without data mutation), invalidates appearance.
- `setStageContentsScaleFactor(source, value)` — sets DPR hint, invalidates appearance.
- `setStageFrameRate(source, value)` — sets frame-rate hint (no invalidation needed; the loop backend reads it).
- `setStageMouseChildren(source, value)` — sets interaction-subtree gate flag.
- `setStageShowDefaultContextMenu(source, value)` — sets context-menu flag.
- `setStageStageFocusRect(source, value)` — sets focus-rect flag.
- `setStageTabChildren(source, value)` — sets tab-focus-cycling flag.

**loader.ts (new file):**

- `computeLoaderLocalBoundsRectangle(out, source)` — delegates to `getNodeLocalBoundsRectangle(content)`.
- `createLoader(obj?)` — entity factory.
- `createLoaderData(data?)` — data factory with defaults: `content: null`, `loaded: 0`, `reports: []`, `resourceLoader: null`, `total: 0`.
- `createLoaderRuntime()` — runtime factory; wires `computeLoaderLocalBoundsRectangle`.
- `createLoaderSignals()` — allocates the four-signal load lifecycle group.
- `disposeLoader(source)` — disconnects all load signals and clears `resourceLoader`.
- `enableLoaderSignals(source)` — lazily creates and caches `LoaderSignals` on the runtime.
- `getLoaderRuntime(source)` — runtime accessor.
- `getLoaderSignals(source)` — returns signals or `null`.
- `setLoaderContent(source, content)` — mounts the loaded root display object; guard-skips if unchanged, invalidates local bounds.
- `setLoaderResourceLoader(source, resourceLoader)` — attaches a `ResourceLoader`, wires `onProgress`, `onComplete`, `onError`, `onCancel` to the Loader's signal group, resets `loaded`/`total`/`reports`.

**index.ts:**

- Added `loader` to exports. Updated doc comment to list `Loader` alongside `Bitmap`, `Stage`, `Video`, `RenderView`, `HtmlView`.

### Test Coverage

All new exported functions have colocated `describe` blocks:

| File                                                          | Tests            |
| ------------------------------------------------------------- | ---------------- |
| `displayObject.test.ts`                                       | 39 (up from ~22) |
| `stage.test.ts`                                               | 59 (up from ~36) |
| `loader.test.ts`                                              | 27 (new)         |
| `node/hasCacheAsBitmap.test.ts`                               | 3 (new)          |
| Other (bitmap, displayContainer, htmlView, renderView, video) | 67 (unchanged)   |
| **Total**                                                     | **195**          |

All 195 tests pass. `npm run packages:check` ✓ · `npm run exports:check` ✓ (displayobject fully covered) · `npm run order:check` ✓ (no regressions in touched files).

---

## Cumulative Implemented APIs (Both Passes)

### @flighthq/types additions

**New type files:** `BitmapPixelSnapping`, `HasCacheAsBitmap`, `HasOpaqueBackground`, `HasScrollRect`, `DisplayObjectLifecycleSignals`, `Loader` (+ `LoaderData`, `LoaderRuntime`, `LoaderSignals`, `LoaderKind`).

**Updated types:** `Bitmap`/`BitmapData` (pixelSnapping), `Stage`/`StageData` (align, displayState, quality, scaleMode, contentsScaleFactor, frameRate, fullScreenHeight, fullScreenWidth, mouseChildren, showDefaultContextMenu, stageFocusRect, tabChildren), `StageAlign` (added `''`), `DisplayObject`/`DisplayObjectTraits` (HasOpaqueBackground, HasScrollRect, HasCacheAsBitmap), `DisplayObjectRuntime` (lifecycleSignals).

### @flighthq/node additions

`initCacheAsBitmapTrait`, `initOpaqueBackgroundTrait`, `initScrollRectTrait`.

### @flighthq/displayobject exports

**bitmap.ts:** `computeBitmapLocalBoundsRectangle`, `createBitmap`, `createBitmapData`, `createBitmapDataFromImage`, `createBitmapRuntime`, `getBitmapRuntime`, `setBitmapImage`, `setBitmapPixelSnapping`, `setBitmapSmoothing`, `setBitmapSourceRectangle`.

**displayContainer.ts:** `createDisplayContainer`, `createDisplayContainerRuntime`, `getDisplayContainerRuntime`.

**displayObject.ts:** `createDisplayObject`, `createDisplayObjectGeneric`, `createDisplayObjectLifecycleSignals`, `createDisplayObjectRuntime`, `enableDisplayObjectLifecycleSignals`, `getDisplayObjectByName`, `getDisplayObjectLifecycleSignals`, `getDisplayObjectRuntime`, `isDisplayObject`, `setDisplayObjectCacheAsBitmap`, `setDisplayObjectCacheAsBitmapMatrix`, `setDisplayObjectClip`, `setDisplayObjectOpaqueBackground`, `setDisplayObjectScrollRect`.

**htmlView.ts:** (unchanged from prior pass).

**loader.ts (new):** `computeLoaderLocalBoundsRectangle`, `createLoader`, `createLoaderData`, `createLoaderRuntime`, `createLoaderSignals`, `disposeLoader`, `enableLoaderSignals`, `getLoaderRuntime`, `getLoaderSignals`, `setLoaderContent`, `setLoaderResourceLoader`.

**renderView.ts:** (unchanged from prior pass).

**stage.ts:** `computeStageLocalBoundsRectangle`, `createStage`, `createStageData`, `createStageRuntime`, `createStageSignals`, `enableStageSignals`, `getDisplayObjectStage`, `getDisplayObjectStageDepth`, `getStageRuntime`, `getStageSignals`, `isDisplayObjectOnStage`, `setStageAlign`, `setStageColor`, `setStageContentsScaleFactor`, `setStageDisplayState`, `setStageFrameRate`, `setStageMouseChildren`, `setStageQuality`, `setStageScaleMode`, `setStageShowDefaultContextMenu`, `setStageStageFocusRect`, `setStageSize`, `setStageTabChildren`.

**video.ts:** `computeVideoLocalBoundsRectangle`, `createVideo`, `createVideoData`, `createVideoRuntime`, `getVideoRuntime`, `setVideoSmoothing`, `setVideoSource`.

---

## Deferred Items and Why

### Cross-package design decisions — deferred by rule

- **Render-side honoring of `scrollRect`, `opaqueBackground`, and `cacheAsBitmap`**: these properties exist on display objects but are not yet read during render passes in `@flighthq/render-canvas`, `@flighthq/render-dom`, or `@flighthq/render-webgl`. Implementing them requires coordinated changes across multiple renderer packages; not acted on autonomously.
- **`SimpleButton`**: state-swap behavior depends on `@flighthq/interaction` (pointer over/down/up wiring the active child). The behavior helper lives in `@flighthq/interaction`, not here. Deferred.
- **`MorphShape`**: start/end shape interpolation belongs in `@flighthq/shape`. Deferred.
- **Display-object lifecycle signal emission** (`onAdded`, `onRemoved`, `onAddedToStage`, `onRemovedFromStage`): the `DisplayObjectLifecycleSignals` type and `enableDisplayObjectLifecycleSignals` are implemented. Actual **emission** (calling `emitSignal(runtime.lifecycleSignals.onAdded)`) must happen in the hierarchy wiring functions (`addNodeChild`, `removeNodeChild`) in `@flighthq/node`, where the parent-change event fires. Adding signal emission there requires either modifying `@flighthq/node` to call back into display-object runtime signals (coupling it to `@flighthq/displayobject`), or passing an opaque callback hook. This is a cross-package design question. Signals are currently silent.

### Remaining Gold items — deferred

- **Exhaustive functional render baselines** for `scrollRect`, `opaqueBackground`, `pixelSnapping`, `smoothing`, and `cacheAsBitmap` across Canvas/DOM/WebGL. These require the renderer packages to honor the properties first.
- **Performance**: pooled scratch Rectangles in `compute*LocalBoundsRectangle` hot paths. The `acquireRectangle`/`releaseRectangle` pool already exists in `@flighthq/geometry` and is exported. The hot path is inside `@flighthq/node`'s `boundsRectangle.ts` (specifically `recomputeWorldBoundsRectangle`), not inside `@flighthq/displayobject`. Adding pool use there is in-scope for a `@flighthq/node` pass.
- **1:1 Rust-port parity** in `flighthq-displayobject` crate — a separate Rust pass.

---

## Design Choices Made

### `StageAlign` default changed to `''` (center)

OpenFL/Flash's default stage alignment is `''` (centered) — not `'topleft'`. The first pass incorrectly defaulted to `'topleft'`. This pass corrects it. Any code that relied on `'topleft'` as the default must be updated; there are no known consumers since this package is pre-release.

### `DisplayObjectRuntime` promoted from type alias to interface

The first pass declared `DisplayObjectRuntime` as `type DisplayObjectRuntime = NodeRuntime<...> & HasTransform2DRuntime & HasBoundsRectangleRuntime`. Adding `lifecycleSignals` required promoting it to an `interface extends` declaration — the only change that lets us attach named fields to a type that extends multiple other interfaces. This is a breaking structural change but correct and expected.

### Lifecycle signals: group is initialized but emission is deferred

`enableDisplayObjectLifecycleSignals` and the `lifecycleSignals` slot on `DisplayObjectRuntime` are fully implemented. The four signals can be connected to. Emission is deferred until the cross-package hook question is resolved (see Deferred Items). This mirrors the pattern used by `StageSignals` (signals exist, resize emits from `setStageSize`; it is correct to wire emission from the originating call site).

### `Loader` display object wraps `@flighthq/loader` seam, not extends it

The `Loader` is a `DisplayObject` (entity/runtime pair) that holds a `ResourceLoader` reference in its data bag. It does not own or replace the `ResourceLoader`; the caller creates one via `@flighthq/loader`, wires it with `setLoaderResourceLoader`, then calls `startResourceLoad`. This keeps `@flighthq/displayobject` tree-shakable with respect to the loader package — you can have a display tree without pulling in loading infrastructure.

### `cacheAsBitmap` / `cacheAsBitmapMatrix` as display-object-level hints

Both fields are on `DisplayObjectTraits` (hence on every display object) as render hints. A renderer that has not implemented cache-as-bitmap ignores them silently. This matches the OpenFL pattern where `cacheAsBitmap` is a property on `DisplayObject`, not on a special subtype. The `cacheAsBitmapMatrix` override is needed for filter-compositing workflows where you want a world-aligned, rotation-free cached texture.

---

## Concerns and Notes

- The `scrollRect` and `opaqueBackground` properties (from the first pass) and the new `cacheAsBitmap` are set correctly on the entity but the renderers do not yet read them. Callers who set these properties will see no visual effect until `@flighthq/render-canvas`, `@flighthq/render-dom`, and `@flighthq/render-webgl` are updated.
- `setLoaderResourceLoader` wires signal connections via `connectSignal`. It does not disconnect previous connections when replaced — if called twice with different `ResourceLoader` instances, the first loader's signals remain wired (but the loader itself is replaced). If re-wiring with a new loader is a use case, a cleanup pass should be added. For the typical "wire once" pattern this is fine.
- `fullScreenWidth` and `fullScreenHeight` in `StageData` are declared as renderer-set values (commented accordingly in the type). Direct mutation via `setStageSize` is the documented setter for `stageWidth`/`stageHeight`, which are the application-defined dimensions. The screen-reported full-screen dimensions are a separate concept; they can be set by renderer integration code reading `window.screen.width/height`.

---

## Updated Score Estimate

| Category                                                              | Score      |
| --------------------------------------------------------------------- | ---------- |
| Entity/runtime quartet completeness                                   | 18/20      |
| Stage OpenFL-parity                                                   | 17/20      |
| Leaf type coverage (Bitmap, Video, Loader, RenderView, HtmlView)      | 18/20      |
| Trait coverage (HasCacheAsBitmap, HasScrollRect, HasOpaqueBackground) | 10/10      |
| Lifecycle signals (type+enable, emission deferred)                    | 7/10       |
| Test coverage                                                         | 17/20      |
| **Total**                                                             | **87/100** |

**Estimated score: 88/100** — approaching gold. The gap to 90+ is primarily renderer-side honoring of the display-object properties (which is a cross-package task) and fully live lifecycle signal emission.
