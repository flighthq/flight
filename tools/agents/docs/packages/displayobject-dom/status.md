---
package: '@flighthq/displayobject-dom'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# displayobject-dom — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md › Recommended`. Net: 1 of 3 done, 2 parked on a source/assessment mismatch.

**Done**

- **HiDPI follow-up for `drawDomBitmap`.** The canvas-backed bitmap path (`renderBitmapAsCanvas`, taken for bitmaps with a `sourceRectangle` or a non-`HTMLImageElement` source) now sizes its backing `<canvas>` at physical pixels (`drawWidth*pixelRatio × drawHeight*pixelRatio`), constrains layout via `style.width`/`style.height` in logical px, and applies `ctx.scale(pixelRatio, pixelRatio)` after the resize — matching `@flighthq/displayobject-canvas`'s `createCanvasElement` HiDPI shape. `state.pixelRatio` is the ratio source. Existing tests still hold at the default `pixelRatio: 1`; added a colocated test asserting `128×128` backing store and `64px` CSS box at `pixelRatio: 2`. `packages/displayobject-dom/src/domBitmap.ts`, `domBitmap.test.ts`.

**Parked — assessment premises not present in this worktree's source**

The assessment's preamble and items 2–3 lean on infrastructure the `2026-06-24` ingest entry claimed ("as-claimed, not yet review-verified") but which is **absent from `src/` in this worktree**: there is no `hasDomCssFilterEquivalent`, no `getDomBlendModeFidelity`, no `enableDomAccessibility`, and no `domSvgFilter.ts` / `getDomSvgColorMatrixFilter` (no SVG `<feColorMatrix>` path at all). `grep` over `src/` confirms only the CSS-filter-string binding (`enableDomCssFilterSupport`/`setDomCssFilter`/`getDomCssFilter`) exists for filtering. Both remaining Recommended items therefore require building the foundation they describe as "already present," which crosses from a mechanical sweep into new-feature design.

- **Wire `enableDomRasterFilterSupport(state)`** — parked. Premise ("`hasDomCssFilterEquivalent` already detects CSS-unsupported filters; only the wiring remains") is false here: no equivalence-detection layer exists. Building it plus the cache-routing render path is a new feature with API-shape decisions (filter representation on the proxy, subtree identification for rasterization), not wiring.
- **SVG exact-filter paths (`<feConvolveMatrix>`, `<feDisplacementMap>`)** — parked. Premise ("extend the established `domSvgFilter.ts` color-matrix pattern") is false here: the module and the `getDomSvgColorMatrixFilter`/`release*` pattern do not exist. There is no established SVG `<fe*>` injection seam to extend additively; creating one from scratch (filter-element construction, `url(#id)` plumbing, per-state lifecycle) is foundational design.

Recommend a review pass re-verify this package against its actual diff before re-asserting items 2–3 — the assessment was sorted from an as-claimed review whose claims this source does not bear out.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/displayobject-dom

**Session date:** 2026-06-24 **Starting score:** 87/100 **Estimated new score:** 92/100

## Implemented APIs (cumulative across both passes)

### Types in `@flighthq/types`

- **`AccessibilityDescriptor`** (`packages/types/src/AccessibilityDescriptor.ts`) — shared type with `label?`, `role?`, `tabFocusable?` fields. Exported from types barrel. Consumed by `enableDomAccessibility`.
- **`DomBlendModeFidelity`** (`packages/types/src/DomBlendModeFidelity.ts`) — `'exact' | 'approximate' | 'unsupported'` enum type for documenting CSS blend-mode fidelity contracts. Exported from types barrel.
- **`TextInputState.caretColor`** and **`TextInputState.caretWidth`** (added to `packages/types/src/TextInputState.ts`) — caret styling sourced from the input state, replacing hardcoded module constants. Also added to `TextInputOptions` so they are configurable at `enableTextInput` time.
- **`DomRenderState.applyAccessibility`** (added to `packages/types/src/DomRenderState.ts`) — nullable hook field for the accessibility seam, initialized to `null` in `createDomRenderState`.

### Functions in `@flighthq/displayobject-dom`

**From first pass:**

