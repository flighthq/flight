---
package: '@flighthq/displayobject-canvas'
updated: 2026-06-24
basedOn: ./review.md
---

# displayobject-canvas — Assessment

Sorting the gaps from `review.md` and the prior maturation roadmap into sweep-safe `Recommended` (within-package, non-design-decision) and parked `Backlog`. The roadmap's whole **Bronze** tier (umbrella registration + entries data array, Erase/Alpha blend map, documented unsupported modes, `enable*Support` unification, mask-contract documentation) **already landed** in the `builder-67dc46d64` pass and is verified in the review — it is not re-listed here. What remains is the Silver/Gold authoritative gap, most of which is cross-package, design-fork, or visual-session work and therefore parks in `Backlog`. The charter is an unfilled stub; the design forks below are surfaced to its **Open directions**, not into `Recommended` (see the routing note at the end).

## Recommended

Strictly within `@flighthq/displayobject-canvas` — no upstream type change, no cross-package coupling, no open design decision. Safe to bless as a set.

- **`LineScaleMode 'horizontal'` / `'vertical'`** — today both fall back to `'normal'`. The `strokeScaleMode` field already exists on `CanvasShapeDrawState` (added in `@flighthq/types` by the incoming pass) and `'none'` is implemented; this is the per-axis completion: decompose the canvas transform into x/y scale at flush time and divide `strokeWidth` by the relevant axis only. No new type, fully in-package. (review.md Gaps; roadmap Silver "Full `lineStyle` semantics".)
- **Image-smoothing parity audit** — `drawCanvasBitmap` honors per-bitmap `smoothing` against `state.allowSmoothing`, but scale-9, tilemap, and pattern/bitmap fills are not audited for the same behavior. Make `imageSmoothingEnabled`/quality and per-bitmap overrides consistent across all four paths. In-package consistency fix. (review.md Gaps; roadmap Silver "Image-smoothing parity".)
- **Draw-walk state-minimization extension** — the blend map already caches the current mode on the runtime to skip redundant `globalCompositeOperation` writes; extend the same discipline to `globalAlpha`, transform, line/fill style, and `context.filter`, and batch consecutive same-state draws. No API change, no allocation-boundary change. (roadmap Gold "Performance pass on the draw walk"; the per-call scratch `_drawState` allocation was already removed in the incoming pass.)
- **Particle-emitter additive fast path** — `drawCanvasParticleEmitter` should honor per-emitter blend mode (additive is the common case) with a state-minimized inner loop and per-particle alpha/tint via `globalAlpha`/composite, avoiding per-particle `save`/`restore`. Within-package draw optimization; the cross-package particles↔sprite data-vs-participation line (fork A) is untouched. (roadmap Gold "Particle-emitter blend & additive fast path".)
- **Degenerate-input sentinel tests** — verify no draw path throws on zero-size targets, empty command buffers, singular fill/stroke matrices, or detached canvas, and add a colocated test per case. The lookups already return sentinels; this hardens and proves the no-throw discipline. In-package tests only. (roadmap Gold "Exhaustive error/sentinel discipline" + "Vector/path edge cases": winding-rule, large-coordinate, NaN/Infinity guards.)

## Backlog

Parked — each names why it cannot go in a blanket sweep.

- **Dashed strokes (`setLineDash`/`lineDashOffset`)** — _cross-package._ Blocked on a `dashPattern`/`dashOffset` field in the `lineStyle` command tuple in `@flighthq/types` + `@flighthq/shape`; canvas is the consumer, not the owner. Do the header/data-carrier change upstream first. (review.md Gaps; roadmap Bronze/Silver.)
- **`BitmapFillRepeat` (four-way repeat) + `pixelSnapping`** — _cross-package new types._ `beginBitmapFill` takes a boolean `repeat`; the four-way `repeat`/`no-repeat`/`repeat-x`/`repeat-y` union and the `pixelSnapping` (`auto`/`never`/`always`) knob must be defined in `@flighthq/types` first and carried by the bitmap-fill command upstream. (review.md Gaps; roadmap Silver.)
- **Render-target readback** (`getCanvasRenderTargetImageData` / `readCanvasRenderTargetPixels` or a `CanvasRenderTarget → ImageSource` bridge) — _waits on an Open direction._ The ownership line with `@flighthq/surface` (raw `ImageData` vs. a surface bridge) is an undecided API fork; building either before the decision risks a duplicate pixel path. (review.md Gaps + Candidate open direction #2; roadmap Silver.)
- **Cross-backend functional conformance scenes** — _visual-session + waits on Open direction._ jsdom unit tests cannot prove rendered pixels; these are `tests/functional` scenes (Erase/Alpha blend, scale-mode `'none'`/per-axis, scale-9 smoothing, bitmap-fill repeat) authored via the functional-test skill, run through `test:parity`/`test:regression`. Depends on the features above existing and on Open direction #4 (which backends they target, the `rust:skia ~ ts:canvas` pairing). The single largest gap to authoritative. (review.md Gaps + Candidate open direction #4; roadmap Silver.)
- **Quad-batch / tilemap per-quad tint / `ColorTransform`** — _conformance-map decision, not code._ Canvas2D cannot do arbitrary per-vertex color; the work is deciding and documenting the canonical fallback (offscreen multiply pass vs. recorded divergence) in the conformance map, a cross-doc ruling tied to fork A. (roadmap Gold.)
- **Filter completeness via the seam / `CanvasFilterRenderer` registry** — _design fork._ Beyond the CSS-filter string path, the multi-pass offscreen route (displacement-map, convolution) through `@flighthq/filters` + `CanvasRenderTarget` may want a per-kind registry analogous to `canvasMaterialRegistry`. Whether to add that registry is a registry-shape decision (fork B), not a mechanical add. (roadmap Gold.)
- **Rust-parity posture documentation** — _cross-doc, not this package._ Record in `tools/agents/docs/rust/conformance.md` that `displayobject-canvas` is intentionally TS/host-web only and that `rust:skia ~ ts:canvas` is the reference pairing. No `flighthq-displayobject-canvas` crate is ever built; this is a conformance-map entry owned elsewhere. (roadmap Gold; review.md confirms `crate: null` is correct.)
- **Package-level supported-feature doc + Package Map entry** — _outside the package._ The roadmap's Gold "Documentation" item (supported vs. unsupported blend/scale modes, mask/filter/cache flows) and the review's catch that the **live** `tools/agents/docs/index.md` Package Map has no `displayobject-canvas` / `displayobject-<backend>` / `@flighthq/clip` entries are doc edits the user gates, not within-package code. (review.md Candidate doc revisions; roadmap Gold.)

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._

---

**Routed to the charter's Open directions (noted, not authored — the charter is the user's gate).** The review surfaced five direction questions the assessment cannot decide and deliberately keeps out of `Recommended`: (1) whether `displayobject-canvas` is the _primary_ 2D software path or the _thin host-web_ path with `displayobject-skia` as the conformance reference — this gates how hard to push canvas-specific fidelity; (2) render-target readback ownership vs. `@flighthq/surface`; (3) the fidelity floor for unsupported blend modes (`Invert`/`Shader`/`Subtract` — bless "degrade and document" or require a pixel-readback path); (4) where cross-backend conformance scenes live and which backends/cross-impl pairings they target; (5) whether the open `canvasShapeRegistry` command tuple is the right extension surface or whether dash/bitmap-fill should become first-class typed fields. These belong in `charter.md › Open directions` after a direction pass; the absence of any charter at all is itself the headline finding for that pass.
