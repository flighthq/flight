---
package: '@flighthq/displayobject-dom'
crate: null
lastDirection: 2026-07-02
draft: false
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# displayobject-dom — Charter


## What it is

`@flighthq/displayobject-dom` is the DOM-tree backend renderer for the 2D display-object family. It is a `<subject>-<backend>` leaf in the render layering: it takes the backend-agnostic core (`@flighthq/render`) and the display-object node types (`@flighthq/displayobject`, `@flighthq/shape`, `@flighthq/text`, `@flighthq/textinput`) and draws each leaf as live DOM elements, reconciling the display list against the document on each frame.

It is one of several interchangeable backends. Where `displayobject-canvas` rasterizes into a 2D context and `displayobject-gl`/`displayobject-wgpu` upload to the GPU, this package's substrate is the **DOM tree itself** — and that substrate is its differentiator, not a limitation. DOM is the only backend that can carry real accessibility (ARIA roles, focus, tab order), native CSS/SVG visual effects (`mix-blend-mode`, `filter`, `<feColorMatrix>`), and live HTML/video embedding without emulation. It is deliberately **not** ported to Rust (`crate: null`): the DOM tree does not exist in the Rust box, so there is no substrate to port to.

It ends where the node graph and the render core begin: it owns DOM element creation, placement, styling, and reconciliation, but not the display-list walk's transform/alpha/visibility propagation (that is `@flighthq/render`'s update pass) nor the node data itself (that is the display-object packages). Its neighbor `displayobject-canvas` is reused internally for the canvas-backed escape hatch (shape/bitmap rasterization into a `<canvas>` element).

## North star

_Proposed, not blessed — edit or reject in review._

1. **DOM-native first; rasterize only as the documented fallback.** When the platform offers an exact, native expression of an effect — `mix-blend-mode`, `filter: blur/drop-shadow`, SVG `<feColorMatrix>` — prefer it over rasterizing into a `<canvas>`. The native path is what makes this backend worth having; rasterization is the escape hatch, reached explicitly, not the default.

2. **Honesty about fidelity is part of the API.** Because DOM can only approximate some intents, the backend reports where it is lossy (`getDomBlendModeFidelity` → `exact | approximate | unsupported`, `hasDomCssFilterEquivalent`) so a caller can choose the DOM path with eyes open. A renderer that silently degrades is worse than one that says what it cannot do exactly.

3. **Accessibility is this backend's unique value, not an afterthought.** DOM is the only backend that can produce a real, screen-reader-navigable accessibility surface. Per-object ARIA descriptors are the floor; how far up the tree (landmarks, focus order, live regions) this package climbs is the package's signature ambition — see Open directions.

4. **Opt-in seams, side-effect-free import.** Every capability beyond the base draw set installs through an explicit `enable*` function on the render state and pulls none of its module until enabled (`enableDomBlendModeSupport`, `enableDomCssFilterSupport`, `enableDomClipSupport`, `enableDomRenderCache`, `enableDomAccessibility`). Importing the package registers nothing and mutates no global; the tree-shake boundary is the discipline.

5. **Element ownership lives in the render loop, not the draw functions.** Placement and reconciliation are centralized (`setDomRendererElement`, `reconcileDomContainer`, the ping-pong order lists), so each leaf draw function styles its element and never decides where it sits in the tree. This boundary keeps the reconciler the single authority over DOM structure.

## Boundaries

_Proposed, not blessed — edit or reject in review._

**In scope:**

- The full 2D display-object leaf set as DOM elements: shape, bitmap, scale9, rich/label/native text, video, html-view, render cache, and clipping.
- DOM-native visual effects: blend modes via `mix-blend-mode`, CSS-filter-equivalent filters, and exact SVG `<fe*>` filter paths (color-matrix today).
- The accessibility seam — the capability no other backend has.
- The canvas-overlay text-input caret path (configurable caret color/width).
- Reconciling the live display list against the document each frame.

**Out of scope:**

