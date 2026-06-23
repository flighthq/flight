# Depth Review: @flighthq/displayobject-canvas

**Domain**

Canvas 2D leaf renderer for the Flight display-object scene graph. This is the per-subject backend that takes prepared `RenderProxy2D` nodes and rasterizes every 2D display-object kind (bitmap, shape, sprite, tilemap, quad-batch, particles, text label, rich text, text input overlay, video, scale-9) into an `HTMLCanvasElement` via `CanvasRenderingContext2D`. The authoritative bar here is "a complete, idiomatic Canvas2D backend for an OpenFL/Flash-style 2D display list" — i.e. every primitive the scene graph can express has a faithful Canvas2D draw path, plus the cross-cutting backend concerns: transforms, alpha, blend modes, clipping/masking, offscreen render targets, cache-as-bitmap, image smoothing, and a filter seam.

**Verdict: solid — 78/100**

For the scope of a Canvas2D backend (not a standalone graphics library, but a renderer that conforms to the `@flighthq/render` contract), this package is broad and close to complete. Every display-object kind in the scene graph has a draw function and a paired renderer object, the shape command set is comprehensive, and the cross-cutting concerns (blend, clip, filter, render target, cache, materials) are all present as opt-in seams. It falls short of "authoritative" mainly on registration ergonomics, blend-mode fidelity gaps that silently degrade, and a few canvas-specific quality knobs.

## Present capabilities

- **Full per-kind draw coverage.** Every 2D kind has a `drawCanvas*` function plus an exported `defaultCanvas*Renderer` object conforming to `DisplayObjectRenderer`/`SpriteRenderer`: bitmap, shape, scale-9 shape, sprite, tilemap, quad-batch, particle emitter, text label, rich text (+ `drawCanvasRichTextMask`), text input overlay, video, plain display object (no-op geometry), and the cache renderer. This is the complete leaf set the scene graph can produce.
- **Comprehensive shape command set** (`canvasShapeCommands.ts`, 16 commands): `beginFill`, `beginGradientFill`, `beginBitmapFill`, `lineStyle` (with caps, joints, miterLimit), `lineGradientStyle`, `lineBitmapStyle`, `moveTo`, `lineTo`, `curveTo`, `cubicCurveTo`, `drawCircle`, `drawEllipse`, `drawRectangle`, `drawRoundRectangle`, `drawPath`, `endFill`. The command set is extensible via `registerCanvasShapeCommand`/`registerCanvasShapeCommands` and queryable via `getCanvasShapeCommand` — a clean registry seam matching the Flash Graphics vocabulary.
- **Fill patterns / gradients** (`canvasFillPattern.ts`): real `CanvasGradient`/`CanvasPattern` construction for gradient and bitmap fills and strokes.
- **Blend modes** (`canvasMaterials.ts`): an auditable `BlendMode → globalCompositeOperation` map covering Add, Darken, Difference, Hardlight, Layer, Lighten, Multiply, Normal, Overlay, Screen; opt-in via `enableCanvasBlendModeSupport`, with per-frame state-change minimization.
- **Clipping & masking** (`canvasClip.ts`, `canvasClipRectangle.ts`): rectangle clip stack (`pushCanvasClipRectangle`/`popCanvasClipRectangle`) and arbitrary contour clipping with winding (`pushCanvasClipContours`), opt-in via `enableCanvasClipSupport`. Rich-text mask path present.
- **Offscreen render targets** (`canvasRenderTarget.ts`): `create`/`resize`/`begin`/`end` with a render transform — the substrate for filters and cache.
- **Cache-as-bitmap** (`canvasCache.ts`): a full cache subsystem — `createCanvasCacheState`, `ensure`/`get`/`release` cache target, `refreshCanvasRenderCache` with options, `enableCanvasRenderCache`, and `defaultCanvasRenderCacheRenderer`.
- **Materials seam** (`canvasMaterialRegistry.ts`, `canvasMaterials.ts`): `registerCanvasMaterialRenderer`/`get`/`resolve`/`applyCanvasMaterial` — a per-state material renderer registry, the canvas analogue of the GL shader seam.
- **CSS filter seam** (`canvasCSSFilterBinding.ts`): `setCanvasCssFilter`/`getCanvasCssFilter`/`resolveCanvasCssFilter`, opt-in via `enableCanvasCssFilterSupport`, applied through `context.filter` around each object's draw — the Canvas-native filter path the codebase map calls for.
- **Image smoothing control**: per-state `imageSmoothingEnabled`/`imageSmoothingQuality`, plus per-bitmap smoothing override honored in `drawCanvasBitmap`.
- **Text input**: `enableCanvasTextInput` + `registerCanvasTextInputOverlay` + `drawCanvasTextInputOverlay` — an editable-text overlay seam, not just static text.
- **Tree-shaking discipline**: every cross-cutting feature (blend, clip, css-filter, cache, text-input) is a nullable hook installed by an `enable*` function, so a minimal bitmap-only consumer pulls in none of it. Background path deliberately bypasses the blend map to keep it out of small bundles. This matches the project's "gate optional subsystems with nullable hooks" rule exactly.

