---
package: '@flighthq/filters-canvas'
status: solid
score: 84
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
---

# filters-canvas — Review

> Survey of `@flighthq/filters-canvas` from the `builder-67dc46d64` incoming bundle. Evidence is `incoming/builder-67dc46d64/head/packages/filters-canvas/` plus `changes.patch`. No prior `reviews/depth/filters-canvas.md` existed; this is the first survey. The charter is a seed stub (only "What it is" is filled), so most judgement falls back to the codebase-map AAA standard, and every fallback is surfaced as a candidate Open direction below.

## Verdict

`solid` — 84/100. The package is a complete, well-shaped Canvas 2D realization of the canonical 14-filter set: every filter has a `apply*FilterToCanvas` leaf, a CSS fast-path where the browser can express it, and a `filters-surface` pixel-path delegation everywhere else. The status doc's headline claims (14/14 filters, the new dispatcher + CSS predicate, the `scratch?` param, the dimension-clamp guards, alpha-convention documentation, 77 tests) all verify against the diff. It is short of the status doc's self-assessed 90 because of a real public-API naming inconsistency, an incomplete scratch-reuse promise, a closed-switch dispatcher that sits against structural fork B, and the absence of any cross-backend visual-parity proof — the one claim ("the backends agree") the unit tests structurally cannot make.

## Present capabilities

All grounded in `head/packages/filters-canvas/src/`.

**The 14 filter leaves.** One `apply*FilterToCanvas` per canonical kind, matching the 14 `*FilterKind` constants in `types/src/BitmapFilterKind.ts` exactly: bevel, blur, colorMatrix, convolution, displacementMap, dropShadow, gradientBevel, gradientGlow, innerGlow, innerShadow, median, outerGlow, pixelate, sharpen. The "14/14 canonical" claim is accurate — `GlowFilter` and `CustomFilter` appear as strings in `types` but are not in the `*FilterKind` registry (`CustomFilter` is a test-only escape hatch), so they are correctly out of the canonical set.

**Two-tier dispatch (CSS → pixel).** `canvasBlurFilter`, `canvasOuterGlowFilter`, `canvasDropShadowFilter` take a CSS `ctx.filter` fast-path (`computeBlurFilterCss` etc. from `filters-css`) for the isotropic/non-knockout case, then fall through to a `filters-surface` kernel for the anisotropic/knockout/quality cases. The expressibility decision lives in one place (`computeBitmapFilterCss`), not re-derived per filter — good single-source discipline.

**The pixel bridge (`canvasFilterBridge.ts`).** `getCanvasFilterImageData` wraps `ImageData.data` in-place as a `Surface`/`SurfaceRegion` (no copy), so `filters-surface` kernels write straight into the canvas-backing buffer; `putCanvasFilterImageData` flushes it back. The alpha convention is stamped explicitly (`alphaType: 'straight'`, `format: 'rgba8unorm'`) and asserted by a test that round-trips R=255/A=128 unchanged — this matches the SDK's documented "straight alpha, sRGB pass-through, premultiply only on GPU upload" rule. `getCanvasImageSourceWidth`/`Height` exhaustively cover every `CanvasImageSource` variant (image, video, SVG image, canvas, ImageBitmap, OffscreenCanvas, VideoFrame) with `typeof` guards for environments missing a constructor, returning `0` as the sentinel.

**Scratch reuse (`acquireCanvasFilterScratch`).** Reuses an `existing` scratch when its size matches exactly, clearing it; otherwise allocates a new `OffscreenCanvas`. Dimensions are clamped with `Math.max(1, isFinite(x) ? Math.floor(x) : 1)`, so zero/negative/NaN/Infinity never reach the `OffscreenCanvas` constructor. Every `apply*` forwards an optional `scratch` so a caller can opt into cross-frame reuse — the explicit-allocation rule honored.

