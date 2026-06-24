---
package: '@flighthq/filters-canvas'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/filters-canvas

The review verdict is **solid — 84/100**. The package is the complete Canvas 2D realization of the canonical 14-filter set: every kind has an `apply*FilterToCanvas` leaf, a CSS fast-path where the browser can express it, and a `filters-surface` pixel-path delegation everywhere else, bridged by a zero-copy `ImageData` ↔ `Surface` view with the alpha convention stamped explicitly. The maturation roadmap that seeded this assessment is now badly out of date — it still calls the package a "3-function CSS shim (20/100)," but its entire Bronze tier (the pixel bridge, colorMatrix, convolution, blur-anisotropy fallback) and most of Silver (full 14/14 coverage, scratch reuse, hybrid dispatch policy, OffscreenCanvas support, the alpha/color-space contract) have **landed** and verify in the review. What remains is a small set of within-package cleanups plus a cluster of items that are genuinely cross-package or need a charter decision. The charter is a seed stub (only "What it is" is filled), so every design fork the review had to assume past is routed to its **Open directions** below — noted here, not acted on — rather than into Recommended.

## Recommended

Sweep-safe: within `@flighthq/filters-canvas`, no cross-package coupling, no breaking change, no open design decision. A blanket "do all recommended" can bless this whole set.

