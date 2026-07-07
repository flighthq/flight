---
package: '@flighthq/displayobject-dom'
updated: 2026-06-24
basedOn: ./review.md
---

# displayobject-dom — Assessment

Sorts the gaps from `review.md` (the 89/100 post-work survey) and the prior `reviews/maturation/depth/displayobject-dom.md` roadmap into sweep-safe **Recommended** work and parked **Backlog**. Much of the roadmap's Bronze/Silver tier already landed this pass — accessibility (`enableDomAccessibility`), the blend-fidelity table (`getDomBlendModeFidelity`), CSS-filter-equivalence detection (`hasDomCssFilterEquivalent`), the exact SVG color-matrix path, caret-from-format, `drawDomShape` HiDPI, the `escapeHtmlString → escapeDomHtmlString` rename, and `defaultDomDisplayObjectRenderer` symmetry are all verified-present in the review. What remains is a small set of within-package fidelity follow-ups (Recommended) and a larger set of cross-package / design-fork / Gold-tier items (Backlog), with the package's defining boundaries routed to the charter's Open directions.

The charter is an unedited stub, so no North star or Boundary constrains this sort; it is judged against the codebase-map AAA fallback. The design forks the review surfaced (sprite-graph on DOM, filter-strategy line, accessibility ceiling, native-vs-overlay text, the `enableDomTextInput` asymmetry, reconciler perf bar) belong in the charter's Open directions — they are noted at the bottom for the user, not recommended here.

## Recommended

Sweep-safe: within `@flighthq/displayobject-dom`, no cross-package coupling, no breaking change, no open design decision. A blanket "do all recommended" can bless this set safely.

- **HiDPI follow-up for `drawDomBitmap`.** The canvas-backed bitmap path (bitmaps with a `sourceRectangle`) still sizes its backing `<canvas>` at logical pixels. Apply the same physical-pixel sizing + CSS constraint + `ctx.scale(pr, pr)` fix already shipped for `drawDomShape`. The review marks this **self-contained**; it mirrors an existing in-package pattern, no new type, no other package. (review.md Gaps · roadmap Silver "Pixel-snapping and devicePixelRatio fidelity")
- **Wire `enableDomRasterFilterSupport(state)`.** `hasDomCssFilterEquivalent` already _detects_ CSS-unsupported filters; the render-cache target plumbing (`ensureDomRenderCacheTarget`) already exists. Add the opt-in seam that routes CSS-unsupported filter subtrees through the cache to rasterize them on a `<canvas>` exactly as the canvas backend does. The review states "the pieces are present; only the wiring remains" — within-package, follows the established `enable*Support(state)` seam, no design decision. (review.md Gaps · roadmap Silver "Rasterized-filter fallback path")
- **Further SVG exact-filter paths: `ConvolutionFilter` → `<feConvolveMatrix>`, `DisplacementMapFilter` → `<feDisplacementMap>`.** Extend the established `domSvgFilter.ts` color-matrix pattern (`getDomSvgColorMatrixFilter` + `release*`) to the remaining `<fe*>`-expressible filters for exact, no-readback fidelity. Same module, same shape, same `@flighthq/types`-homed inputs; additive exports with colocated tests. (review.md Gaps · roadmap Gold "Exhaustive filter fidelity")

## Backlog

Parked: cross-package coordination, larger scope, naming-convention sweeps that span sibling packages, or waiting on an Open direction. Each notes _why_ it is held.

- **Sprite-graph kinds on DOM (`drawDomSprite`/`drawDomTilemap`/`defaultDomQuadBatchRenderer`).** The headline gap, and an explicit cross-package design fork (canvas-element-backed delegation into the atlas-batch family vs. formally skipping it on DOM). **Blocked on Open direction #1** — it defines the package's identity and must be a charter Boundary before any renderer lands. Cross-package (`@flighthq/sprite`) and Package-Map-scope.
- **Per-instance ColorTransform tint on DOM.** A shared cross-backend gap (`render-backend-support.md` gap #4), not DOM-specific. Parked as cross-package — it should be resolved at the render-pipeline tier, not unilaterally in the DOM leaf.
- **Native form-control text input (`enableDomNativeTextInput`).** Real `<input>`/`<textarea>` for IME/autofill/mobile keyboard. Gold-tier and **cross-package** — depends on `@flighthq/keyboard` (and `@flighthq/textinput`) — and is an architectural fork (synthetic overlay vs. real form control) that needs a charter stance first (Open direction #4). The overlay path is authoritative today.
- **Full accessibility tree (`getDomAccessibilityTree`).** Per-object ARIA exists; landmark roles, reading order, focus management, and live regions are a larger effort and a North-star ambition call (Open direction #3), not a sweep-safe follow-up.
- **DOM functional-test scene.** Custom caret color, accessibility-descriptor DOM emission, and blend-mode fidelity vs. canvas are not exercised by `tests/functional` (jsdom unit tests cannot stand in). Parked because the work lives **outside the package tree** (`tests/functional/`) and rides the functional/capture harness — cross-cutting tooling rather than within-package source.
- **Reconciler performance at scale.** `DocumentFragment` batching, element pooling (`acquireDomElement`/`releaseDomElement`), `rAF`-aligned flush, `will-change`/`contain` hints, `setDomLayerHint`. Gold-tier perf, larger scope, and gated on whether "correct, unoptimized" is the charter's accepted bar (Open direction #6).
- **Naming-convention reconciliation across renderer packages.** The review flags three drifts for a _convention pass_, not a local edit: `releaseDomSvgColorMatrixFilter`/`releaseDomRenderCache` use the `release*` verb without an `acquire*` partner (reads more like `disposeDom*`/`removeDom*`); and `getDomSvgColorMatrixFilter` is a `get*`-prefixed function that actually _allocates_ a DOM node (the explicit-allocation constraint wants `createDom*`/`acquireDom*` paired with a true `release*`). These are public-API renames that should be decided coherently across `render-canvas`/`displayobject-dom`/etc. in one convention pass — held to avoid a one-off, inconsistent rename.
- **Package Map / doc-staleness fix.** `agents/index.md` still lists the concrete renderers as `@flighthq/render-canvas`/`render-dom`/`render-webgl` with no `displayobject-<backend>` line after the `<subject>-<backend>` reorg landed. A docs fix outside this package's source; surfaced as a contract/doc revision for the user's gate.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

### Routed to the charter's Open directions (noted, not edited here)

The review surfaced these design forks / cross-package questions; they belong in `charter.md › Open directions`, where the user settles them — they are **not** in Recommended:

1. **Sprite-graph on DOM** — the defining Boundary: canvas-element delegation for the atlas-batch family, or formally 2D-display-object-only with Sprite kinds silently skipped?
2. **Filter-strategy line** — how far DOM chases exact SVG `<fe*>` fidelity vs. falling back to canvas rasterization via the render cache (this is the boundary that scopes the two filter items above).
3. **Accessibility ceiling** — per-object ARIA as the bar, or a full accessibility tree as a North star?
4. **Native form controls vs. overlay text input** — is the overlay caret authoritative, or is real `<input>`/`<textarea>` (IME/mobile) in scope?
5. **`enableDomTextInput` global-not-state-scoped asymmetry** — bless the (stateless-overlay) exception explicitly or reconcile it to `enable*Support(state)`.
6. **Reconciler performance posture** — is "correct, unoptimized" the charter's accepted bar, or is scale (1000+ nodes, fragment batching, pooling) an in-scope goal?
