# Maturation Roadmap: @flighthq/filters-gl

**Current verdict:** solid — 84/100. A genuinely deep, idiomatic WebGL 2 backend with full 1:1 coverage of the `@flighthq/filters` descriptor set; falls short of authoritative only on a few real omissions (`knockout` on drop shadow, untyped kernel caps, no scratch-sizing helpers, no in-package conformance back-reference).

The package is a set of leaf shaders, deliberately not a turnkey chain applier (that orchestration is a `render-gl` concern, kept out to preserve tree-shaking). The three tiers below respect that boundary: they make each leaf shader complete and self-describing, then make the family consistent and verifiable, then make it the canonical reference — without folding a `switch(kind)` dispatcher into this package.

## Bronze

The minimum to remove the known descriptor-coverage holes and let a caller allocate scratch without reading shader source. Small, high-leverage, no new package.

- **`applyDropShadowFilterToGl` knockout support** — implement the `knockout` branch instead of the current `if (filter.knockout) return;` early-out. Bevel and the glows already honor knockout via the invert-tint mask; reuse `applyGlInvertTintPass` so drop shadow composites shadow-only against an inverted source alpha. This is the single most glaring inconsistency: a real descriptor field is a silent no-op.
- **`applyInnerShadowFilterToGl` / `applyInnerGlowFilterToGl` knockout audit** — confirm both honor `knockout` and `hideObject`/`hideOuter` symmetrically with the outer variants; fix any that early-return. (The Rust crate already carries `apply_gl_inner_clip_pass`; mirror that primitive into TS as `applyGlInnerClipPass` if the inner effects need it for clean knockout.)
- **Scratch-count helpers** — one tiny exported pure function per multi-target filter so callers stop guessing array lengths and hard-coding `3`: `getDropShadowFilterGlScratchCount()`, `getBevelFilterGlScratchCount()`, `getGradientBevelFilterGlScratchCount()`, `getGradientGlowFilterGlScratchCount()`, `getInnerGlowFilterGlScratchCount()`, `getInnerShadowFilterGlScratchCount()`, `getOuterGlowFilterGlScratchCount()`, `getSharpenFilterGlScratchCount()`. Free functions returning a `number`; no allocation. This is the typed contract the depth review asked for in place of prose.
- **Typed kernel-limit constants** — export `GL_CONVOLUTION_MAX_KERNEL_SIZE` (7) and `GL_MEDIAN_MAX_RADIUS` (2) from the package root so the caps the shaders enforce are queryable, not doc-only. Pair each with sentinel behavior: when a descriptor exceeds the cap, `applyConvolutionFilterToGl` / `applyMedianFilterToGl` should clamp-and-continue (current behavior) but the limit must be readable up front.
- **Add `@flighthq/filters-gl` to the Package Map** — it has no entry in `tools/agents/docs/index.md`; record that it is the GPU leaf-shader set (not a chain applier) so the orchestration boundary is documented where the depth review noted it should be.

## Silver

Competitive with a well-regarded GPU image-filter library: descriptor signatures uniform across the family, larger kernels handled honestly, and cross-backend consistency made explicit rather than implied.