**Single-source dispatcher + predicate (`canvasFilterDispatch.ts`).** `applyCanvasFilter` routes on `filter.kind` to the right leaf and returns `false` for an unknown kind (the documented fall-to-another-backend cue). `canUseCanvasFilterCssFor` is a boolean adapter over `computeBitmapFilterCss`, making the CSS-vs-pixel policy benchmarkable at a call site. The dispatcher's JSDoc correctly warns that importing it pulls all 14 leaves and points single-filter users at the leaf import to preserve tree-shaking.

**OffscreenCanvas / worker support.** The pixel-read/write bridge functions accept `CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D`, so filtering can run off-main-thread.

**Tests.** 16 colocated `*.test.ts` files (one per source file plus the dispatcher), the bundle's `changes.patch` confirms the new `canvasFilterDispatch.test.ts` and the bridge edge-case/alpha tests. `testHelper.ts` centralizes the `OffscreenCanvas` mock boilerplate and is named singular to land inside the `completeness.ts` exports-check exclusion (`endsWith('testhelper.ts')`).

**Packaging.** `sideEffects: false`, single `.` export, no top-level side effects, depends only on `entity`, `filters`, `filters-css`, `filters-surface`, `surface`, `types`. No import from `@flighthq/sdk`. `crate: null` is correct — per the Rust map there is no `filters-canvas` crate (the Canvas2D substrate does not exist in the box; software-render parity is `displayobject-skia` reusing the shared `filters-surface` kernels).

## Gaps

- **No cross-backend visual-parity proof.** The central correctness claim — Canvas output agrees with `filters-surface` (CPU) and the GPU backend within tolerance — is _asserted by delegation_, not demonstrated. The unit tests mock the canvas context, so they verify wiring (the right kernel is called, `true`/`false` is returned) but never a pixel. No functional-test scene exists. This is the highest-value missing coverage and the one thing jsdom unit tests structurally cannot reach.
- **Incomplete scratch reuse on the multi-scratch pixel paths.** `applyOuterGlowFilterToCanvas` (and by the same shape the other glow/shadow/bevel pixel paths that need a second buffer) forwards the caller's `scratch` only to the _source_ rasterization; the second `glowScratch` is allocated unconditionally with `acquireCanvasFilterScratch(width, height)` (no `existing`). A caller opting into reuse still pays one fresh `OffscreenCanvas` per call. The reuse promise in the JSDoc is therefore only half-true for these filters.
- **No multi-filter chain applier.** `applyCanvasFilterChain` (ping-pong two scratch canvases over a `filter[]`) does not exist. The status doc correctly parks this as blocked on a family-wide `BitmapFilterChain` / `ReadonlyArray<BitmapFilter>` decision in `@flighthq/types` — a cross-package design fork, not a within-package gap. (Note `filters-gl` makes the same scoping call, deferring its chain applier out of the leaf package.)
- **No tiled fallback above the OffscreenCanvas max dimension.** Sources beyond the browser limit (~16384px) silently get a clamped 1×1 scratch and lose their pixels. The clamp prevents a crash but the degradation is silent. Real-limit testing is environment-bound.
- **No guard on NaN/Inf inside `filter.matrix`/`filter.kernel`.** Delegated to the surface kernels' own clamping; there is no Canvas-layer validation, and the family already ships `bitmapFilterValidation.ts` in `@flighthq/filters` that goes unused here. Whether to validate-and-degrade or trust the kernel is an open call.
- **No package README.** The maturation roadmap called for one (dispatch policy table, scratch lifecycle, `filters-surface` delegation, alpha convention). Correctly deferred — CLAUDE.md forbids unsolicited `.md` files; this needs the user's say-so.

## Charter contradictions

The charter is a seed stub with only "What it is" populated (North star, Boundaries, Decisions, Open directions are all `TODO`/empty), so there is almost no stated rule to contradict. The one stated identity — "the per-backend functions that take a filter data descriptor from `@flighthq/filters` and realize it onto a `CanvasRenderingContext2D`" — is met faithfully: the package is exactly leaf realizers plus a bridge, with all heavy pixel math delegated to `filters-surface`. **No contradiction.**

## Contract & docs fit

**Where the package honors the contract:**

