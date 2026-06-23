# Depth Review: @flighthq/displayobject-dom

**Domain**

A concrete DOM/HTML backend renderer for the Flight 2D display-object scene graph. Its job is to take the backend-agnostic render proxies produced by `@flighthq/render` and realize each renderable display object as real DOM elements (`<div>`, `<img>`, `<canvas>`, `<video>`), positioning them with CSS transforms, applying opacity/blend/filter styling, clipping via `clip-path`, and keeping the live DOM tree reconciled against the scene each frame. It is the sibling of `@flighthq/displayobject-canvas` and `@flighthq/displayobject-webgl`, sharing the renderer-registration contract (`DisplayObjectRenderer`, `registerRenderer`, `RenderProxy2D`).

The canonical bar for "an authoritative DOM-renderer for a Flash/OpenFL-style display list" is: cover every renderable display-object kind, support the full visual property set (transform, alpha, blend, visibility, filters, masking/clipping, smoothing), do efficient incremental DOM reconciliation, handle text (static, rich, native, editable) and media (bitmap, video), provide a render-to-texture/cache path, and integrate fonts.

**Verdict: solid — 78/100**

The package is genuinely deep where DOM rendering is hard: a real dirty-flag reconciler with element diffing/reuse, CSS `clip-path` clipping for both rectangles and arbitrary winding contours, CSS-filter and blend-mode seams, a render-cache target path, and full editable-text overlay (caret blink + selection rectangles + scroll offset). It is not a stub — it is a working, well-factored renderer. It falls short of "authoritative" mainly because it covers a narrower set of display-object kinds than its canvas sibling (no sprite/tilemap/quad-batch path) and a couple of fidelity corners are documented-but-thin.

## Present capabilities

Renderable kinds, each with a `default*Renderer` (`createData` + `submit`) ready to `registerRenderer`:

- **Bitmap** (`drawDomBitmap`, `defaultDomBitmapRenderer`) — `<img>`/canvas-backed image rendering.
- **Shape** (`drawDomShape`, `defaultDomShapeRenderer`) — vector shapes rasterized onto an offscreen `<canvas>` element by delegating to `renderCanvasShapeCommands` from the canvas package, then transform-offset to its local bounds. Smart reuse of the canvas command interpreter rather than reimplementing fills/strokes.
- **Scale-9 Shape** (`domScale9Shape`, `defaultDomScale9ShapeRenderer`, `domScale9Mapper`) — nine-slice scaling.
- **Text label** (`drawDomTextLabel`, `defaultDomTextLabelRenderer`), **Rich text** (`drawDomRichText` + `*Mask`, `defaultDomRichTextRenderer`), **Native text** (`drawDomNativeText` + `*Mask`, `defaultDomNativeTextRenderer`) — three text tiers matching the `@flighthq/text` split.
- **Editable text** (`domTextInput`, `enableDomTextInput`, `registerDomTextInputOverlay`) — caret with injected blink keyframes, selection-rectangle highlight, scrollV/scrollH offset handling. This is full-featured, not a placeholder.
- **Video** (`drawDomVideo`, `defaultDomVideoRenderer`) — native `<video>` element sizing/styling.
- **HTML view** (`htmlView`, `drawDomHtmlView`, `defaultHtmlViewRenderer`) — a DOM-native escape hatch (raw HTML embedding) with no canvas/webgl analogue; a genuine strength of this backend.
- **Render view** (`domRenderView`, `drawDomRenderView`) and **render cache** (`domCache`, `enableDomRenderCache`, `ensure/get/releaseDomRenderCacheTarget`) — render-to-canvas cache target path so cached subtrees become a single composited element.

Cross-cutting visual machinery:

- **Transforms** (`setDomTransform`, `setDomTransformWithOffset`) — CSS `matrix(...)` from the scene matrix, with `roundPixels` and bounds-offset handling.
- **Clipping** (`enableDomClipSupport`, `domClip`, `domClipRectangle`, `domClipContours`, `createDomStageRectangle`, `pushDomClipRectangle`, `applyDomClipRectangles`) — masks retired in favor of CSS `clip-path`; supports both axis-aligned rectangles and arbitrary contour polygons with winding, stacked and unwound by depth.
- **Blend modes** (`applyDomBlendMode`, `enableDomBlendModeSupport`) — `mix-blend-mode` seam.
- **CSS filters** (`domCSSFilterBinding`, `enableDomCssFilterSupport`, `getDomCssFilter`, `setDomCssFilter`) — filter descriptor → CSS `filter` string seam.
- **Style** (`applyDomStyle`, `prepareDomElement`, `setDomRendererElement`) — opacity, smoothing, base element prep.
- **Reconciliation** (`domReconcile`: `processDomNode`, `hasDomStructureChanged`, `reconcileDomContainer`, `swapDomOrderLists`) — dirty-flag driven (appearance/transform frame IDs), element-to-proxy `WeakMap`, double-buffered order lists, minimal `insertBefore`/`removeChild` diffing. This is the core that makes a DOM backend viable and it is done well.
- **Render state** (`createDomRenderState`, `DomRenderOptions`: pixelRatio, roundPixels, backgroundColor, imageSmoothing, sceneGraphSyncPolicy) and **background** (`renderDomBackground`).
- **Fonts** (`domFontSource`, `invalidateDomFontResource`) — `@font-face` integration.
- **Traversal** (`renderDomDisplayObject`) — single iterative stack walk honoring `enabled`/visibility/clip hooks/traverse-children.
- **Materials** (`domMaterials`) and HTML escaping (`escapeHtmlString`).

