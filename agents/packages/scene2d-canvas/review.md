---
package: '@flighthq/scene2d-canvas'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - package.json
  - assessment.md
---

# scene2d-canvas — Review

## Verdict

`solid -- 78/100`. The Canvas 2D leaf renderer for the display-object subject family is well-structured: 12 per-kind renderers over a shared draw-state spine, open registries for shape commands and materials, explicit registration with no top-level side effects, deterministic teardown, and a `CanvasPipeline` entity (`createCanvasPipeline` / `scene2dCanvasPipeline`) that wires the whole assembly. The architectural decisions are sound -- closed blend-mode table for the finite `BlendMode` enum on the hot path, open registries for genuinely extensible axes (shape commands, materials), and side-effect-free tree-shakable exports.

The distance to authoritative is in three areas: (1) known correctness defects within the package itself (hard-coded image-smoothing restoration, per-frame draw-state allocation, skipped `lineStyle` arguments), (2) feature breadth blocked on upstream `@flighthq/types` / `@flighthq/shape` changes (dashed strokes, per-axis `LineScaleMode`, bitmap-fill repeat), and (3) absence of cross-backend functional conformance scenes to prove rendered-pixel fidelity. The prior review (2026-08-25) scored this package at 92, but that score was based on several false claims inherited from a 2026-06-24 builder pass -- an umbrella `registerCanvasDisplayObjectRenderers`, an `enable*Support` naming unification, a `strokeScaleMode` field on `CanvasShapeDrawState`, and a module-level scratch draw state -- none of which exist in source. The 2026-08-08 status log already corrected these. This review re-grounds every claim against the live source.

## Present capabilities

Verified against `packages/scene2d-canvas/src/` as of this review date:

- **12 per-kind renderers in `scene2dCanvasPipeline`**: BitmapText, DisplayObject (no-op container), MorphShape (alias of Shape), ParticleEmitter2D, QuadBatch, RenderCache, RichText, Scale9Shape, Shape, Sprite, TextLabel, Tilemap. Each is a `{ createData, submit }` object. The pipeline entity registers all 12 via `withRegistryTableEntry` against `@flighthq/registry`'s `KeyedTable<Renderer>`. No Video renderer exists (the charter names it; the pipeline does not carry it).

- **`CanvasPipeline` entity**: `createCanvasPipeline` wraps registries in an Entity; `getCanvasPipelineRegistries` reads them back; `createEmptyCanvasRegistries` builds the three registry tables (renderers, renderEffects, strokeTessellator). The `scene2dCanvasPipeline` const is the turnkey assembly with all 12 renderers, the native blend-mode application function, and the 16-command shape-command table.

- **Shape command spine**: 16 commands registered by `canvasShapeCommandTable()` -- 14 in `defaultCanvasShapeCommands` (beginFill, beginGradientFill, cubicCurveTo, curveTo, drawCircle, drawEllipse, drawPath, drawRectangle, drawRoundRectangle, endFill, lineGradientStyle, lineStyle, lineTo, moveTo) plus 2 texture-backed commands in `defaultCanvasTextureShapeCommands` (beginTextureFill, lineTextureStyle). Each carries a `draw` function and paired `fillBounds`/`strokeBounds` functions delegating to `@flighthq/shape`. The command set is extensible through `registerCanvasShapeCommand` / `registerCanvasShapeCommands`.

- **Material seam**: `canvasMaterialRegistry.ts` provides `registerCanvasMaterialRenderer`, `resolveCanvasMaterialRenderer`, `getCanvasMaterialRenderer`, and `applyCanvasMaterial`. The apply function brackets a `save`/`restore` only when a material contributes draw state (composite, filter) -- the common no-material path pays nothing.

- **Blend modes**: `CANVAS_BLEND_MODE` maps `BlendMode` (6 values) and `AdvancedBlendMode` (11 values) to `globalCompositeOperation` strings. `applyCanvasBlendMode` caches the current mode on the runtime to skip redundant context writes. `enableCanvasBlendMode` installs the application function on the state, keeping it tree-shakable.

- **Clipping**: `enableCanvasClip` installs `Scene2DClipHooks` that push/pop rectangular and contour-path clips through `ctx.save()`/`ctx.clip()`/`ctx.restore()`. Uniform bracket -- no per-form dispatch on pop.

