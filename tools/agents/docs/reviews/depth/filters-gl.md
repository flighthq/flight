# Depth Review: @flighthq/filters-gl

**Domain:** WebGL 2 shader backend for the SDK's bitmap-filter effects — the GPU implementation layer that turns the plain `@flighthq/filters` data descriptors (blur, glow, bevel, drop shadow, color matrix, convolution, displacement, etc.) into multi-pass fragment-shader render passes over `GlRenderTarget`s.

**Verdict:** solid — **84/100**

This is the GPU half of a split filter design: `@flighthq/filters` owns the descriptor data and shared math (`computeBoxBlurPassRadius`), and `filters-gl` owns the WebGL realization. Judged as "an authoritative GPU image-filter backend," it is genuinely deep: it covers the entire descriptor set its sibling defines, the shader code is correct and idiomatic (separable blurs, premultiplied-alpha discipline, ping-pong scratch, per-state program caching), and the public seam is consistent. It falls short of "authoritative" only on a few real omissions (`knockout` on drop shadow, bounded convolution/median radii) and the absence of any conformance back-reference in the package itself.

## Present capabilities

Full 1:1 coverage of the `@flighthq/filters` descriptor set — every `create*Filter` in the sibling has a matching `apply*FilterToGl`:

- **Blur** — both `applyBoxBlurFilterToGl` (multi-pass box, converging on Gaussian via `computeBoxBlurPassRadius`) and `applyGaussianBlurFilterToGl` (faithful single-pass weighted Gaussian, radius ⌈3σ⌉, sigma matched to the CSS/surface paths). Separable two-axis passes, zero-radius short-circuit, tail blit when nothing was written.
- **Drop shadow / inner shadow / outer glow / inner glow** — composited from the tint + blur + offset-blit primitives; correct premultiplied `ONE / ONE_MINUS_SRC_ALPHA` blending; inner effects built on an inverted-alpha tint mask.
- **Bevel / gradient bevel / gradient glow** — gradient-ramp-texture driven (`createGlGradientRampTexture` builds a 256px 1-D ramp from colors/alphas/ratios with `CLAMP_TO_EDGE`); directional light vector from angle/distance.
- **Color matrix** — full 4×5 matrix + offsets, straight-RGBA in / premultiplied out, per-channel clamp.
- **Convolution** — arbitrary matrix up to 7×7, with `clamp` vs `edgeColor` edge handling and `preserveAlpha`.
- **Displacement map** — all four edge modes (`wrap`/`clamp`/`ignore`/`color`) via a `MODE_MAP`, second-texture sampling.
- **Median** (denoise, radius 0–2 / up to 5×5), **sharpen** (unsharp mask), **pixelate** (block quantize with clamp).
- **Shared shader infrastructure** — `glBlitShader` (plain + offset blit passes), `glTintShader` (tint + invert-tint mask passes used by all glow/shadow effects), and the gradient-ramp helper. These are the reusable primitives the higher-order filters compose from.

Engineering quality is high and consistent across files: `#version 300 es` shaders, `WeakMap<GlRenderState, …>` program/uniform-location caching keyed per render state (no module-top-level GL state — honors `sideEffects: false`), caller-provided scratch arrays so the filters allocate nothing themselves, and thorough doc comments that state coordinate space, blending mode, and ownership. Out-parameter / explicit-target discipline matches the codebase rules. Every source file has a colocated `*.test.ts`.

## Gaps vs an authoritative GPU image-filter library

- **`knockout` is a no-op on drop shadow** — `applyDropShadowFilterToGl` early-returns when `filter.knockout` is set (documented "not yet supported by the Gl path"). The field exists on the `DropShadowFilter` type; bevel and the glows do honor knockout, so this is an inconsistency, not a design exclusion. Missing-by-omission.
- **Bounded kernels for convolution and median** — convolution caps at 7×7 and median at 5×5 (radius ≤2), deferring larger kernels to the surface (CPU) backend. Reasonable for a real-time GPU path, but an authoritative library would either support larger separable/tiled kernels or expose the cap as a typed limit rather than a doc note. Partly by-design.
- **No filter-chain / kind dispatcher.** There is no `applyFiltersToGl(state, BitmapFilter[])` that reads `filter.kind` and routes to the right `apply*ToGl`, and no scratch-target pool/sizing helper. Callers (examples, functional tests) wire each `apply*ToGl` and its scratch targets by hand. This is defensible under the tree-shaking rule (a `switch(kind)` dispatcher would retain every filter), but it means the package is a set of leaf shaders, not a turnkey "apply this descriptor list" library — a consumer must own orchestration and scratch allocation. Worth an explicit note in the package map either way.
- **No gamma / linear-light option** and no premultiplied-vs-straight toggle — all passes are fixed sRGB-passthrough premultiplied. Consistent with the SDK's stated sRGB-passthrough color decision, so missing-by-design, not a defect.
- **No conformance/parity assertions in-package** — correctness against the canvas/surface backends lives in `tests/functional/*-parity`, not here. Fine architecturally, but the package alone does not demonstrate cross-backend fidelity.

## Naming / API-shape notes

- Naming is excellent and globally self-identifying: `apply<Filter>FilterToGl`, `getGl<Shader>Shader`, `createGlGradientRampTexture`. The `…ToGl` suffix cleanly distinguishes the backend from canvas/surface siblings, matching the memory note on backend-prefix-first filenames (`glBlurFilter.ts`).
- Filter signatures take `Readonly<Omit<XFilter, 'kind'>>`, correctly dropping the dispatch tag the caller already resolved — clean and consistent.
- Blur is the one shape outlier: it takes an inline `Readonly<{ blurX?, blurY?, passes? }>` options object instead of a `Readonly<Omit<BlurFilter,'kind'>>`, because glows/shadows call it as a primitive with synthesized parameters. Justified, but it means `applyBoxBlurFilterToGl` / `applyGaussianBlurFilterToGl` do not mirror the descriptor-in signature the other 13 use.
- Scratch contracts vary by filter (single `temp`, three-element `scratch[]`, or `map` + `scratch`) and are documented only in prose. An authoritative library would expose a typed scratch-requirement helper (e.g. a `get*ScratchCount`) so callers do not guess array lengths.

## Recommendation

Keep the design; it is a strong, deep GPU backend that earns "solid." To reach authoritative:

1. Implement `knockout` on `applyDropShadowFilterToGl` (it already exists in bevel/glow) so descriptor support is uniform.
2. Surface the convolution (7×7) and median (radius 2) caps as typed/queryable limits rather than doc-only, and decide whether larger kernels belong here or are explicitly delegated to surface.
3. Add small scratch-sizing helpers (or a documented constant per filter) so callers allocate the right number of ping-pong targets without reading source.
4. Consider — outside this package, in render-gl — an opt-in kind dispatcher for a `BitmapFilter[]` chain so the descriptor list is actually applicable end-to-end without per-filter wiring, keeping the leaf shaders tree-shakable.

These are finishing touches on an otherwise mature implementation, not structural gaps.
