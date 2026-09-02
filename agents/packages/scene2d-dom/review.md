---
package: '@flighthq/scene2d-dom'
status: solid
score: 72
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - public-lane-audit.md
  - source
---

# scene2d-dom -- Review

## Verdict

`solid -- 72/100`. The core DOM rendering loop is clean, well-factored, and covers the full
intended 2D leaf set. The opt-in seam architecture works, the reconciler is correct, and HiDPI
is handled properly for canvas-backed paths. Test coverage is comprehensive (30 test files,
~2500 lines for ~1950 lines of source).

The score drops from the prior review's 89/92 because that review's "Present capabilities"
section described several features verified against source that do not exist in the current
tree and never did. Specifically: `enableDomAccessibility` / `getDomAccessibilityDescriptor` /
`setDomAccessibilityDescriptor` (the accessibility seam), `hasDomCssFilterEquivalent` (CSS
filter equivalence query), `getDomSvgColorMatrixFilter` / `releaseDomSvgColorMatrixFilter` /
`domSvgFilter.ts` (the SVG color-matrix exact-filter path), and
`defaultDomDisplayObjectRenderer` (actually named `defaultDomScene2DRenderer`). The
`public-lane-audit.md` (ingested this pass) independently confirms all of these are absent. The
prior review's claimed 27 test files covering accessibility/SVG-filter modules likewise cannot
be verified.

What remains is a well-built DOM renderer with no accessibility seam and no DOM-native filter
path beyond raw CSS strings -- the two capabilities the charter identifies as this backend's
defining value. The implementation that _is_ present is clean; the gap is in features, not
quality.

## Present capabilities

Verified against `packages/scene2d-dom/src/` on 2026-09-02. File contents read in full.

- **Full 2D leaf renderer coverage.** Nine `Scene2DRenderer` objects spanning the intended leaf
  set: `defaultDomShapeRenderer` + `defaultDomMorphShapeRenderer` (alias, `domShape.ts`),
  `defaultDomSpriteRenderer` (`domSprite.ts` -- handles Image, Video, and canvas-backed
  cropped-source paths), `defaultDomScale9ShapeRenderer` (`domScale9Shape.ts`),
  `defaultDomRichTextRenderer` (`domRichText.ts`), `defaultDomTextLabelRenderer`
  (`domTextLabel.ts`), `defaultDomNativeTextRenderer` (`domNativeText.ts`),
  `defaultDomHtmlViewRenderer` (`domHtmlView.ts`), `defaultDomScene2DRenderer` (no-op
  container, `domNode2D.ts`), and `defaultDomRenderCacheRenderer` (`domCache.ts`). No
  separate Video renderer -- video textures route through the sprite renderer as
  `HTMLVideoElement` sources via `renderSpriteAsVideo`.

- **DOM reconciliation.** `renderDomScene2D` (`domNode2D.ts`) walks the display list with an
  explicit stack, ping-pong order lists (`domOrderList`/`domNextOrderList`), and a
  structure-change detector (`hasDomStructureChanged` -> `reconcileDomContainer`). Element
  placement is centralized via `setDomRendererElement` / `domCurrentElement`; individual draw
  functions never touch the DOM tree structure.

- **Six opt-in capability seams.** `enableDomBlendModeSupport(state)`,
  `enableDomCssFilterSupport(state)`, `enableDomClipSupport(state)`,
  `enableDomRenderCache(state)`, `enableDomTextInput()` (global, no state param), and
  `enableDomTextureResolverGuards(state)`. Each installs a nullable hook or registers a
  handler; a state that never opts in pulls none of the capability module.

- **Blend-mode fidelity table.** `DOM_BLEND_MODE` (`domMaterials.ts:9-27`) maps the full W3C
  `mix-blend-mode` set including `AdvancedBlendMode`. `getDomBlendModeFidelity` surfaces
  per-mode fidelity classification (`'exact' | 'approximate' | 'unsupported'`). Every entry
  in the table is `'exact'` except `BlendMode.Add` which is `'approximate'` (mapped to
  `screen`). The `'unsupported'` arm is unreachable via the built-in table.

- **CSS filter binding.** `setDomCssFilter(state, node, filter)` stores a raw CSS filter
  string per render proxy via a `WeakMap`; `enableDomCssFilterSupport(state)` installs the
  resolver. The binding is per-state via render-proxy keying. This is a raw-string escape
  hatch, not a portable descriptor path.

- **Clip support.** Rect clips via AABB intersection + CSS `polygon()`, contour path clips via
  CSS `clip-path: polygon()` / `path()` with winding-rule support (`domClipRectangle.ts`,
  `domClipContours.ts`). CSS limitation documented: a contour clip overrides stacked rect
  clips for that element (cannot intersect heterogeneous clip types in one CSS property).

- **Render cache.** `ensureDomRenderCacheTarget` allocates a `CanvasRenderTarget` per
  `RenderCache`, pre-styled for DOM placement. The draw function
  (`drawDomRenderCache`) reads the target canvas and places it with transform/alpha/blend.
  `releaseDomRenderCache` tears down via `destroyCanvasRenderTarget`.