- **Blur signature alignment** — add descriptor-in wrappers `applyBlurFilterToGl(state, source, dest, temp, Readonly<Omit<BlurFilter,'kind'>>)` that dispatch box-vs-gaussian on the descriptor's quality/type field, so blur mirrors the `Readonly<Omit<XFilter,'kind'>>` shape the other 13 use. Keep `applyBoxBlurFilterToGl` / `applyGaussianBlurFilterToGl` as the primitives the glows/shadows call with synthesized parameters.
- **Larger convolution via separability detection** — in `@flighthq/filters`, add `isConvolutionMatrixSeparable(matrix, w, h, out?)` (rank-1 factorization into row × column vectors). In `filters-gl`, when a >7×7 kernel factors, run it as two separable 1-D passes (each up to a higher 1-D cap) instead of clamping. Non-separable large kernels still delegate to surface, but the common case (Gaussian-like, edge, emboss) gains arbitrary size on the GPU.
- **Median up to radius ~4** — raise `GL_MEDIAN_MAX_RADIUS` by replacing the full network sort with a histogram/partial-selection approach in the shader (median only needs the middle element, not a full sort), keeping it real-time. If WebGL 2 instruction limits bite, expose the new cap as a typed constant and keep clamp-and-continue.
- **In-package conformance assertion harness** — add a colocated `glConformance.test.ts` that, for a fixed input target, renders each filter and compares the readback against `@flighthq/filters-surface` (already a devDependency via `@flighthq/surface`) within a tolerance. This puts a cross-backend fidelity check inside the package, not only in `tests/functional/*-parity`, so the package alone demonstrates correctness.
- **Premultiply/straight-alpha discipline checks** — assert the premultiplied invariants (no color bleed at alpha edges) per filter in tests; the shaders are correct today but an authoritative library proves it.
- **Filter-program cache eviction** — port the Rust crate's `clear_gl_filter_program_cache` as `clearGlFilterProgramCache(state)` so a render state's cached programs/uniform locations can be released on context loss or state teardown. Today the `WeakMap` caches only drop with the state; an explicit `destroy*`/clear seam is needed for deterministic GPU-resource release (the SDK's `destroy*` verb).
- **Floating-point target precision option** — where banding shows on color-matrix/convolution chains, document and (where the target format allows) prefer `RGBA16F` scratch targets via `render-gl`, so multi-pass chains do not quantize at 8-bit between passes. Surface this as a render-target choice, not a filter flag.

## Gold

The canonical GPU image-filter reference: nothing a domain expert finds missing, full edge/error handling, performance, and locked 1:1 Rust parity.

- **Verified 1:1 Rust parity** — `crates/flighthq-filters-gl` already exists and is at or ahead of the TS surface (it carries `apply_gl_inner_clip_pass`, `clear_gl_filter_program_cache`, and an explicit program registry). Gold means: every TS export added in Bronze/Silver (knockout drop shadow, scratch-count helpers, typed caps, blur wrapper, separability, median radius bump) is mirrored in the crate, names map by the snake*case rule, and any intentional divergence is recorded in the [conformance map](../../rust/conformance.md). The crate's extra functions (`get_gl_inner_clip_shader`, the per-shader `get*\*\_shader` accessors) should either be promoted into the TS surface or documented as Rust-internal in the divergence map — the two surfaces must not silently drift.
- **Tiled/large-kernel GPU path** — for genuinely large non-separable kernels (big custom convolutions), a tiled multi-pass accumulator so the GPU path has no hard ceiling that forces a surface fallback; the cap becomes a performance choice, not a capability wall.
- **Performance instrumentation** — optional pass-count / target-allocation reporting (`getFilterGlPassCount(filter)`) so a consumer can budget a chain. Aligns with the SDK's "no hidden work" rule: the cost of a descriptor is queryable before applying it.
- **Exhaustive edge-case coverage in tests** — zero-radius, zero-alpha, NaN-guard on angle/distance, 1×1 targets, non-power-of-two targets, source===dest aliasing rejection (these are `out`-style functions that require distinct targets — assert the contract), and degenerate gradient ramps (single stop, unsorted ratios). Each as a colocated test.
- **WebGL-context-loss resilience** — pair `clearGlFilterProgramCache` with a documented recovery contract: after context loss the next `apply*ToGl` recompiles transparently. Test with a mocked context-lost event.
- **Full doc pass + usage doc** — a package-level reference (in `tools/agents/docs/`, not a stray README) covering the leaf-shader model, the scratch contract per filter (now backed by the helpers), the kernel caps, the surface-fallback boundary, and the orchestration boundary (why no chain applier lives here). The depth review's "explicit note in the package map" graduates to a real domain doc.
- **Optional opt-in chain applier — surfaced as a design decision, not built here** — if the SDK wants a turnkey `applyFiltersToGl(state, BitmapFilter[])`, it belongs in `render-gl` (or a thin `filters-gl-chain` neighbor) with an explicit registry of `kind → apply*ToGl` so leaf shaders stay tree-shakable. Gold for _this_ package is keeping the leaves pure; the chain is a cross-package call (see sequencing).

## Sequencing & effort

Recommended order, with dependencies and the items that need a decision before code.

1. **Bronze, in order (low effort, no cross-package work except the WGSL twins):**
   - Knockout on drop shadow + inner-effect audit — small, reuses existing tint/invert primitives; highest value per line. Mirror the same fix into `@flighthq/filters-wgpu` in the same pass (it has the identical descriptor coverage and likely the same gap), so the GPU backends do not diverge.
   - Scratch-count helpers and typed kernel constants — pure functions/constants, fast, unblock callers immediately. Run `npm run exports:check` (each new export needs a colocated test) and `npm run order:fix`.
   - Package Map entry — documentation only.
2. **Silver, dependency-gated:**
   - Blur wrapper signature — local; do after Bronze so the new `applyBlurFilterToGl` can be tested alongside the aligned family.
   - `isConvolutionMatrixSeparable` must land in **`@flighthq/filters`** first (shared math, header-layer), then `filters-gl` (and `filters-wgpu`, and the surface backend) consume it. This is the one item that touches a sibling package — surface it as a cross-package change before starting.
   - Median radius bump and FP16 precision are self-contained but need WebGL 2 instruction-limit validation on real hardware (jsdom mocks won't catch it) — pair with a `tools/functional` parity run.
   - In-package conformance harness depends on `@flighthq/filters-surface` as the reference; confirm it stays a devDependency only (must not become a runtime dep, would break `sideEffects: false` size budget). Verify with `npm run size`.
   - `clearGlFilterProgramCache` is a `render-gl` cache-shape question: decide whether the program cache key/eviction lives here (WeakMap, today) or moves into `render-gl`'s state lifecycle. **Design decision to surface.**
3. **Gold, mostly verification + a decision:**
   - Rust parity is a checklist against an already-strong crate; the work is reconciling the crate's extra functions with the TS surface and updating the divergence map — coordinate with a Rust-port session.
   - The opt-in chain applier is **a cross-package design decision for the user**: it must not land in `filters-gl` (tree-shaking), so it is `render-gl`/neighbor scope. Do not act autonomously — raise it.

**Cross-package / decision items to surface up front:**

- Separability helper belongs in `@flighthq/filters` (shared), consumed by all three GPU/surface backends — a multi-package change.
- Whether the program cache and its `clear*` seam live in `filters-gl` or `render-gl`'s state teardown.
- The chain applier (`applyFiltersToGl`) is out of scope for this package by the tree-shaking rule; its home (`render-gl` vs a `-chain` neighbor) and its kind-registry shape are a user decision.
- Keep `filters-gl` and `filters-wgpu` lockstep: every Bronze/Silver descriptor fix should apply to both so the two GPU backends never diverge in coverage.
