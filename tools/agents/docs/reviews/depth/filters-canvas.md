# Depth Review: @flighthq/filters-canvas

**Domain:** Canvas 2D backend for the SDK's bitmap-filter family — the per-backend functions that take a filter data descriptor (from `@flighthq/filters`) and realize it onto a `CanvasRenderingContext2D`. This is one of four backend cells (`filters-css`, `filters-canvas`, `filters-surface`/CPU, `filters-gl`/WebGL) that together render the canonical filter set.

**Verdict:** stub — completeness 20/100

The package exports exactly three functions, each a ~6-line wrapper that delegates to `@flighthq/filters-css` and falls back to `false` when no CSS equivalent exists. It covers 3 of the ~14 filters in the canonical family, and only the subset that the browser's native `ctx.filter` string already supports.

## Present capabilities

- `applyBlurFilterToCanvas(dest, source, dx, dy, filter)` — sets `dest.filter = computeBlurFilterCss(filter)` and `drawImage`s. Returns `false` for anisotropic blur (`blurX !== blurY`), which CSS `blur()` cannot express.
- `applyDropShadowFilterToCanvas(...)` — same shape, via `computeDropShadowFilterCss`. Returns `false` for knockout / anisotropic blur.
- `applyOuterGlowFilterToCanvas(...)` — same shape, via `computeOuterGlowFilterCss`. Returns `false` for knockout / anisotropic blur.

All three correctly `save()`/`restore()` around the filter assignment, take an explicit `(dx, dy)` draw position, and return a `boolean` success sentinel rather than throwing — consistent with the project's sentinel-over-throw and explicit-allocation rules. Each has a colocated test. The boolean contract (false = "this backend cannot render this filter, fall back") is a reasonable seam.

## Gaps vs an authoritative Canvas-2D filter library

The canonical filter set, fixed by `@flighthq/filters` and mirrored fully by both `filters-surface` (CPU) and `filters-gl` (WebGL), is roughly 14 filters: bevel, blur, colorMatrix, convolution, displacementMap, dropShadow, gradientBevel, gradientGlow, innerGlow, innerShadow, median, outerGlow, pixelate, sharpen. `filters-canvas` implements **3 of 14**, and even those only in their CSS-expressible subset.

Missing entirely (each is present in the surface and GL backends, so missing-by-omission, not by-design):

- **colorMatrix** — the single most-used filter (tint, grayscale, saturation, hue). Canvas 2D can do this well via `getImageData`/`putImageData` pixel math; its absence is the most glaring gap.
- **convolution** — general NxN kernel (emboss, edge-detect, custom).
- **sharpen**, **median**, **pixelate** — all straightforward `getImageData` passes.
- **bevel**, **gradientBevel**, **gradientGlow** — compositable from blur + offset + gradient ramp.
- **innerGlow**, **innerShadow** — inner variants of the glow/shadow it already partially covers.
- **displacementMap** — per-pixel remap; doable on the Canvas pixel buffer.

Coverage gaps within the 3 implemented filters:

- **Anisotropic blur** (`blurX !== blurY`) returns `false` everywhere — there is no Canvas fallback that does two passes or an `ImageData` box blur, so any non-uniform blur silently no-ops on this backend.
- **Knockout** and **inner** modes of the shadow/glow filters return `false`.
- No `quality`/multi-pass handling — whatever CSS does is all you get.

The deeper issue: this package is not really a "Canvas 2D filter implementation." It is a thin re-projection of `filters-css` through `ctx.filter`. A robust Canvas-2D backend would own a pixel-level path (`getImageData` → typed-array math → `putImageData`, plus composite-based offset/blur tricks) so it can render the filters CSS cannot express — which is exactly what `filters-surface` already does. As written, `filters-canvas` adds almost nothing over calling `filters-css` directly and assigning `ctx.filter` at the callsite.

## Naming / API-shape notes

- Names follow the backend-prefix-on-the-function convention (`applyBlurFilterToCanvas`) and include the full unabbreviated filter-type word — good and grep-friendly.
- The `(dest, source, dx, dy, filter)` signature is uniform across all three and reads cleanly; `dest` first, explicit position, descriptor last.
- `boolean` return as a fall-back sentinel is the right shape, but it pushes the "what do I do on false" burden onto every caller. With 11 filters always returning false (because unimplemented) and the 3 implemented ones returning false on common cases (anisotropy/knockout), callers must carry a full secondary backend anyway — which weakens the value of having this package at all.
- `package.json` description "Canvas 2D implementations for bitmap filter effects" overstates scope; it is currently a CSS-filter-string adapter, not a Canvas-2D implementation.

## Recommendation

Treat this as an early stub and build it out to match its sibling backends. Concretely:

1. Add a pixel-buffer path (`getImageData`/`putImageData`) so the package can implement filters CSS cannot express, rather than only delegating to `filters-css`.
2. Port the missing 11 filters — prioritize **colorMatrix** and **convolution** (highest use, simplest on a pixel buffer), then sharpen/median/pixelate, then the bevel/gradient/inner family.
3. Close the within-filter gaps: anisotropic blur (two-pass or box-blur fallback), knockout, and inner modes, so the three existing functions stop returning `false` on ordinary inputs.
4. Reuse `filters-surface`'s CPU kernels where possible (the math is identical; only the buffer source/sink differs) to avoid divergent implementations across the two CPU-ish backends.

Until then, the package does not stand alone as an authoritative Canvas-2D filter library; it is a 3-function CSS shim. Note that the surrounding family (`filters`, `filters-surface`, `filters-gl`) is mature — the gap here is specifically this backend cell, and it is missing-by-omission, not by-design.
