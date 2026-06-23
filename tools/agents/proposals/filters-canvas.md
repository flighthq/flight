---
id: filters-canvas
title: '@flighthq/filters-canvas'
type: depth
target: filters-canvas
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/filters-canvas.md
  - tools/agents/docs/reviews/depth/filters-canvas.md
depends_on: []
updated: 2026-06-23
---

## Summary

stub — completeness 20/100; a 3-function CSS-filter-string adapter (blur, drop-shadow, outer-glow) covering 3 of ~14 canonical filters and only their CSS-expressible subset, adding almost nothing over calling `@flighthq/filters-css` directly.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

Minimum viable: make the package an actual Canvas-2D filter implementation, not a CSS shim, and stop silently no-opping on ordinary inputs. The 20% that delivers 80%.

- **`getCanvasImageData(out, ctx, x, y, width, height)` / `putCanvasImageData(ctx, source, x, y)`** — the internal bridge between a `CanvasRenderingContext2D` rect and a `SurfaceRegion` view over `ImageData.data`, so any `filters-surface` kernel can run on a canvas. This is the load-bearing primitive everything else builds on; keep it module-private at first, export later if a callsite needs it.
- **`applyColorMatrixFilterToCanvas(dest, source, dx, dy, filter)`** — the single most-used filter (tint/grayscale/saturation/hue). Implemented by drawing `source` to a scratch buffer, `getImageData`, `applyColorMatrixFilterToSurface`, `putImageData`. Closes the most glaring single gap.
- **`applyBlurFilterToCanvas` — remove the `false`-on-anisotropy path.** When `blurX !== blurY` (or `quality > 1`), fall through to the pixel path via `applyBlurFilterToSurface` instead of returning `false`. Keep the fast `ctx.filter` path when CSS can express it (isotropic, single-quality); the boolean now means "genuinely unsupported," never "I didn't bother."
- **`applyConvolutionFilterToCanvas(dest, source, dx, dy, filter)`** — general NxN kernel (emboss/edge-detect/custom) via `applyConvolutionFilterToSurface`. Highest-value-per-line after colorMatrix.
- **Honest `package.json` description** — replace "Canvas 2D implementations for bitmap filter effects" wording only once the pixel path exists (it now earns the claim).
- Colocated `*.test.ts` for each new function (jsdom + a real `OffscreenCanvas`/2D context mock), mirroring the existing test shape; alphabetized exports in `index.ts`.

### Silver

Competitive and solid: full canonical filter coverage and the edge cases a professional reaches for, with the CSS fast-path retained wherever it is genuinely faster.

- **Complete the 14-filter family** — add the remaining backend cells, each delegating to its `filters-surface` kernel through the pixel bridge:
  - `applyDropShadowFilterToCanvas` — extend to handle **knockout** and **inner** modes (currently `false`) via composite operations / the surface kernel.
  - `applyOuterGlowFilterToCanvas` — same: knockout + anisotropy through the pixel path.
  - `applyInnerGlowFilterToCanvas`, `applyInnerShadowFilterToCanvas`.
  - `applyBevelFilterToCanvas`, `applyGradientBevelFilterToCanvas`, `applyGradientGlowFilterToCanvas`.
  - `applyDisplacementMapFilterToCanvas` (uses a second `CanvasImageSource`/`SurfaceRegion` as the map).
  - `applyMedianFilterToCanvas`, `applyPixelateFilterToCanvas`, `applySharpenFilterToCanvas`.
  - Result: 14/14, matching `filters-surface` and `filters-gl` export-for-export.
- **Hybrid dispatch policy, made explicit** — a documented rule (and a small internal `canUseCanvasFilterStringFor(filter)` predicate) for when each function takes the `ctx.filter` CSS fast-path vs. the pixel path, so behavior is predictable and benchmarkable rather than per-function ad hoc.
- **`quality`/multi-pass handling** — honor the filter's `quality` field (iterated box-blur passes for blur/glow/shadow), matching how `filters-surface` interprets it, so Canvas output is visually consistent with the other backends at the same descriptor.
- **Scratch-buffer reuse / explicit allocation** — a `CanvasFilterScratch` (a pooled offscreen canvas + reusable `Uint8ClampedArray`) with `createCanvasFilterScratch()` / `disposeCanvasFilterScratch()` so per-frame filtering does not allocate a new canvas + ImageData every call. Optional `scratch` parameter on each apply function (allocates internally when omitted — explicit-allocation rule).
- **Cross-backend consistency tests** — a functional-test scene per filter that asserts Canvas output matches `filters-surface` within tolerance (the canonical CPU reference) and is structurally close to `filters-gl`. This is where "the backends agree" parity is actually proven for this cell.
- **Region / bounds correctness** — filters that grow bounds (blur, glow, shadow, bevel) draw into a correctly expanded `(dx, dy)` + margin so output is not clipped; document the margin contract.

### Gold

Authoritative / AAA: nothing a domain expert finds missing for a Canvas-2D filter backend, with performance, exhaustive edge handling, and full docs.

