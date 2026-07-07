---
package: '@flighthq/filters-canvas'
crate: null
lastDirection: 2026-07-02
draft: false
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---


# filters-canvas — Charter

> Durable vision and core values for `@flighthq/filters-canvas`. You author this (via an agent transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

Canvas 2D backend for the SDK's bitmap-filter family — the per-backend functions that take a filter data descriptor (from `@flighthq/filters`) and realize it onto a `CanvasRenderingContext2D` (or `OffscreenCanvasRenderingContext2D`). One of four backend cells in the filter family — `filters` (the data descriptors), `filters-css` (CSS-expressibility), `filters-surface` (the CPU pixel kernels), `filters-canvas` (this), `filters-gl` (WebGL) — that together realize the canonical 14-filter set.

The package is exactly **leaf realizers plus a bridge**: one `apply*FilterToCanvas` per canonical kind, a two-tier dispatch (a CSS `ctx.filter` fast-path where the browser can express the filter, falling through to a `filters-surface` kernel everywhere else), a zero-copy `ImageData`↔`Surface` bridge so kernels write straight into the canvas-backing buffer, and a scratch-canvas pool. It owns no pixel math (that is `filters-surface`) and no CSS-string construction (that is `filters-css`). `crate: null` — there is no Rust `filters-canvas`; the Canvas2D substrate does not exist in the Rust box, and software-render parity there is `displayobject-skia` reusing the same shared `filters-surface` kernels.

_(Seeded from the prior depth review; replace with the intent in your own framing.)_

## North star

_Proposed from the design observed in review.md + the structural forks. Edit or reject in review._

- **A thin realization seam, not a math layer.** Every heavy operation delegates: pixel math to `filters-surface`, CSS-expressibility to `filters-css`. `filters-canvas` decides _how to drive the canvas_ and _which tier to use_, and nothing more. A kernel must never be re-homed here.
- **One leaf per canonical kind, independently importable.** The 14 `apply*FilterToCanvas` leaves track the 14 `*FilterKind` constants in `@flighthq/types` 1:1, and a single-filter user pays only for the leaf they import — tree-shaking is preserved by keeping the convenience dispatcher a thin, separable re-router, not the entry point.
- **Explicit allocation, no hidden buffers.** Scratch canvases are pooled through `acquire*`/reuse, clamped against degenerate dimensions, and every `apply*` forwards an optional `scratch` so a caller can opt into cross-frame reuse. Allocation is the caller's to see.
- **Stamped, single alpha/color convention at the bridge.** The `ImageData`↔`Surface` bridge stamps `alphaType: 'straight'` / `format: 'rgba8unorm'` explicitly and round-trips losslessly — matching the SDK rule (straight alpha, sRGB pass-through, premultiply only on GPU upload).
- **Sentinels on the realization seam.** An unknown kind, a missing source dimension, or degenerate input is a sentinel (`false` / `0` / early `return true`) that cues a fall to another backend — never a throw. Throws are reserved for genuine API misuse.

## Boundaries

_Proposed; confirm the line in review._

**In scope:**

- Realizing each canonical filter descriptor onto a 2D canvas context (main-thread or worker/`OffscreenCanvas`).
- The CSS-vs-pixel tier decision _as a routing call_ (delegating the expressibility predicate to `filters-css`).
- The zero-copy pixel bridge and the scratch-canvas pool that the leaves share.

**Proposed non-goals:**

- **Pixel math** — owned by `filters-surface`. No kernel lives here.
- **CSS string construction / expressibility rules** — owned by `filters-css`.
- **Filter data descriptors and `*FilterKind`** — owned by `@flighthq/filters` / `@flighthq/types`.
- **A Rust crate** — none; `crate: null` (see What it is).

## Decisions

- **2026-07-02 — Real canvas backend, implement where possible (not just CSS shim).**
- **2026-07-02 — TS-leads. `crate: null` (browser-API-bound).**

## Open directions


1. **Is "the backends agree" a charter obligation, and is a functional-test scene the proof?** The status doc treats cross-backend visual parity (Canvas ≈ `filters-surface` CPU ≈ GPU within tolerance) as the package's real correctness claim, but it is asserted by delegation, not demonstrated — jsdom unit tests mock the context and structurally cannot reach a pixel. If parity is in scope, the missing functional-test scene becomes actionable; if not, the bar is "wires the right kernel."
2. **CSS fast-path vs pixel path — blessed perf tier or expedient?** Is the CSS `ctx.filter` path a permanent first tier, or is the pixel path canonical and CSS merely a measured optimization? (A third `globalCompositeOperation` tier was considered and dropped.)
3. **Where does the multi-filter chain live?** `applyCanvasFilterChain` (ping-pong two scratch canvases over a `filter[]`) is parked on a family-wide `BitmapFilterChain` / `ReadonlyArray<BitmapFilter>` decision in `@flighthq/types`. `filters-gl` makes the same deferral. The family needs one answer for where chain orchestration and the chain descriptor type live across all four backends — a cross-package fork, not a within-package gap.
4. **Validation posture.** Does the Canvas layer guard NaN/Inf and oversized `filter.matrix`/`filter.kernel`, or is trusting the surface kernels' own clamping the blessed contract? `bitmapFilterValidation.ts` already exists in `@flighthq/filters` and is unused here.
5. **Large-source behavior.** Is silent clamping above the `OffscreenCanvas` max dimension (~16384px, where a source currently degrades to a 1×1 scratch and loses its pixels) acceptable, or is a tiled fallback in scope?
6. **Boundaries / non-goals — write the line down.** The Canvas-realization-only boundary (pixel math owned by `filters-surface`, CSS-expressibility by `filters-css`) is followed in code but unstated. Confirm the Boundaries section above so a future agent does not re-home a kernel here.

   Within-package contract-fit fixes the review flagged (candidates for the charter to wave through to `assessment.md` rather than decide here): the `scratch` vs `scratchCanvas` parameter-name asymmetry across five leaves; the incomplete scratch-reuse on the multi-scratch glow/shadow/bevel pixel paths (the second `glowScratch` is allocated unconditionally); and `acquireCanvasFilterScratch` throwing — rather than returning `null` — on a null 2D context.

7. **Structural fork B — closed switch vs open registry.** `applyCanvasFilter` is a 14-arm closed `switch(filter.kind)`. Fork B's default is an open registry (the exception is a tight loop in a closed system); this dispatcher is not a hot loop and the filter family is the canonical growth surface the codebase map calls out, so it is exactly the switch fork B says to revisit on growth. Decide whether the convenience dispatcher stays a closed switch or moves to a registry — consistently across all four backend cells.
8. **Package Map representation (doc revision).** `agents/index.md`'s Package Map lists `@flighthq/filters` and `@flighthq/filters-gl` but has no line for `filters-canvas`, `filters-css`, or `filters-surface`. The four-backend filter family should be represented consistently in the Map. (Flag for the user; acting on it is your gate.)
9. **No package README (yet).** A README (dispatch policy table, scratch lifecycle, `filters-surface` delegation, alpha convention) was called for by the maturation roadmap but deferred — CLAUDE.md forbids unsolicited `.md` files. Needs your explicit say-so.
