---
package: '@flighthq/displayobject-dom'
status: solid
score: 89
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
---

# displayobject-dom — Review

## Verdict

`solid — 89/100`. A mature, well-factored DOM renderer that covers the full 2D display-object set (shape, bitmap, scale9, rich/label/native text, video, html-view, render cache, clip) plus the one capability that is DOM's alone — accessibility — and now exact-fidelity color-matrix filtering via injected SVG `<feColorMatrix>`. The opt-in `enable*` seam pattern is applied consistently and the package tree-shakes cleanly. The remaining distance to "authoritative" is a small set of named, mostly-deferred gaps (sprite-graph decision, raster-filter wiring, a HiDPI follow-up) plus two minor naming/convention drifts — none structural.

The worker status doc (starting 87, est. 92) is **as-claimed**; this pass verified every claim listed below against `changes.patch` and the head source. All checked out. I land the score at 89: the implemented work is real and clean, but the est. 92 over-counts because the headline sprite-graph and raster-fallback items remain deferred, and a functional-test scene for the DOM-only features (custom caret, accessibility DOM inspection, blend fidelity) still does not exist.

## Present capabilities

Grounded in `67dc46d64:packages/displayobject-dom/src/`.

- **Full 2D leaf coverage.** `defaultDom*Renderer` objects exist for every display-object primitive: `Shape` (`domShape.ts`), `Bitmap` (`domBitmap.ts`), `Scale9Shape` (`domScale9Shape.ts` + `domScale9Mapper.ts`), `RichText`/`TextLabel`/`NativeText` (`domRichText.ts`, `domTextLabel.ts`, `domNativeText.ts`), `Video` (`domVideo.ts`), `HtmlView` (`htmlView.ts`), render cache (`domCache.ts`), and a no-op container renderer `defaultDomDisplayObjectRenderer` (`domDisplayObject.ts`) added this pass for cross-backend symmetry with `defaultCanvasDisplayObjectRenderer`.
- **Reconciling render loop.** `renderDomDisplayObject` walks the display list with an explicit stack, ping-pong order lists (`domOrderList`/`domNextOrderList` on the runtime tier), and a structure-change check (`hasDomStructureChanged` → `reconcileDomContainer`). Element placement is centralized in the loop via `setDomRendererElement`/`domCurrentElement`, never in individual draw functions — a clean ownership boundary.
- **Opt-in capability seams**, all consistent: `enableDomBlendModeSupport`, `enableDomCssFilterSupport`, `enableDomClipSupport`, `enableDomRenderCache`, `enableDomAccessibility`, and the (intentionally global) `enableDomTextInput`. Each installs a nullable hook on `DomRenderState` / `DomRenderStateRuntime`, so a state that never opts in pulls none of the module — verified by the `domCssFilterResolver`/`applyAccessibility`/`applyBlendMode` null-until-enabled fields in `types/src/DomRenderState.ts`.
- **Accessibility seam (DOM-unique).** `enableDomAccessibility` + `get/setDomAccessibilityDescriptor` bind a shared `AccessibilityDescriptor` (`label`/`role`/`tabFocusable`, homed in `@flighthq/types`) per render proxy via a `WeakMap`, applied in `applyDomStyle` after blend/filter. Objects without a descriptor get `aria-hidden="true"`. Per-state isolation is achieved correctly through render-proxy keying (same pattern as the CSS-filter binding).
- **Blend-mode fidelity contract.** `domMaterials.ts` carries an auditable `DOM_BLEND_MODE` map (intent → `mix-blend-mode`) and a parallel `DOM_BLEND_MODE_FIDELITY` table, surfaced via `getDomBlendModeFidelity(blendMode): DomBlendModeFidelity` (`'exact' | 'approximate' | 'unsupported'`, homed in types). Lets a caller detect lossy modes before committing to the DOM path.
- **CSS-filter equivalence + exact SVG color-matrix path.** `hasDomCssFilterEquivalent` reports the native-CSS set (`Blur`, `DropShadow`, `OuterGlow` → `drop-shadow(0 0 …)`). `domSvgFilter.ts` adds the DOM-native exact path for `ColorMatrixFilter`: `getDomSvgColorMatrixFilter` injects a `<filter>`/ `<feColorMatrix>` into a shared hidden `<svg>` at `document.body`, converts the 0–255 offset column to SVG's 0–1, sets `color-interpolation-filters: sRGB`, returns `url(#id)` (or `null` under SSR), with `releaseDomSvgColorMatrixFilter(id)` to remove the node. No GPU readback, no rasterization.
- **HiDPI shape rasterization.** `drawDomShape` now sizes its backing `<canvas>` at physical pixels (`w*pixelRatio × h*pixelRatio`), constrains via CSS, and `ctx.scale(pr, pr)` after each resize — bringing it to parity with the canvas backend's `createCanvasElement`.
- **Configurable caret styling.** `drawDomTextInputOverlay` reads `input.caretColor`/`input.caretWidth` from `TextInputState` (now in `@flighthq/types`, configurable at `enableTextInput` time) instead of the removed hardcoded module constants — light-on-dark fields can set a contrasting caret.
- **Tests.** 27 files / ~200 tests per the status doc; the touched files (`domAccessibility`, `domSvgFilter`, `domCSSFilterBinding`, `domMaterials`, `domShape`, `domTextInput`, `domTextHelpers`, `domDisplayObject`, `domRichText`) all carry colocated tests, satisfying `exports:check` for the new exports.