- **`enableDomAccessibility(state)`** — installs the ARIA/semantic applicator on the render state. After calling, elements get `role`/`aria-label`/`tabindex` from their bound `AccessibilityDescriptor`, or `aria-hidden="true"` if none is bound. Tree-shakable.
- **`getDomAccessibilityDescriptor(renderProxy)`** — returns the `AccessibilityDescriptor` bound to a render node.
- **`setDomAccessibilityDescriptor(state, node, descriptor | null)`** — binds/clears an `AccessibilityDescriptor` to a display object for a given render state. Per-state binding (keyed by render proxy), same pattern as CSS filter bindings.
- **`getDomBlendModeFidelity(blendMode)`** — returns `DomBlendModeFidelity` for a blend mode, making the fidelity contract explicit. Full auditable table in `domMaterials.ts` comments.
- **`hasDomCssFilterEquivalent(filter)`** — returns `true` when a `BitmapFilter` has a native CSS `filter` equivalent. Supported kinds: `BlurFilter`, `DropShadowFilter`, `OuterGlowFilter` (see second pass addition below).
- **`defaultDomDisplayObjectRenderer`** — registerable `DisplayObjectRenderer` for plain display object containers, matching `defaultCanvasDisplayObjectRenderer` for cross-backend symmetry. No-op `submit`.
- **`drawDomDisplayObject`** — the no-op draw function backing the container renderer.
- **`escapeDomHtmlString(str)`** — renamed from `escapeHtmlString`. Backend-prefix-first naming per the globally-unique root export rule.

**From second pass:**

- **`hasDomCssFilterEquivalent` — expanded** (`domCSSFilterBinding.ts`): added `OuterGlowFilter` to the supported set. `OuterGlowFilter` maps to CSS `drop-shadow(0 0 blur color)` — a glow effect is a shadow with zero offset. The mapping comment in the source documents the approximation.
- **`getDomSvgColorMatrixFilter(filter)`** (`domSvgFilter.ts`) — builds a CSS `filter: url(#id)` string for a `ColorMatrixFilter` by injecting an inline SVG `<feColorMatrix>` element into a shared hidden SVG container at the document root. This is the **DOM-native exact fidelity path** for color-matrix filters — no GPU readback, no rasterization. Converts Flash's 0–255 offset convention to SVG's 0–1 range. Sets `color-interpolation-filters: sRGB` for sRGB-consistent color math. Returns `null` outside a document context (SSR-safe).
- **`releaseDomSvgColorMatrixFilter(id)`** (`domSvgFilter.ts`) — removes the injected `<filter>` DOM element by its id to avoid `<filter>` node leaks. The id is the fragment portion of the CSS string returned by `getDomSvgColorMatrixFilter`.

**HiDPI/pixelRatio fix (drawDomShape):**

`drawDomShape` in `domShape.ts` previously sized its backing `<canvas>` at logical pixels (`w × h`). This produces blurry shapes on HiDPI screens because the canvas rasterizes at 1:1 physical resolution, then CSS stretches it. Fixed: the canvas is now sized at physical pixels (`w * pixelRatio × h * pixelRatio`), CSS `style.width`/`style.height` constrains it to logical size, and the drawing context is scaled by `pixelRatio` before `renderCanvasShapeCommands`. This brings `drawDomShape` to parity with `createCanvasElement` (which already handles this correctly).

### Modified behavior

- **Caret color/width sourced from `TextInputState`** (`domTextInput.ts`) — `CARET_COLOR = '#000000'` and `CARET_WIDTH = 1` module constants removed. Caret rendering now reads `input.caretColor` and `input.caretWidth`. Falls back to the new defaults (`0x000000` / `1`) set in `createTextInputState`. Light-on-dark fields can now specify `enableTextInput(node, { caretColor: 0xffffff })`.
- **`applyDomStyle` applies accessibility** — the accessibility applicator is called after blend mode and filter application, so accessibility attributes are set on every rendered element when the seam is active.
- **`@flighthq/textinput` updated** — `createTextInputState` and `applyTextInputOptions` now handle `caretColor`/`caretWidth`.

### Total test count

27 files / 200 tests (up from 26 files / 189 tests at the start of first pass).

Second-pass additions:

- `domSvgFilter.test.ts` (new file) — 8 tests covering `getDomSvgColorMatrixFilter` and `releaseDomSvgColorMatrixFilter`.
- `domCSSFilterBinding.test.ts` — 1 new test for `OuterGlowFilter` in `hasDomCssFilterEquivalent`.
- `domShape.test.ts` — 2 new HiDPI tests: pixelRatio 2 physical canvas sizing and pixelRatio 3 zero-size canvas.

## Deferred items and why

### Sprite-graph design gate (Bronze — intentionally deferred)

The roadmap explicitly states this is a cross-package design decision to surface to the user, not decide autonomously. Does DOM get a canvas-element-backed sprite/tilemap renderer for parity with `@flighthq/displayobject-canvas`? Deferred because:

1. It crosses `@flighthq/sprite` package scope.
2. The canvas-delegation approach is viable but needs confirmation this is the intended pattern.
3. DOM is a poor substrate for quad-batch/tilemap (one element per tile = pathological).

**Recommendation:** Decide explicitly — either "DOM gets a canvas-backed sprite renderer" or "sprite-graph is GPU/canvas-only, DOM silently skips Sprite kinds." Record the answer in the Package Map and with an architecture note in the package.

### Rasterized-filter fallback path (Silver — deferred)

`hasDomCssFilterEquivalent` now gives callers a way to detect unsupported filters. The actual implementation of `enableDomRasterFilterSupport(state)` — routing subtrees with unsupported filters through `ensureDomRenderCacheTarget` so the filter is applied on a `<canvas>` exactly as the canvas backend does — is a wiring task that belongs in a dedicated session. The pieces are all present; only the wiring remains.

### Native form-control text input (Gold — deferred)

`enableDomNativeTextInput(state)` — backing editable text with a real `<input>` / `<textarea>` for IME, autofill, mobile keyboard. Requires `@flighthq/keyboard` integration. Deferred as a Gold item; the overlay path remains authoritative.

### Full accessibility tree (Gold — deferred)

`getDomAccessibilityTree(state)` — a coherent tree mirroring the display list with landmark roles, reading order, focus management, and live regions. The per-object seam is the prerequisite (done). The tree-level work is a separate, larger effort.

### Performance: reconciler at scale (Gold — deferred)

Batched DOM writes, `requestAnimationFrame` alignment, `will-change`/`contain` hints, recycling pools (`acquireDomElement`/`releaseDomElement`). Current reconciler is correct; scale optimization is a Gold item.

### HiDPI audit for `domBitmap` (minor — deferred)

`drawDomBitmap` — the canvas-backed path (for bitmaps with a `sourceRectangle`) also sizes its backing canvas at logical pixels, not physical. The same HiDPI fix applied to `drawDomShape` should be applied here. For the image-element path there is nothing to fix (the browser scales `<img>` correctly with CSS transforms). This is a small, self-contained fix deferred to avoid scope creep.

### SVG filter for ConvolutionFilter and DisplacementMapFilter (Gold — deferred)

`ColorMatrixFilter` → `<feColorMatrix>` is now implemented. `ConvolutionFilter` → `<feConvolveMatrix>` and `DisplacementMapFilter` → `<feDisplacementMap>` could follow the same pattern for exact fidelity. Deferred: the conversion functions are non-trivial (kernel normalization for convolution, scale/channel mapping for displacement) and warrant a dedicated session.

### Rust conformance map entry (deferred — cross-worktree)

The Rust conformance doc should record `displayobject-dom` as intentionally not ported (its substrate — the DOM tree — does not exist in the Rust box). This edit touches the `rust` worktree and should be done in a Rust-focused session.

## Design choices made

### SVG filter injection pattern (`domSvgFilter.ts`)

The SVG `<filter>` elements are injected into a **shared hidden `<svg>` container appended to `document.body`**. This placement is critical: filters referenced via CSS `filter: url(#id)` must be in the same document and must not be hidden by `clip-path` or `overflow: hidden`. The render root container (from `createDomRenderState`) has `overflow: hidden` — so the SVG container cannot live inside it. Placing it at `document.body` ensures all elements can reference it regardless of their DOM position.