- **No Rust port.** Intentional — the DOM substrate does not exist in the Rust box.
- **Not the render core.** Transform/alpha/visibility propagation and the update pass belong to `@flighthq/render`; this package consumes the prepared render nodes.
- **Not the node data.** Display-object/shape/text node types and their state live in their own packages.
- **GPU/atlas-batch rendering is not DOM's strength** — whether the sprite-graph family is rendered here at all is an open boundary, not a settled in-scope item (see Open directions #1).

## Decisions

- **2026-07-02 — DOM sprite rendering formally out of scope (batching meaningless in DOM).**
- **2026-07-02 — No umbrella registerAll — maximum tree-shaking.**
- **2026-07-02 — TS-leads. `crate: null` (browser-API-bound).**

## Open directions

Every question the review surfaced against the AAA fallback, plus the structural forks that touch this package. These are for you to settle into North star / Boundaries / Decisions.

1. **Sprite-graph on DOM — the defining boundary (structural fork A).** Does `displayobject-dom` render the atlas-batch family (Sprite/Tilemap/QuadBatch) via canvas-element delegation, or is the DOM backend formally 2D-display-object-only with Sprite kinds silently skipped? `render-backend-support.md` confirms these are ✗ on DOM today. This is the single decision that most shapes the package's identity and should become an explicit Boundary. It is also an instance of the source-data-vs-graph-participation fork — where the sprite-graph node family is rendered, if at all.

2. **Filter-fidelity strategy boundary.** How far does DOM chase exact fidelity via the SVG `<fe*>` path (color-matrix → convolution → displacement) versus falling back to canvas rasterization through the render cache (`enableDomRasterFilterSupport`, not yet wired)? Where is the line between "native-CSS/SVG exact" and "rasterize"? North star #1 leans native-first but the cutoff is undecided.

3. **Accessibility ambition (North star #3's ceiling).** Is per-object ARIA the intended ceiling, or is a full accessibility tree (`getDomAccessibilityTree`, landmark roles, reading order, focus management, live regions) in scope? This is DOM's unique value proposition and deserves an explicit stance.

4. **Native form controls vs. overlay text input.** Is the canvas-overlay caret the authoritative text path, or should DOM eventually back editable text with real `<input>`/`<textarea>` for IME, autofill, and mobile keyboards? The native path would depend on `@flighthq/keyboard`.

5. **`enableDomTextInput` global-not-state-scoped asymmetry.** The text-input seam is intentionally global (the overlay is stateless), which breaks the `enable*Support(state)` symmetry of every other seam. Bless the asymmetry explicitly or reconcile it.

6. **Reconciler performance posture (Gold tier).** Is "correct, unoptimized" acceptable as the bar, or is scale (1000+ nodes, `DocumentFragment` batching, element pooling, `rAF` alignment, `will-change`/ `contain` hints) an in-scope goal?

7. **`release*` / `get*` naming convention (cross-package, convention pass).** `releaseDomSvgColorMatrixFilter` and `releaseDomRenderCache` use `release*` without an `acquire*` partner — the design constraints reserve `release*` for pool `acquire`/`release` brackets. The SVG-filter teardown removes a DOM node, which reads more like `disposeDom*`/`removeDom*`. Relatedly, `getDomSvgColorMatrixFilter` _allocates_ a `<filter>` node but carries a `get*` (getter) prefix; a name signalling allocation (`createDom*`/`acquireDom*`) would fit the explicit-allocation constraint better. A naming-convention ruling across the renderer packages, surfaced here.

8. **Package Map staleness (doc revision, user's gate).** `agents/index.md` still lists the renderers as `render-canvas`/`render-dom`/`render-webgl`; the `<subject>-<backend>` reorg has landed in code but the Package Map has no `displayobject-dom` line. The map should be updated to the `displayobject-<backend>` naming.

9. **No DOM functional-test scene.** The DOM-only behaviors (custom caret color, accessibility-descriptor emission inspected in the DOM, blend-mode fidelity vs. canvas) are not exercised by `tests/functional`; jsdom unit tests cannot stand in. Is committing such a scene part of the charter's bar?

10. **HiDPI follow-up for `drawDomBitmap`.** The canvas-backed bitmap path still sizes its backing canvas at logical pixels; the HiDPI fix applied to `drawDomShape` should follow. Self-contained — confirm it belongs in the package's definition of done.
