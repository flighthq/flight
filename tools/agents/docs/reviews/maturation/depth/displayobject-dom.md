# Maturation Roadmap: @flighthq/displayobject-dom

**Current verdict:** Solid — 78/100. A working, well-factored DOM renderer with a real dirty-flag reconciler, `clip-path` clipping, CSS-filter/blend seams, a render-cache path, and full editable-text overlay; one feature-family (sprite graph) short of authoritative, with a few documented-but-thin fidelity corners.

The architecture (reconciler, clip stack, `enable*` seams, render-cache, `default*Renderer` registration) is sound. Maturation here is almost entirely about _coverage_ and _explicit fidelity contracts_, not rewrites. The hardest design call is not in this package: it is whether the DOM backend gets a sprite-graph path at all, which must be settled before Bronze ships.

## Bronze

The minimum viable "no undocumented holes" version. The goal is that any scene a user can build with `@flighthq/displayobject` + `@flighthq/sprite` either renders on DOM or fails with a known, documented contract — never silently.

- **Settle and document the sprite-graph decision (design gate, blocks the rest).** Decide explicitly: does DOM get a canvas-element-backed sprite path, or is sprite-graph rendering formally GPU/canvas-only? Record the answer in the Package Map and in a `// architecture:` note in the package. Either outcome closes the single largest gap (an undocumented hole); the choice determines whether the sprite items below land in Bronze or are struck.
- **`defaultDomSpriteRenderer` / `drawDomSprite` (if sprite path is in scope).** A single offscreen-`<canvas>`-backed sprite renderer that rasterizes the whole `Sprite`/quad-batch subtree via the existing `renderCanvasShapeCommands`-style delegation already used by `drawDomShape`. One element per sprite _graph_, not per quad — the only DOM-sane shape. This is the canonical parity expectation called out in the depth review.
- **`defaultDomTilemapRenderer` / `drawDomTilemap` (if sprite path is in scope).** Same canvas-element-backed strategy: rasterize the visible tilemap region into one `<canvas>` rather than one `<div>` per tile (which is pathological). Reuse the canvas tilemap interpreter.
- **Explicit CSS-filter degradation contract.** Make `setDomCssFilter` / `getDomCssFilter` behavior explicit for filters with no CSS equivalent (displacement, convolution, full color-matrix): either return a sentinel (`null`/`false`) from a new `hasDomCssFilterEquivalent(filter): boolean` so callers can branch, or rasterize-to-canvas. Today it is unclear whether unsupported filters silently drop. Document the chosen contract in the file header.
- **Explicit blend-mode fallback contract.** For OpenFL-only modes (`add`/`subtract`/`invert`/`alpha`/`erase`) that `mix-blend-mode` cannot reproduce, document the per-mode fallback in `applyDomBlendMode` (closest CSS mode vs no-op) and expose `getDomBlendModeFidelity(blendMode): 'exact' | 'approximate' | 'unsupported'` so users can detect lossy modes. Type the enum in `@flighthq/types`.
- **Caret color/width from text format.** Replace the hardcoded `CARET_COLOR = '#000000'` / `CARET_WIDTH = 1` in `domTextInput.ts` with values sourced from the `RichText`/text-format (`caretColor`, `caretWidth`), falling back to black/1 only when absent. Light-on-dark fields render an invisible caret today.
- **Confirm `enableDomTextInput()` state-scoping.** Resolve the asymmetry flagged in the review: every other `enableDom*Support(state)` is state-scoped, but `enableDomTextInput()` registers a global overlay slot. Either make it `enableDomTextInput(state)` for symmetry or document why the global registration cannot leak across multiple `DomRenderState`s.

## Silver

Competitive and solid — what a well-regarded DOM-rendering layer offers for common professional use, the important edge cases, and cross-backend consistency.