- Full, unabbreviated type words in every export (`applyDisplacementMapFilterToCanvas`, `getCanvasImageSourceWidth`); `get*` for accessors; boolean predicate named `canUse…For` (reads as a predicate even if it is not the `is*`/`has*` form).
- `Readonly<…>` on every `filter` parameter.
- Sentinels not throws on the expected-failure paths: `applyCanvasFilter` returns `false` for unknown kinds; the source-dimension helpers return `0`; the apply functions early-`return true` on degenerate (`width<=0`) input.
- `@flighthq/types`-first: every filter type and `*FilterKind` is imported from `types`, none defined inline.
- Single root export, `sideEffects: false`, no top-level registration.

**Contract-fit drift to flag:**

- **Parameter-name asymmetry (real, fixable).** Five leaves name the scratch parameter `scratchCanvas` (`canvasColorMatrixFilter`, `canvasConvolutionFilter`, `canvasInnerGlowFilter`, `canvasInnerShadowFilter`, `canvasMedianFilter` — per the diff sweep) while the rest name it `scratch`. Parameter naming is a first-class API output per the codebase map; the family should pick one (`scratch`) and use it everywhere.
- **Closed `switch(filter.kind)` in the dispatcher vs structural fork B (registry-by-default).** `applyCanvasFilter` is a 14-arm closed switch. Fork B's default is an open registry; the exception is a tight loop in a closed system. This dispatcher is _not_ a hot loop (it runs once per filter application), and the filter family is the canonical growth surface the codebase map calls out, so this is the kind of switch fork B says to revisit on growth. Mitigated by the tree-shaking JSDoc and by the fact that the leaves are independently importable — but worth surfacing as the contract-fit question for this package.
- **`acquireCanvasFilterScratch` throws on a null 2D context.** Context acquisition failing is an expected _environment_ failure, not API misuse, so by the sentinel-not-throw rule a `null` return would be more consistent than `throw new Error(...)`. Minor; it is genuinely unreachable in a conformant browser, so it sits on the line between "programmer error" and "expected failure."
- **Package Map omission (candidate doc revision).** `tools/agents/docs/index.md` Package Map lists `@flighthq/filters` and `@flighthq/filters-gl` but has no line for `filters-canvas`, `filters-css`, or `filters-surface` — yet the charter's own "What it is" names all four backend cells, and `filters-gl` got a full Map entry. The four-backend filter family should be represented consistently in the Map. Flag for the user; acting on it is their gate.

## Candidate open directions

The charter's silence forced these assumptions; each is a question for the user to settle into the charter:

1. **Is "the backends agree" a charter obligation, and is the functional-test scene the proof?** The status doc treats cross-backend parity as the package's real correctness claim but leaves it unproven. If the charter declares it in scope, the gap becomes actionable; if not, the package's bar is "wires the right kernel," nothing more.
2. **CSS fast-path vs pixel path — is the CSS path a blessed perf tier or an expedient?** A third `globalCompositeOperation` tier (e.g. `source-in` glow, offset-draw shadow) was considered and dropped. The charter should say whether CSS is a permanent first tier or whether the pixel path is the canonical one and CSS is a measured optimization.
3. **Where does the multi-filter chain live?** `filters-gl` defers its chain applier to `render-gl` / a neighbor; `filters-canvas` parks `applyCanvasFilterChain` on a `types` decision. The family needs one answer for where chain orchestration and the chain descriptor type live, across all four backends.
4. **Validation posture.** Does the Canvas layer guard NaN/Inf and oversized kernels, or is trusting the surface kernels the blessed contract? `bitmapFilterValidation.ts` exists and is unused here.
5. **Large-source behavior.** Is silent clamping above the OffscreenCanvas max acceptable, or is a tiled fallback in scope?
6. **Boundaries / non-goals.** The charter's Boundaries section is empty. The natural line — Canvas _realization only_, all pixel math owned by `filters-surface`, all CSS-expressibility owned by `filters-css` — is followed in code and should be written down so a future agent does not re-home a kernel here.