## Gaps

What a fully authoritative DOM backend in this codebase would still have:

- **Sprite-graph kinds unrendered (the headline gap).** No `drawDomSprite`/`drawDomTilemap`/QuadBatch renderer; `render-backend-support.md` confirms Sprite/QuadBatch/Tilemap = ✗ on DOM. This is a real cross-package design fork (does DOM get a canvas-element-backed sprite renderer, or formally skip the atlas-batch family?) — correctly deferred to the user, not decided autonomously.
- **Raster-filter fallback not wired.** `hasDomCssFilterEquivalent` now _detects_ unsupported filters, but `enableDomRasterFilterSupport(state)` — routing those subtrees through `ensureDomRenderCacheTarget` to rasterize the filter exactly as the canvas backend does — does not exist. The pieces (`ensureDomRenderCacheTarget`) are present; only the wiring remains.
- **HiDPI follow-up for `drawDomBitmap`.** The canvas-backed bitmap path (bitmaps with a `sourceRectangle`) still sizes its backing canvas at logical pixels — the same fix applied to `drawDomShape` should follow. Self-contained.
- **Further SVG exact-filter paths.** `ConvolutionFilter` → `<feConvolveMatrix>` and `DisplacementMapFilter` → `<feDisplacementMap>` could follow the color-matrix pattern for exact fidelity; only color-matrix exists today.
- **Per-instance ColorTransform tint.** Not on DOM (node-level material only), per `render-backend-support.md` gap #4 — shared cross-backend gap, not DOM-specific.
- **Native form-control text input.** `enableDomNativeTextInput` (real `<input>`/`<textarea>` for IME, autofill, mobile keyboard) is absent; the overlay path is authoritative. Gold-tier, needs `@flighthq/keyboard`.
- **Full accessibility tree.** Per-object descriptors exist; a coherent `getDomAccessibilityTree` with landmark roles, reading order, focus management, and live regions does not. Larger effort.
- **No DOM functional-test scene.** The DOM-only behaviors (custom caret color, accessibility-descriptor emission inspected in the DOM, blend-mode fidelity vs canvas) are not exercised by `tests/functional`; jsdom unit tests cannot stand in for these.
- **Reconciler not benchmarked at scale.** Correct but no `DocumentFragment` batching / element pooling / `rAF` alignment / `will-change`/`contain` hints. Gold-tier perf.

## Charter contradictions

None — the charter (`charter.md`) is an unedited stub (all four sections `_TODO_`), so there is no stated North star, Boundary, or Decision for the code to contradict. Judged against the codebase-map AAA fallback, the package is in strong standing. The silences are collected as candidate Open directions below.

## Contract & docs fit

**Lives up to the contract — strongly:**