- **Lean into DOM's unique advantage: ARIA / semantic affordances.** Add an opt-in `enableDomAccessibility(state)` seam that emits `role`, `aria-label`, `tabindex`, and `aria-hidden` for text and interactive display objects. Source from a new `AccessibilityDescriptor` type in `@flighthq/types` (label, role, focusable) attached to display objects. This is the one capability only the DOM backend can offer; an authoritative DOM renderer must seize it. Keep it fully tree-shakable (null hook on the render state, registers nothing on import).
- **Rasterized-filter fallback path.** Beyond the Bronze _contract_, actually implement the fallback: `enableDomRasterFilterSupport(state)` that, for CSS-unsupported filters, routes the subtree through the existing render-cache (`ensureDomRenderCacheTarget`) so the filter is applied on a `<canvas>` exactly as the canvas backend does. This brings DOM filter fidelity to parity for the cases CSS cannot express.
- **`defaultDomQuadBatchRenderer` (if sprite path is in scope).** Complete the sprite family started in Bronze with the quad-batch leaf, canvas-element-backed, matching `defaultCanvasQuadBatchRenderer`.
- **Selection/caret styling parity with native fields.** Honor `selectionColor`/`selectionAlpha` already read in `domTextInput.ts` plus blink interval, multi-line caret, and bidi caret placement edge cases; expose `setDomCaretBlinkInterval`.
- **Pixel-snapping and devicePixelRatio fidelity.** Audit `setDomTransform`/`roundPixels` and the offscreen-canvas-backed renderers (shape, sprite, tilemap) for crisp rendering at fractional `pixelRatio`; rasterize backing canvases at `pixelRatio` resolution so cached/shape content is not blurry on HiDPI. Add tests at `pixelRatio` 1.5/2/3.
- **Blend-mode + clip + filter interaction correctness.** Test and fix the stacking order when a node has clip + blend + CSS filter simultaneously (CSS applies `filter` before `mix-blend-mode` before `clip-path` in a specific order; nesting may need an extra wrapper `<div>`). Document the wrapper-element strategy.
- **`defaultDomDisplayObjectRenderer` for symmetry.** Canvas exports one; DOM handles containers implicitly via traversal. Add an explicit (possibly no-op-but-registerable) renderer or document the asymmetry as intentional, so the cross-backend registration surface matches.
- **`escapeHtmlString` rename / scoping.** The generic name risks a global collision against the project's globally-unique-root-export rule. Rename to `escapeDomHtmlString` (backend-prefix-first) or stop exporting it from the barrel.
- **Cross-backend functional-test coverage.** Add functional tests (the Canvas/DOM/WebGL harness) for the sprite, tilemap, filter-fallback, and accessibility paths so DOM is checked for parity with its siblings, not just unit-tested in jsdom.

## Gold

Authoritative / AAA — the canonical reference for DOM-based display-list rendering, with exhaustive coverage, performance, full edge handling, and Rust-port posture.

- **Full accessibility tree.** Beyond per-object ARIA: a coherent accessibility _tree_ that mirrors the display list (landmark roles, reading order, focus management across the reconciled DOM, live regions for text changes), screen-reader-tested. `getDomAccessibilityTree(state)` for inspection. This is the genuine frontier for a DOM renderer and nothing else in the SDK can provide it.
- **Native form-control text input.** Optional path that backs editable text with a real `<input>`/`<textarea>`/`contenteditable` (IME composition, autofill, spellcheck, mobile virtual-keyboard, copy/paste) instead of the synthetic caret/selection overlay — wired through `@flighthq/textinput` and `@flighthq/keyboard`. The overlay path stays for pixel-exact control; the native path stays for accessibility/IME. `enableDomNativeTextInput(state)`.
- **Performance: reconciler at scale.** Benchmark and harden `domReconcile` for large lists (1000s of nodes): batched DOM writes via `DocumentFragment`, `requestAnimationFrame`-aligned flush, `will-change`/`contain` CSS hints, layer-promotion control, and recycling pools for element creation (`acquireDomElement`/`releaseDomElement`). Add a `tools/functional` performance scene.
- **CSS containment & layering controls.** Expose `setDomLayerHint(state, node, hint)` over `contain` / `will-change` / `isolation` so apps can tune compositing; document the GPU-layer cost model.
- **Exhaustive filter fidelity.** Every `@flighthq/filters` descriptor either maps to a CSS filter, composes a multi-`<feFilter>` inline-SVG `<filter>` (covers convolution, displacement, color-matrix exactly), or falls back to raster — with a published per-filter fidelity table. SVG-filter path is the DOM-native way to reach exact parity without leaving the DOM.
- **Full edge-case + error handling pass.** Detached documents, zero-size elements, NaN transforms, missing fonts, `document === undefined` (SSR), video autoplay-blocked, OOM on offscreen canvas — every expected failure returns a sentinel; only API misuse throws. Audit against the project's sentinel-vs-throw rule.
- **Complete test + docs.** Colocated unit tests for all new exports (already the norm), functional/regression baselines for every renderable kind across HiDPI and blend/clip/filter combinations, and a package-level usage doc covering the fidelity contracts (blend, filter, accessibility).
- **Rust-port posture.** Per the Rust map, `displayobject-dom` is explicitly **not** ported (its substrate — the DOM tree — does not exist in the box; it lives in `host-web` as JS). Gold's obligation is therefore _not_ a `flighthq-displayobject-dom` crate but: (1) keep all shared types (`AccessibilityDescriptor`, blend-fidelity enum, layer hints) defined in `@flighthq/types` so any future `host-web` JS Canvas2D/DOM shim and the GPU crates share one header; (2) confirm in the conformance map that DOM-renderer absence in Rust is recorded as intentional, not a gap; (3) ensure the sprite/tilemap rasterization contract matches the `displayobject-skia` reference so DOM's canvas-backed output stays comparable.