- **Text input overlay.** `enableDomTextInput()` registers a selection-highlight + blinking-
  caret overlay into the RichText renderer. Caret color and width read from
  `TextInputState.caretColor` / `caretWidth`. CSS `@keyframes` injection is guarded by
  `_keyframesInjected` and element-id check.

- **HiDPI.** Canvas-backed paths (shape, scale9, sprite crop) size backing canvases at
  `width * pixelRatio`, constrain CSS dimensions to logical pixels, and scale the context.
  Verified in `domShape.ts:57-64`, `domScale9Shape.ts:68-76`, `domSprite.ts:80-87`.

- **Texture resolution.** `registerDomTextureResolver(state, sourceKind, resolver)` implements
  a keyed registry; `registerDomBitmapTextureResolver` and `registerDomImageTextureResolver`
  are the two built-in resolvers. `explainDomTextureResolution` and
  `enableDomTextureResolverGuards` provide the diagnostic seam.

- **Shape rasterizer registry.** `registerDomShapeRasterizer(state, rasterizer)` installs a
  `ShapeRasterizer` via a slot registry; `getDomShapeRasterizer` reads it. Shape and scale9
  renderers report a registry miss when absent rather than silently dropping the fill.

- **Package structure.** Two export lanes (`.` via `index.ts`, `./contract` via `contract.ts`),
  `"sideEffects": false`, no top-level registration or DOM mutation at import time. Module-
  level state (`_svgContainer`-style lazy init, `_measureCtx`, `_domTextInputOverlay`) is
  initialized only on first use.

## Gaps

What a complete DOM renderer per the charter's north star and AAA expectations would still need:

- **No accessibility seam (charter north star #3).** `enableDomAccessibility`,
  `getDomAccessibilityDescriptor`, `setDomAccessibilityDescriptor`, and an
  `applyAccessibility` slot on `DomRenderState` have zero occurrences in `packages/`. The
  `AccessibilityDescriptor` type exists in `@flighthq/types` (`label`, `role`,
  `tabFocusable`) but has no consumer in any package. Per-object ARIA is the charter's floor;
  the full tree (landmarks, focus order, live regions) is the ceiling. Neither is built.
  This is the headline gap: accessibility is called out as DOM's "unique value" in the
  charter.

- **No CSS-filter-equivalence query.** `hasDomCssFilterEquivalent` does not exist. There is no
  function that reports which effect descriptors can be realized natively via CSS
  `filter`/SVG `<fe*>` versus requiring rasterization. The only filter door is
  `setDomCssFilter` -- a hand-written CSS string.

- **No SVG exact-filter path.** `domSvgFilter.ts` does not exist. No
  `getDomSvgColorMatrixFilter`, `releaseDomSvgColorMatrixFilter`, or `<feColorMatrix>`
  injection. The color-matrix-to-SVG-filter path described in the prior review and assessment
  was never built, confirmed by `public-lane-audit.md:46-51`.

- **No raster-filter fallback wiring.** `enableDomRasterFilterSupport(state)` does not exist.
  The render-cache target plumbing (`ensureDomRenderCacheTarget`) is present, but no seam
  routes CSS-unsupported filter subtrees through it.

- **No `explainDomScene2DCoverage`.** `scene2d-canvas` and `scene2d-gl` each wrap
  `explainScene2DCoverage`/`hasScene2DCoverage` from `@flighthq/render`; DOM's diagnostic
  surface stops at `explainDomTextureResolution` and `explainDomImageSource`.

- **`getDomBlendModeFidelity` return type unsound for open string family.** `BlendMode` is an
  open string family, but `DOM_BLEND_MODE_FIDELITY` is typed as `Record<BlendMode,
  DomBlendModeFidelity>` -- a bare index with no fallback. A vendor-prefixed or unknown mode
  returns `undefined`, violating the declared `DomBlendModeFidelity` return type. The
  `'unsupported'` arm is unreachable: every table entry is `'exact'` or `'approximate'`.

- **`enable*` naming inconsistency.** Three carry `Support` suffix
  (`enableDomBlendModeSupport`, `enableDomClipSupport`, `enableDomCssFilterSupport`) and
  three do not (`enableDomRenderCache`, `enableDomTextInput`,
  `enableDomTextureResolverGuards`).

- **`enableDomTextInput` global asymmetry.** Takes no `state` parameter; writes a
  module-global overlay slot via `registerDomTextInputOverlay`. Two render states cannot
  differ in text-input behavior. The only stateless seam of the six.

- **Two unused manifest dependencies.** `@flighthq/log` appears only in
  `enableDomTextureResolverGuards.test.ts` (test-only usage); `@flighthq/signals` appears in
  no source or test file. Both are listed in `dependencies`.

- **No DOM functional-test scene.** DOM-only behaviors (custom caret color, blend-mode
  fidelity, clip-path contour rendering) are not exercised by `tests/functional`; jsdom unit
  tests cannot fully stand in for live-DOM rendering tests.

- **`releaseDomRenderCache` verb drift.** Uses `release*` without an `acquire*` partner. The
  teardown calls `destroyCanvasRenderTarget` (frees a resource), which reads more like
  `destroy*` per the design constraints. The allocator is `ensureDomRenderCacheTarget`, not
  `acquire*`.

## Charter contradictions

The charter (now populated with north star, boundaries, and decisions) sets expectations the
source does not meet:

- **North star #1 ("DOM-native first").** The only CSS-filter door is a raw string
  (`setDomCssFilter`). No CSS-filter-equivalence query exists; no SVG `<fe*>` exact path
  exists. The charter positions DOM-native effects as what makes this backend worth having,
  but the implementation provides only the plumbing for callers who already know the CSS.

- **North star #3 ("Accessibility is this backend's unique value").** No accessibility seam of
  any kind has been implemented. The `AccessibilityDescriptor` type exists in
  `@flighthq/types` but nothing in any package reads or applies it.

- **North star #4 ("Opt-in seams, side-effect-free import").** The six seams are real and
  tree-shake correctly. However, `enableDomTextInput` breaks the `enable*Support(state)`
  symmetry (global, not state-scoped). The charter calls this out in open direction #5 as
  needing an explicit ruling.

- **Boundary: "The full 2D display-object leaf set."** Met for the intended set (per the
  charter's explicit exclusion of batch kinds and the registration model decision).

## Contract & docs fit

**Matches the contract:**

- Cross-package types homed in `@flighthq/types`: `DomRenderState`, `DomRenderStateRuntime`,
  `DomBlendModeFidelity`, `DomRenderOptions`, `DomClipEntry`, `DomClipContourEntry`,
  `DomClipHooks`, `DomScene2DRectangle`, `DomTextureResolver`, `AccessibilityDescriptor`.
- Two export lanes: `.` (public) and `./contract` (full surface). `getDomCssFilter` correctly
  lives in contract-only (render-proxy argument is internal plumbing). `getDomShapeRasterizer`
  and `registerDomShapeRasterizer` are exported from both `.` and `./contract`.
- `"sideEffects": false` is accurate: no top-level registration, no DOM mutation at import.
  Module-level lazy state (`_measureCtx`, `_domTextInputOverlay`, `_keyframesInjected`) only
  initializes on first function call.
- Full unabbreviated, backend-prefixed names throughout. `escapeDomHtmlString` is the
  renamed form (was `escapeHtmlString`).
- Sentinels not throws: `resolveDomTexture` returns `null` on missing resolver or source,
  `getDomShapeRasterizer` returns `null` on missing registration, `getDomRenderCacheTarget`
  returns `null` on missing cache.
- `Readonly<>` applied to geometry, texture, and descriptor inputs where present.
- `crate: null` is correct per the charter: DOM substrate does not exist in the Rust box.

**Candidate contract/doc revisions (user's gate):**

- **`releaseDomRenderCache` verb.** Uses `release*` without `acquire*` partner. The function
  calls `destroyCanvasRenderTarget` (immediate GPU/canvas resource teardown), which better
  fits `destroy*` per the dispose/destroy split. Worth addressing in a cross-renderer naming
  pass.

- **Unused dependencies.** `@flighthq/signals` and `@flighthq/log` can be moved to
  `devDependencies` (log) or removed (signals) without affecting any source file.

## Candidate open directions

The charter already enumerates open directions #1-10. Those remain relevant and are not
repeated here. This section adds observations from the current source that the charter does
not cover:

1. **The accessibility gap is the single most consequential open item.** It is the charter's
   north star #3, DOM's stated unique value, and zero lines of implementation exist. The
   `AccessibilityDescriptor` type header is ready; the consumer (an `applyAccessibility` slot,
   `enableDomAccessibility` seam, per-proxy descriptor binding via `WeakMap`) is unbuilt. This
   is the item that most determines whether the package earns its charter.

2. **CSS-filter-equivalence + SVG exact path as a unit.** `hasDomCssFilterEquivalent` and
   `getDomSvgColorMatrixFilter` / `<feColorMatrix>` injection are described together in the
   charter and prior review but neither exists. They form a natural unit: the equivalence query
   tells callers which effects the DOM backend realizes natively; the SVG path is the
   mechanism for the non-CSS-expressible-but-SVG-expressible subset (color matrix, convolution,
   displacement). Building one without the other is incomplete.

3. **`getDomBlendModeFidelity` soundness.** The return type claims `DomBlendModeFidelity` for
   any `BlendMode`, but the backing record only covers the built-in set. A vendor-prefixed mode
   silently returns `undefined`. Either the return type should be
   `DomBlendModeFidelity | undefined`, or the function should return `'unsupported'` as the
   fallback for unlisted modes.

4. **`enable*` suffix normalization.** Three seams use `Support`, three do not. A convention
   pass should pick one shape and apply it to all six.