- **Render traversal**: `renderCanvasScene2D` implements an iterative depth-first traversal using a stack on the runtime. Resolves clip hooks, CSS filters, and per-kind renderer submission per node.

- **Offscreen targets and caching**: `canvasRenderTarget.ts` provides `create`/`begin`/`end`/`resize`/`destroy` for `CanvasRenderTarget` with a nestable pass stack. `canvasCache.ts` provides `enableCanvasRenderCache`, `createCanvasCacheState`, `refreshCanvasRenderCache`, `ensureCanvasRenderCacheTarget`, `destroyCanvasRenderCacheTarget`, `releaseCanvasRenderCache`. The cache bakes a subtree into an offscreen canvas using a dedicated offscreen render state.

- **Render textures**: `canvasRenderTexture.ts` provides `renderIntoCanvasRenderTexture`, `writeCanvasRenderTextureTarget`, `bindCanvasRenderTexture`, `destroyCanvasRenderTexture`, `explainCanvasRenderTexture`. `canvasRenderTexturePool.ts` provides pooled acquire/release/destroy with leak-safe `withCanvasRenderTextures`.

- **Texture resolution**: `canvasTextureResolver.ts` implements a per-source-kind resolver registry (`registerCanvasTextureResolver`) with typed resolvers for bitmaps (`canvasBitmapTextureResolver.ts`), images (`canvasImageTextureResolver.ts`), and render textures (`canvasRenderTextureResolver.ts`). `connectCanvasTextureResolverMisses` wires a resolver set to a render state's diagnostics emitter. `explainCanvasTextureResolution` returns plain data about a texture's resolution status.

- **CSS filter binding**: `canvasCSSFilterBinding.ts` stores per-render-proxy filter strings in a WeakMap and applies them as `context.filter` around the draw. `enableCanvasCssFilter` installs the resolver on the state -- filter-free states leave it null and the module tree-shakes.

- **Text rendering**: `canvasRichText.ts` renders RichText fields (background, border, text groups with underline/strikethrough, selection highlight, bullet lists, scroll). `canvasTextLabel.ts` renders single-format TextLabel with layout caching keyed by content revision. `canvasTextMeasure.ts` provides measurement. `canvasTextInput.ts` draws the editable-field overlay (caret blink, selection rectangles) and is opt-in through `enableCanvasTextInput`.

- **Shape rasterizer bridge**: `canvasShapeRasterizer.ts` exposes `createCanvasShapeRasterizer` -- builds a `ShapeRasterizer` closure that GPU and DOM backends register to draw fills they cannot tessellate.

- **Diagnostics**: `explainCanvasScene2DCoverage` / `hasCanvasScene2DCoverage` compose the base render coverage check with Canvas-specific material-renderer coverage. `enableCanvasTextureResolverGuards` / `areCanvasTextureResolverGuardsEnabled` delegate to render registry guards.

- **Test coverage**: 44 source files, 44 colocated test files (`contract.ts` and `index.ts` are re-export barrels, correctly untested). Every non-barrel source file has a paired `.test.ts`.

- **Package shape**: two export lanes (`.` and `./contract`), `"sideEffects": false`, `"type": "module"`. The public `.` lane curates 72 exports; `./contract` re-exports everything. `createCanvasShapeRasterizer` is exported only through `index.ts`, not `contract.ts` (intentional: it is public-only, not intra-SDK).

## Gaps

Verified against the AAA display-object feature target and the charter:

- **Image-smoothing restoration is hard-coded to `true`.** Five files (`canvasSprite.ts:33`, `canvasTilemap.ts:61`, `canvasParticleEmitter2D.ts:67`, `canvasBitmapText.ts:67`, `canvasQuadBatch.ts:91`) restore `imageSmoothingEnabled` to `true` after drawing with nearest-filter smoothing disabled. The correct value is `runtime.imageSmoothingEnabled` as set by `createCanvasRenderState` from options. A state created with smoothing off silently gets it back after the first nearest-filter draw. This is a within-package correctness bug.

- **Per-frame `CanvasShapeDrawState` allocation.** `renderCanvasShapeCommands` (`canvasShape.ts:43`) calls `createCanvasShapeDrawState` every invocation, allocating a fresh object with a `flush` closure. For a scene with many shapes this is measurable GC pressure on the hot path. The status doc identifies this; a module-level scratch with per-call reset is the known fix.