## Sequencing & effort

**Recommended order**

1. **Sprite-graph design gate (Bronze, design decision — surface to user first).** Nothing else in the sprite family can proceed until this is decided. This is a cross-package, API-shape call (does the DOM backend formally support `@flighthq/sprite`?) and should be raised with the user, not chosen autonomously. Everything else in Bronze is independent of it.
2. **Bronze fidelity contracts (low effort, high clarity payoff).** Caret-from-format, filter/blend fallback contracts, `enableDomTextInput` scoping. These are small, self-contained edits with immediate test coverage. Do these regardless of the sprite decision.
3. **Bronze sprite/tilemap renderers (medium effort, only if gate says "yes").** Reuse the existing canvas-delegation pattern from `drawDomShape`; the hard part (a canvas command interpreter) already exists in `@flighthq/displayobject-canvas`, on which this package already depends.
4. **Silver accessibility + raster-filter fallback (medium-high effort).** Accessibility needs a new `@flighthq/types` descriptor first (header-layer rule). Raster-filter fallback reuses the existing render-cache, so it is mostly wiring.
5. **Silver fidelity/HiDPI/stacking + functional tests (medium).** Cross-backend consistency work; depends on the functional-test harness, not on other packages.
6. **Gold** is a long tail; the SVG-filter exact-fidelity path and the accessibility tree are the two genuinely large, novel pieces.

**Dependencies on other packages / types (define in `@flighthq/types` first)**

- `AccessibilityDescriptor` (label/role/focusable) — new shared type; consumed by both the renderer and any future `@flighthq/interaction` focus wiring.
- Blend-mode fidelity enum (`'exact' | 'approximate' | 'unsupported'`) and `caretColor`/`caretWidth` on the text-format type — header-layer additions that also benefit canvas/webgl backends.
- Layer-hint type for Gold CSS-containment controls.
- Sprite/tilemap renderers depend on `@flighthq/sprite` (the family types) and continue to lean on `@flighthq/displayobject-canvas` for command rasterization (already a dependency).
- Native text input (Gold) depends on `@flighthq/textinput` and `@flighthq/keyboard`.

**Cross-package / design-decision items to surface**

- **The sprite-graph decision is the headline call** and crosses into `@flighthq/sprite` + Package Map scope — surface as a question, do not decide autonomously.
- **`escapeHtmlString` rename** is a public-API change (barrel export) — confirm before renaming.
- **Rust conformance map entry**: record DOM-renderer non-port as intentional; this touches the Rust worktree's conformance doc, a separate worktree — surface rather than edit cross-worktree.
- **Native-text-input path** (Gold) is an architectural fork (synthetic overlay vs real form control) with accessibility/IME implications worth a design note before building.