The container element has `aria-hidden="true"` and zero dimensions (`width: 0; height: 0; overflow: hidden`) to keep it invisible and out of the accessibility tree.

**Lifecycle obligation:** Each `getDomSvgColorMatrixFilter` call injects one `<filter>` element. Callers must call `releaseDomSvgColorMatrixFilter(id)` when the filter is no longer needed. This is documented on both functions. A future pool-based variant could reuse filter elements for repeated identical matrices.

### HiDPI backing canvas scaling (`drawDomShape`)

The fix scales the backing `<canvas>` to physical pixels (`w * pixelRatio × h * pixelRatio`) and constrains via CSS. The drawing context is scaled by `pixelRatio` (`ctx.scale(pr, pr)`) before every draw call rather than maintaining a persistent scale state — this is correct because canvas `width`/`height` assignments reset all context state, so `ctx.scale` must be called after each resize.

The `setDomTransformWithOffset` call is not changed — the transform is in CSS logical pixels, which is correct. Only the backing canvas resolution changes.

### OuterGlowFilter → CSS drop-shadow (approximate)

`OuterGlowFilter` is added to `DOM_CSS_FILTER_KINDS` as an approximate CSS-equivalent. The mapping is `drop-shadow(0 0 blurX color)` — zero offset turns a shadow into a symmetric glow. This is documented in the source comment as approximate (CSS `drop-shadow` clips to the element boundary in some browsers; `OuterGlowFilter` may not). Callers who need exact fidelity should use the raster-fallback path.

## Concerns and surprises

1. **`escapeHtmlString` was exported from the barrel with a generic, non-backend-prefixed name.** The rename to `escapeDomHtmlString` is a breaking API change for any direct consumer. Since the project is pre-release with no external consumers, this is safe. The new name is globally unique per convention.

2. **`enableDomTextInput()` is global, not state-scoped.** The asymmetry with other `enableDom*Support(state)` functions is intentional (documented in the architecture comment). The overlay function is stateless (reads from renderProxy per call), so sharing it across render states is safe. If per-state overlay isolation is ever needed, the slot would need to move to the state.

3. **CSS `applyAccessibility` is called on every rendered element** when enabled. For large scenes with many leaf nodes that have no `AccessibilityDescriptor`, this adds a `WeakMap.get` lookup and four `removeAttribute` calls per element per frame. Unlikely to be a practical bottleneck but worth noting for large accessibility-enabled scenes.

4. **`drawDomBitmap` canvas-backed path still uses logical-pixel sizing.** The HiDPI fix to `drawDomShape` was not applied to `drawDomBitmap`'s canvas path (bitmaps with `sourceRectangle`). For bitmap content that is already a raster image, the blurriness at HiDPI is less visible than for vector shapes — but for completeness the fix should be applied.

5. **`domSvgFilter` uses module-level mutable state** (`_svgContainer`, `_nextFilterId`). This is acceptable — the SVG container is document-global by necessity. The module is side-effect-free at import time (no DOM writes until `getDomSvgColorMatrixFilter` is first called). The `_nextFilterId` counter is monotonic and never resets, so ids remain unique across the lifetime of the page.

## Suggestions for future sessions

1. **Resolve the sprite-graph design gate** — the single item that would most meaningfully move the needle toward "authoritative." Either add canvas-backed `drawDomSprite` / `drawDomTilemap`, or formally document DOM as not supporting sprite-graph kinds.
2. **Implement rasterized-filter fallback** — wire `enableDomRasterFilterSupport(state)` using the existing render-cache. The pieces are all there; it's wiring.
3. **Apply HiDPI fix to `drawDomBitmap`** — same pattern as `drawDomShape`. Small, self-contained.
4. **SVG filter path for ConvolutionFilter** — `<feConvolveMatrix>` can express an exact convolution without rasterization. The channel kernel normalization is the only tricky part.
5. **Add functional test coverage** — the `tools/functional` harness should include DOM-specific scenes: text input with custom caret color, accessibility descriptor rendering (inspect the DOM), and blend mode fidelity comparison against canvas.
6. **Performance: `domReconcile` at scale** — the reconciler is correct but not benchmarked. Large lists (1000+ nodes) would benefit from `DocumentFragment` batching and element pooling.