## Gaps vs an authoritative Canvas2D backend library

- **No umbrella registration function.** There is no `registerCanvasRenderers(state)` (or `registerCanvasDisplayObjectRenderers`) that wires all `defaultCanvas*Renderer` objects into the render registry in one call. A consumer must hand-register each kind individually: `registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer)`, repeated ~12 times, and must know which kinds exist and which renderer pairs with each. For an "authoritative" backend this is the single biggest ergonomics gap — every other backend (`displayobject-gl`, `displayobject-wgpu`) presumably needs the same boilerplate, and the canonical shape is a one-call register-all (still tree-shakable if it stays a thin re-export the consumer opts into). This is a gap-by-omission, not by-design.
- **Silent blend-mode degradation.** `Alpha`, `Erase`, `Invert`, `Subtract`, `Shader` map to `null` and silently fall back to `source-over`. Canvas2D _can_ express several of these: `Erase` ≈ `destination-out`, `Alpha` ≈ `destination-in`, and `Invert`/`Subtract` are achievable via `difference`/composite tricks or a per-pixel pass. An authoritative backend would either implement these (OpenFL's `ERASE`/`ALPHA` are commonly used with masks) or document them as explicitly unsupported rather than degrading them to normal. Today the map comment notes "no faithful equivalent," but `destination-out`/`destination-in` are faithful for Erase/Alpha — these look like omissions.
- **Line-style fidelity.** `lineStyle` handles caps/joints/miterLimit but there is no evidence of dashed strokes (`setLineDash`), pixel-hinting, or scale-mode (`LineScaleMode` — none/normal/vertical/horizontal). Flash/OpenFL `lineStyle` carries `pixelHinting` and `scaleMode`; a canonical port would cover them or mark them unsupported.
- **No tiling/repeat control surfaced for patterns beyond default.** `beginBitmapFill` exists; repeat vs no-repeat / smoothing flags for the pattern are not visible in the exported surface (may be handled internally, but not a first-class knob).
- **No explicit anti-alias / quality toggle** beyond image smoothing — acceptable since Canvas2D AA is implicit, so this is missing-by-platform, not by-omission.
- **No readback / pixel snapshot helper** (e.g. a `getCanvasRenderTargetImageData`-style accessor). The cache subsystem implies offscreen pixels exist; surfacing a snapshot path would round out the backend, though `@flighthq/surface` likely owns that — reasonably missing-by-design.

## Naming / API-shape notes

- Naming is consistent and self-identifying: `drawCanvas<Kind>`, `defaultCanvas<Kind>Renderer`, `enableCanvas<Feature>Support`, `register/get/resolveCanvas*`. Backend-prefix-first (`canvasBitmap.ts`, `canvasShapeCommands.ts`) matches the recorded filename philosophy for backend packages.
- `enable*Support` vs `enable*` is slightly inconsistent: `enableCanvasBlendModeSupport`, `enableCanvasClipSupport`, `enableCanvasCssFilterSupport` carry the `Support` suffix, but `enableCanvasRenderCache` and `enableCanvasTextInput` do not. Pick one convention.
- The `enable*`/nullable-hook opt-in pattern is exactly right for tree-shaking and reads cleanly.
- `drawCanvasRichTextMask` is the only `*Mask` draw exported; if other kinds can serve as masks via `drawMask`, the renderer objects only expose `submit`, not a `drawMask` member — worth confirming the mask contract is uniform across kinds rather than special-cased to rich text.
- Free-function + entity/runtime split is clean: `CanvasRenderState` carries readonly handles, runtime state lives under `EntityRuntimeKey`, per-frame mutation is explicit.

## Recommendation

Treat this as **solid, one step from authoritative**. Three changes would close most of the gap:

1. **Add a one-call umbrella registration** (`registerCanvasRenderers(state)` or per-family variants) that registers all `defaultCanvas*Renderer` objects, so consumers do not hand-wire a dozen kinds. This is the highest-value, lowest-risk addition.
2. **Close the blend-mode gaps that are actually expressible**: map `Erase → destination-out` and `Alpha → destination-in`, and explicitly document the remaining `null` modes (`Invert`, `Subtract`, `Shader`) as unsupported-on-canvas rather than silently degrading.
3. **Round out `lineStyle`** with dashed strokes and Flash `scaleMode`/`pixelHinting` semantics, or record them in the conformance/divergence map as intentionally unsupported.

Secondary: unify the `enable*Support` naming, and confirm the mask contract is uniform across all renderable kinds rather than rich-text-only. None of these are structural — the architecture, kind coverage, shape command set, and tree-shaking discipline are already at the authoritative level for a Canvas2D backend.