- **`lineStyle` drops `pixelHinting` and `scaleMode`.** `defaultCanvasLineStyle` reads `buf[i]` (thickness), `buf[i+1]` (color), `buf[i+2]` (alpha), `buf[i+5]` (caps), `buf[i+6]` (joints), `buf[i+7]` (miterLimit), skipping indices 3 and 4. `CanvasShapeDrawState` (in `@flighthq/types`) has no `strokeScaleMode` field, so all four `LineScaleMode` values render identically. Adding the field is a `@flighthq/types` change; reading and applying it spans both `@flighthq/types` and this package.

- **No dashed strokes.** The `lineStyle` command tuple carries no dash fields, and no source calls `setLineDash`. Blocked on `dashPattern`/`dashOffset` fields in `@flighthq/types` + `@flighthq/shape`.

- **No Video renderer.** The charter lists Video as a node kind this package covers; `scene2dCanvasPipeline` does not register one, and no `canvasVideo.ts` source file exists. Either the charter should drop Video from its kind list, or a renderer must be implemented.

- **Three manifest dependencies unused by source.** `@flighthq/log` appears only in `enableCanvasTextureResolverGuards.test.ts`, `@flighthq/textureatlas` only in `canvasQuadBatch.test.ts` and `canvasTilemap.test.ts`, and `@flighthq/signals` in no file at all. All three should be `devDependencies` (the first two) or removed entirely (`signals`).

- **`BitmapFillRepeat` / `pixelSnapping` absent.** `beginTextureFill` accepts no repeat-mode or pixel-snapping parameters. The four-way repeat union and `pixelSnapping` knob need upstream types.

- **Image-smoothing parity across kinds.** `canvasSprite.ts` checks `texture.sampler.magFilter` to decide smoothing; `canvasBitmapText.ts` uses the coarser `state.allowSmoothing` flag directly. Scale-9, tilemap, and pattern fills have not been audited for consistent behavior.

- **No cross-backend functional conformance scenes.** No functional test scenes exist to verify Canvas rendering of Erase/Alpha blend, scale-mode, scale-9, or any kind against the same scenes rendered by GL/WGPU/DOM backends. jsdom unit tests prove API wiring, not pixel fidelity.

- **`CanvasRenderStateHandles` cast pattern.** Defined identically in both `canvasRenderTarget.ts` and `canvasCache.ts` (a narrow writable view of readonly canvas/context handles). Used at `canvasRenderTarget.ts:42,94,116` and `canvasCache.ts:160`. AGENTS.md names the `state as *Internal` writable-handles pattern as legacy and calls for runtime slots, but the render-target redirection is the one case that genuinely needs to swap handles.

- **`canvasQuadBatch.ts` has commented-out dead code** (lines 94-95: `// popClip(state);` / `// rectanglePool.releaseMatrix(rect);`). Dead comments should be removed.

## Charter contradictions

- **Video kind gap.** The charter's kind list includes "Video" alongside Bitmap, DisplayObject, ParticleEmitter, QuadBatch, RichText, Scale9Shape, Shape, Sprite, TextLabel, and Tilemap. The pipeline does not register a Video renderer and no source file implements one. Either the charter should be updated to drop Video, or the renderer should be added.

- **No other contradictions.** The charter otherwise accurately describes the package's scope, boundaries, and non-goals. The pipeline entity (`CanvasPipeline`) and turnkey const (`scene2dCanvasPipeline`) match the charter's "single root export" and "no umbrella registerAll" decisions. The `crate: null` posture matches the host-web-only boundary.

## Contract and docs fit

**Aligned with the codebase contract:**

- **Types in `@flighthq/types`.** `CanvasShapeDrawState`, `CanvasRenderState`, `CanvasRenderStateRuntime`, `CanvasPipeline`, `CanvasRenderRegistries`, `CanvasShapeCommand`, `CanvasTextureResolvers`, `CanvasMaterialRenderer`, and all other types used by this package are defined in `@flighthq/types`. No exported types are defined inline.

- **Full unabbreviated names.** Every export carries `Canvas` + the operated-on type word: `createCanvasPipeline`, `getCanvasPipelineRegistries`, `registerCanvasShapeCommands`, `resolveCanvasMaterialRenderer`, `enableCanvasBlendMode`, etc. No abbreviations.