All capabilities follow the opt-in `enable*` seam pattern (tree-shakable; importing `displayobject-dom` registers nothing), matching the project's side-effect-free rule. Every source file has a colocated `*.test.ts`.

## Gaps vs an authoritative DOM-renderer library

- **No sprite-graph rendering.** The canvas sibling ships `defaultCanvasSpriteRenderer`, `defaultCanvasTilemapRenderer`, `defaultCanvasQuadBatchRenderer`, and `defaultCanvasParticleEmitterRenderer` (the `@flighthq/sprite` family). The DOM package has none. For a tilemap or particle field, DOM is admittedly a poor substrate (one element per tile/particle is pathological), so a _batched_ sprite path is arguably missing-by-design — but a minimal sprite/tilemap renderer (even canvas-element-backed, like the shape path already is) would be the canonical expectation for parity. Today a sprite-graph app simply cannot use this backend. This is the single largest depth gap.
- **No display-object container renderer.** Canvas exports `defaultCanvasDisplayObjectRenderer`; DOM has no equivalent `defaultDomDisplayObjectRenderer`. Containers are handled implicitly by traversal, which is fine, but the asymmetry is worth confirming is intentional rather than an omission.
- **Blend-mode fidelity is inherently partial.** `mix-blend-mode` covers the standard separable/HSL modes but cannot reproduce OpenFL modes like `add`/`subtract`/`invert`/`alpha`/`erase` faithfully; this is a CSS-platform limit, not laziness, but an authoritative library would document the per-mode fallback behavior. (Largely missing-by-design.)
- **CSS-filter fidelity gap.** Filters that have no CSS-`filter` equivalent (displacement map, convolution, color-matrix beyond brightness/contrast/etc.) cannot be expressed; the canvas backend rasterizes them, the DOM backend would need to fall back to a rasterized canvas element. Whether `setDomCssFilter` gracefully degrades to a raster path or silently drops unsupported filters is not obvious from the surface and should be made explicit.
- **Caret/selection styling is hardcoded.** `CARET_COLOR = '#000000'` and `CARET_WIDTH = 1` are module constants; an authoritative editable-text path would source caret color/width from the text format (light-on-dark fields render an invisible caret today).
- **No accessibility / semantic-DOM affordances.** A DOM backend is uniquely positioned to emit semantic/ARIA structure (the one thing canvas/webgl cannot), yet text renders as styled `<div>`s with no role/tabindex/aria hooks. This is a real, domain-specific opportunity a "DOM-native, authoritative" renderer would seize.

## Naming / API-shape notes

- Naming is consistent and on-grammar: backend-prefix-first (`domBitmap`, `domClipContours`), full unabbreviated type words, `draw*`/`render*`/`apply*`/`enable*`/`set*`/`get*` verbs used per convention. `enableDom*Support` for opt-in subsystems and `default*Renderer` for the registerable objects mirror the canvas package exactly — good cross-backend symmetry.
- The retired-masks comment (`domClip.ts`) documenting the move from masks to `clip-path` is exactly the kind of architecture note the style guide asks for.
- `drawDomTextInputOverlay` takes `_state` (unused) only to satisfy the `DisplayObjectRenderer.submit` signature — acceptable, and matches the contract.
- One mild asymmetry: `enableDomTextInput()` takes no state (registers a global overlay slot via `registerDomTextInputOverlay`), whereas every other `enableDom*Support(state)` is state-scoped. Worth a glance to confirm the global registration is intended and cannot leak across multiple render states.
- `escapeHtmlString` and `prepareDomElement` are general-purpose helpers exported from the barrel; fine, but `escapeHtmlString` is the kind of name that could collide globally — the project prefers globally-unique root exports, and this one is generic.

## Recommendation

Treat this as a **solid, production-shaped DOM renderer that is one feature-family short of authoritative**. Priorities, in order:

1. **Close the sprite-graph gap or document it as out-of-scope.** Decide explicitly whether DOM gets a (canvas-element-backed) sprite/tilemap renderer for parity with the canvas backend, or whether sprite-graph rendering is formally a GPU/canvas-only capability. Right now it is an undocumented hole. This is the call that moves the verdict toward authoritative.
2. **Make filter/blend-mode fallback behavior explicit** — define and document what happens for CSS-unsupported filters and OpenFL-only blend modes (rasterize-to-canvas fallback vs no-op), so users know the fidelity contract.
3. **Lean into DOM's unique advantage** — add optional ARIA/semantic affordances for text, the one thing only this backend can offer.
4. **Source caret color/width from text format** instead of hardcoded black.

None of these are foundational rewrites; the architecture (reconciler, clip stack, enable-seams, render-cache) is sound and the code is clean and well-tested. The package is unfinished at the _coverage_ layer, not the _quality_ layer.