1. **Unify the scratch parameter name to `scratch`.** Five leaves name it `scratchCanvas` (`canvasColorMatrixFilter`, `canvasConvolutionFilter`, `canvasInnerGlowFilter`, `canvasInnerShadowFilter`, `canvasMedianFilter`) while the rest name it `scratch`. Parameter naming is a first-class API output per the codebase map; pick `scratch` and use it everywhere. Pure rename within the package, no behavior change. — review.md#contract--docs-fit
2. **Finish the scratch-reuse promise on the multi-scratch pixel paths.** `applyOuterGlowFilterToCanvas` (and the same shape in the other glow/shadow/bevel pixel paths that need a second buffer) forwards the caller's `scratch` only to the source rasterization; the second `glowScratch` is allocated unconditionally with `acquireCanvasFilterScratch(width, height)` and no `existing`. Thread a second reusable scratch through so a caller opting into reuse does not still pay one fresh `OffscreenCanvas` per call — the JSDoc reuse promise is currently only half-true for these filters. Within-package and matches the existing `acquireCanvasFilterScratch(existing, …)` pattern. — review.md#gaps
3. **Return `null` instead of throwing from `acquireCanvasFilterScratch` on a null 2D context.** Context acquisition failing is an expected _environment_ failure, not API misuse, so by the sentinel-not-throw rule a `null` return is more consistent than `throw new Error(...)`. The other apply/dimension helpers already return sentinels (`false`/`0`); this aligns the one outlier. (Minor — it is genuinely unreachable in a conformant browser, but the change is local and the rule is the contract's.) — review.md#contract--docs-fit

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Each notes why.

1. **Cross-backend visual-parity functional-test scene(s).** The package's central correctness claim — Canvas output agrees with `filters-surface` (CPU) and the GPU backend within tolerance — is asserted by delegation, never demonstrated by a pixel. The unit tests mock the canvas context and structurally cannot reach this; it needs a `tests/functional/` scene in the functional suite (cross-package), and it is gated on whether "the backends agree" is even a charter obligation (Open direction 1). Highest- value missing coverage, but not within-package and not sweep-safe. — review.md#gaps, reviews/maturation/depth#silver
2. **`applyCanvasFilterChain` (multi-filter chain applier).** Ping-pong two scratch canvases over a `BitmapFilter[]`. Blocked on a family-wide chain/stack descriptor type (`BitmapFilterChain` / `ReadonlyArray<BitmapFilter>`) that must land in `@flighthq/types` first and be consumed identically by all four backends — `filters-gl` makes the same deferral. Cross-package design fork, routed to Open direction 3; do not implement Canvas-locally ahead of the type. — review.md#gaps, reviews/maturation/depth#gold
3. **Validation posture for NaN/Inf in `filter.matrix` / `filter.kernel`.** The family already ships an unused `bitmapFilterValidation.ts` in `@flighthq/filters`; the Canvas layer currently delegates all clamping to the surface kernels. Whether to validate-and-degrade here or trust the kernel is an open call (Open direction 4), and adopting the validator wires a new use of a sibling-package module — not a sweep-safe one-liner. — review.md#gaps, review.md#candidate-open-directions-4
4. **Tiled fallback above the OffscreenCanvas max dimension (~16384px).** Sources past the browser limit silently get a clamped 1×1 scratch and lose their pixels; the clamp prevents a crash but the degradation is silent. Whether a tiled fallback is in scope is itself an Open direction (5), and the real-limit behavior is environment-bound (hard to test in jsdom). — review.md#gaps, reviews/maturation/depth#gold
5. **Package README (dispatch policy table, scratch lifecycle, `filters-surface` delegation, alpha convention).** The roadmap called for it, but CLAUDE.md forbids unsolicited `.md` files — needs the user's explicit say-so before an agent writes it. — review.md#gaps, reviews/maturation/depth#gold
6. **Package Map entry for the four-backend filter family.** `tools/agents/docs/index.md` lists `@flighthq/filters` and `@flighthq/filters-gl` but has no line for `filters-canvas`, `filters-css`, or `filters-surface`. Editing the shared Package Map is a docs-wide change outside this cell; route the Map edit to the user. — review.md#contract--docs-fit
7. **`@flighthq/filters-presets` neighbor (named convolution/displacement kernels, photographic LUTs).** The roadmap flagged this as a _family-wide_ design question (it would serve gl/surface too), to be surfaced rather than built speculatively. Cross-package by definition; parked until the family needs it. — reviews/maturation/depth#gold

## Open directions (for the charter — not edited here)

The charter is a stub (North star, Boundaries, Decisions, Open directions all empty); these are decisions the review/roadmap had to assume past. Route them to the charter's **Open directions** for an explicit conversation. They are **not** Recommended.

1. **Is "the backends agree" a charter obligation, and is a functional-test scene the proof?** The status doc treats cross-backend parity as the package's real correctness claim but leaves it unproven. If the charter declares it in scope, Backlog 1 becomes actionable; if not, the package's bar is "wires the right kernel" and no more. — review.md#candidate-open-directions-1
2. **CSS fast-path: blessed permanent perf tier, or measured expedient?** A third `globalCompositeOperation` tier was considered and dropped. The charter should say whether CSS is a permanent first tier or whether the pixel path is canonical and CSS is an optimization. — review.md#candidate-open-directions-2
3. **Where does the multi-filter chain (and its descriptor type) live?** `filters-gl` defers its chain applier to a neighbor; `filters-canvas` parks `applyCanvasFilterChain` on a `@flighthq/types` decision. The family needs one answer for where chain orchestration and the chain descriptor type live, across all four backends (gates Backlog 2). Structural fork B / cross-package. — review.md#candidate-open-directions-3
4. **Validation posture.** Does the Canvas layer guard NaN/Inf and oversized kernels (adopting the existing unused `bitmapFilterValidation.ts`), or is trusting the surface kernels the blessed contract? Governs Backlog 3. — review.md#candidate-open-directions-4
5. **Large-source behavior.** Is silent clamping above the OffscreenCanvas max acceptable, or is a tiled fallback in scope? Governs Backlog 4. — review.md#candidate-open-directions-5
6. **Dispatcher: closed `switch(filter.kind)` vs. open registry (structural fork B).** `applyCanvasFilter` is a 14-arm closed switch. It is _not_ a hot loop (once per filter application) and the leaves are independently importable, so fork B's "closed is fine when not hot" leans toward keeping it — but the filter family is the canonical growth surface the codebase map calls out, so it is the kind of switch fork B says to revisit on growth. A conscious ruling, not a sweep. — review.md#contract--docs-fit
7. **Boundaries / non-goals.** The natural line — Canvas _realization only_, all pixel math owned by `filters-surface`, all CSS-expressibility owned by `filters-css` — is followed in code and should be written down so a future agent does not re-home a kernel here. — review.md#candidate-open-directions-6

## Approved

_None. Approval is the user's verbal gate; nothing frozen yet._

---

_Absorbed `reviews/maturation/depth/filters-canvas.md` (one-time seed). Its Bronze tier and most of Silver have **landed** since it was written (verified in review.md — pixel bridge, 14/14 coverage, scratch reuse, hybrid dispatch, OffscreenCanvas, alpha/color-space contract); the residue is sorted into Backlog and Open directions above. Safe to remove on the next migration sweep._