- **Teardown verbs.** `destroyCanvasRenderTarget` / `destroyCanvasRenderCacheTarget` / `destroyCanvasRenderTexture` / `destroyCanvasRenderTexturePool` use `destroy*` correctly (they free non-GC compositor backing stores immediately). `releaseCanvasRenderCache` / `releaseCanvasRenderTexture` use `release*` correctly (cache/pool slot brackets).

- **Sentinels not throws.** `resolveCanvasMaterialRenderer`, `getCanvasMaterialRenderer`, `resolveCanvasTexture`, `getCanvasShapeCommand` return `null` for unregistered keys. `destroyCanvasRenderTarget` is a no-op on a destroyed surface. Throws are reserved for programmer errors: `createCanvasElement` on surface acquisition failure, `createCanvasRenderTarget` on surface failure, `releaseCanvasRenderTexture` on a texture not leased from the pool, `assertUsablePool` on a destroyed pool.

- **Side-effect-free.** `"sideEffects": false` declared. No top-level registration. Every wire-up is an explicit `register*`/`enable*` call. The pipeline const is eagerly built but registering it onto a render state is the caller's explicit act.

- **Two export lanes.** `.` (index.ts) curates 72 named exports; `./contract` (contract.ts) re-exports every module. No subpath exports beyond these two.

- **Open/closed line drawn correctly.** `CANVAS_BLEND_MODE` is a closed `Record<BlendMode, ...>` on the per-draw hot path -- `BlendMode` is a finite enum, the table is fully auditable. Shape commands, materials, and texture resolvers are open registries. This matches the "open where the domain is open, closed where it is finite" charter rule.

- **Diagnostics pattern.** `enableCanvasTextureResolverGuards` is a separately importable guard opt-in. `explainCanvasScene2DCoverage` and `explainCanvasTextureResolution` return plain data. `resolveCanvasTexture` reports misses through the `registryMiss` seam rather than logging directly. Aligns with the diagnostics convention.

**Structural observations:**

- `canvasTestSupport.ts` re-exports from `canvasRenderState`, `canvasRenderTarget`, and `canvasTextureResolver` with `export *`, creating test-only convenience wrappers. This file is exported through `contract.ts` but not through `index.ts`. These re-exports mean the contract lane carries test helpers -- acceptable only if other packages' tests genuinely need them; otherwise they should be test-only.

- The `CanvasRenderStateHandles` type is defined identically in two files. A single shared type (or a runtime-slot approach) would eliminate the duplication.

## Candidate open directions

These are questions from the charter's Open directions section, verified as still open:

1. **Scope of the Canvas backend vs. `scene2d-skia`.** Undecided. This gates how hard to push canvas-specific fidelity (dashed strokes, per-axis scale modes) vs. deferring to the shared rasterizer.

2. **Render-target readback ownership.** The 2026-08-08 status log notes that `createBitmapFromCanvas` in `@flighthq/bitmap` reads back via the plain `CanvasRenderTarget.canvas`, settling the ownership line in `@flighthq/bitmap`'s favor. The charter still lists this as open; it may be settled enough to close.

3. **Fidelity floor for unsupported blend modes.** No `BlendMode` values are currently unmappable -- the fixed-function set maps to Canvas natively, and the `AdvancedBlendMode` set also maps natively. The charter's concern about `Invert`/`Shader`/`Subtract` predates the type refactoring that moved those out of `BlendMode` into `CompositeEffect`. This direction may be closeable.

4. **Cross-backend functional conformance scenes.** No scenes exist. This remains the single largest gap to authoritative.

5. **The line between "Canvas command" extensibility and `@flighthq/shape`.** Several features (dash, bitmap-fill repeat, pixel-snapping) are blocked on upstream tuple changes. The boundary question remains open.

6. **`LineScaleMode 'horizontal'` / `'vertical'`.** Still fall back to `'normal'`. No `strokeScaleMode` field exists on `CanvasShapeDrawState` to carry the mode, and `defaultCanvasLineStyle` does not read `buf[i+4]`. Implementing any `LineScaleMode` support requires adding the field to `@flighthq/types` first.

7. **Image-smoothing parity across kinds.** Unaudited. Different kinds use different smoothing decision logic.

8. **Video renderer absence.** The charter names Video; the pipeline omits it.