- Cross-package types are `@flighthq/types`-first: `AccessibilityDescriptor`, `DomBlendModeFidelity`, `DomRenderState.applyAccessibility`, and `TextInputState.caretColor/caretWidth` were all added to the header layer, not inlined.
- Full unabbreviated, backend-prefixed names throughout; the `escapeHtmlString → escapeDomHtmlString` rename this pass fixes the one generic name and satisfies the globally-unique root-export rule.
- Sentinels-not-throws: `getDomSvgColorMatrixFilter` returns `null` under SSR; `getDomAccessibilityDescriptor` returns `undefined` for an unbound proxy; `release*` no-ops on a missing id.
- Single root `.` export, `"sideEffects": false`, no top-level registration — `enable*`/`register*` functions gate every effect. `domSvgFilter`'s module-level `_svgContainer`/`_nextFilterId` are lazily initialized (no DOM write at import), keeping the side-effect-free invariant.
- `Readonly<>` applied to descriptor/filter/matrix inputs.
- `crate: null` is correct: per `rust/index.md`, `displayobject-dom` is intentionally **not** ported (its substrate, the DOM tree, does not exist in the Rust box).

**Candidate contract/doc revisions (user's gate, not mine):**

- **Package Map is stale.** Both the live and bundle `agents/index.md` still list the concrete renderers as `@flighthq/render-canvas`, `@flighthq/render-dom`, `@flighthq/render-webgl`. The `<subject>-<backend>` reorg (`displayobject-dom`, etc., per `rust/index.md` and `render-backend-support.md`) has landed in code but the TS Package Map has no `displayobject-dom` line. The map should be updated to the `displayobject-<backend>` naming.
- **`release*` verb drift.** `releaseDomSvgColorMatrixFilter` and `releaseDomRenderCache` use `release*`, which the design constraints reserve for pool/cache **`acquire`/`release` brackets**. Neither has an `acquire*` partner (the SVG filter's allocator is `getDomSvgColorMatrixFilter`; the cache uses `ensureDomRenderCacheTarget`). `releaseDomSvgColorMatrixFilter` removes a DOM node — a teardown that reads more like `disposeDom*`/`removeDom*` under the `dispose*` (detach-and-release-to-GC) vs `destroy*` (free-a-resource-now) split. Worth a naming-convention check across the renderer packages.
- **`get`/`release` allocation bracket.** `getDomSvgColorMatrixFilter` _allocates_ a `<filter>` DOM node but is named `get*` (a getter prefix per the source-style rules), with the lifecycle obligation documented only in the doc comment. The allocation is real (each call injects one node and the caller must release). A name that signals allocation (e.g. `createDom*`/`acquireDom*` paired with a true `release*`) would better match the explicit-allocation constraint. Flag for the convention pass.

## Candidate open directions

The charter is silent on all of these; each is something I had to assume against the AAA fallback to review, and each is a question for the user to settle into the charter:

1. **Sprite-graph on DOM — the package's defining boundary.** Does `displayobject-dom` render the atlas-batch family (Sprite/Tilemap/QuadBatch) via a canvas-element delegation, or is the DOM backend formally 2D-display-object-only with Sprite kinds silently skipped? This is the single decision that most shapes the package's identity and should be a Boundary in the charter.
2. **Filter strategy boundary.** How far does DOM chase exact fidelity (the SVG `<fe*>` path: color-matrix → convolution → displacement) vs. falling back to canvas rasterization via the render cache? Where is the line between "native-CSS/SVG exact" and "rasterize"?
3. **Accessibility ambition.** Is per-object ARIA the intended ceiling, or is a full accessibility tree (`getDomAccessibilityTree`, landmarks, focus order, live regions) in scope? This is DOM's unique value proposition and deserves an explicit North-star stance.
4. **Native form controls vs. overlay text input.** Is the canvas-overlay caret the authoritative text path, or should DOM eventually back editable text with real `<input>`/`<textarea>` for IME/mobile?
5. **`enableDomTextInput` global-not-state-scoped asymmetry.** Intentional (the overlay is stateless), but it breaks the `enable*Support(state)` symmetry of every other seam. Bless it explicitly or reconcile it.
6. **Reconciler performance posture.** Is "correct, unoptimized" acceptable as the charter's bar, or is scale (1000+ nodes, fragment batching, element pooling) an in-scope goal?