- **`applyCanvasFilter(dest, source, dx, dy, filter)`** — a single generic dispatcher over `filter.kind` (the `*Kind` string identifier) that routes to the specific function, so callers can apply an arbitrary `BitmapFilter` without a switch. Plus **`applyCanvasFilterChain(dest, source, dx, dy, filters)`** for ordered multi-filter stacks (ping-pong between two scratch canvases), the way OpenFL `filters[]` arrays compose. Types for any chain/stack descriptor land in `@flighthq/types` first.
- **Performance path** — prefer `ctx.filter` / `globalCompositeOperation` composite implementations (offset-draw shadows, `source-in` glows, `multiply` bevels) over a full pixel pass wherever they are bit-comparable, and document per-filter which path wins; benchmark harness comparing composite vs. pixel vs. CSS so the dispatch policy is data-driven, not guessed.
- **Exhaustive edge + error handling** — zero/negative blur, empty regions, single-pixel sources, NaN/Inf in matrices and kernels, kernel size larger than the source, out-of-range `dx/dy`, source larger than max canvas dimensions (tiled fallback). Sentinel (`false`) only for genuinely unrepresentable inputs; throw only on misuse (e.g. mismatched scratch dimensions). No silent no-ops remain.
- **`OffscreenCanvas` / worker support** — every function typed against `CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D` so filtering can run off the main thread; the scratch pool works in a worker.
- **Color-space correctness** — explicit handling of premultiplied vs. straight alpha and sRGB pass-through to match the documented renderer convention (RGBA8 non-sRGB, premultiplied), so Canvas matches `filters-surface`/`filters-gl` at the pixel level rather than approximately.
- **`-formats` neighbor only if warranted** — if convolution/displacement presets (sharpen kernels, emboss matrices, named photographic LUTs) grow, factor them into a `@flighthq/filters-presets` neighbor rather than bloating this backend; surface as a design question, do not build speculatively.
- **Full test matrix + docs** — colocated unit tests per function (distinct-out and aliased-`out` cases), functional regression baselines per filter across Canvas/DOM/GL, and a package README documenting the dispatch policy, the `filters-surface` delegation, the scratch lifecycle, and the bounds-margin contract.
- **Rust port:** none required — `filters-canvas` is intentionally excluded from the Rust workspace (no Canvas2D substrate; CPU parity is `flighthq-filters-surface`). Gold for this cell is "authoritative within the browser," not "1:1 with a Rust crate." Confirm the exclusion still holds when sealing Gold rather than assuming it.

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Pixel bridge first (Bronze).** `getCanvasImageData`/`putCanvasImageData` + the scratch-canvas pattern is the keystone; nothing else is possible without it. Small, self-contained, ~half a day. No new `@flighthq/types` work — reuses `SurfaceRegion`.
2. **colorMatrix + convolution + blur anisotropy fallback (Bronze).** Each is a thin delegate to an existing `filters-surface` kernel once the bridge exists. Low effort, high value. These three move the package from "shim" to "real backend."
3. **Remaining 11 filters (Silver).** Mechanical once the bridge + delegation pattern is proven — one function + one test per filter, all delegating to `filters-surface`. The bevel/gradient/inner family is the most involved (composite tricks vs. pixel path), shadows/glows need knockout+inner modes wired. Medium effort, mostly volume.
4. **Scratch pool + quality + hybrid dispatch policy (Silver).** Once correctness is in, make it not allocate per frame and make the CSS-vs-pixel choice explicit and benchmarkable.
5. **Cross-backend consistency tests (Silver).** Depends on the functional-test harness; this is where the "backends agree" claim is earned. Coordinate with whoever owns the filter functional scenes.
6. **Generic dispatcher + chain (Gold).** Needs a chain/stack descriptor type — **define it in `@flighthq/types` first**, and align with how `filters`/`filters-gl`/`filters-surface` would consume the same chain type (this is a cross-package design decision, not a Canvas-local one — surface it before building).
7. **Performance, color-space, OffscreenCanvas, edge cases, docs (Gold).** Polish; ordering among these is flexible.

**Cross-package / design items to surface, not decide unilaterally:**

- A filter-**chain** descriptor type (`BitmapFilterChain`?) belongs in `@flighthq/types` and is shared by all backends — propose it as a header-layer addition consumed identically by `filters-canvas`, `filters-gl`, `filters-surface`, before implementing `applyCanvasFilterChain`.
- The CSS-fast-path-vs-pixel-path policy should be consistent with how `filters-css` advertises what it can express (`computeXFilterCss` returning `null`); keep the `null`/`false` seam aligned across `filters-css` and `filters-canvas`.
- Whether a `@flighthq/filters-presets` neighbor is warranted is a family-wide decision (it would serve GL/surface too), not a Canvas-only one.
- Reaffirm the Rust exclusion of `filters-canvas` when finalizing Gold; if a `host-web` Canvas2D path is ever wanted in the port, that is a `host-web` JS concern, not a new crate.

Overall effort: Bronze is roughly 1–2 days (bridge + 3 filters); Silver is the bulk of the work (~1 week for full coverage + scratch/quality + consistency tests); Gold is incremental hardening with the chain type being the only item that requires upstream `@flighthq/types` coordination.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/filters-canvas` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
