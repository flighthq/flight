# Maturation Roadmap: @flighthq/filters-surface

**Current verdict:** solid — 78/100; a near-complete CPU backend binding (all 14 filter descriptors have a 1:1 surface adapter), but with one fidelity gap (inner-shadow offset), a dangling `getShadowFilterOffset` reference, and no compositing/dispatch tier — while the sibling `filters-gl` backend already handles `knockout`/compositing internally, leaving this backend inconsistent.

This package is a `<subject>-<backend>` binding layer, not a standalone image library: the kernels live in `@flighthq/surface` and the parameter contracts in `@flighthq/filters`. The tiers below scope to that remit — completing the CPU realization of the filter domain and bringing it to backend-consistent compositing parity — and deliberately do **not** pull new primitives (emboss/Sobel/etc.) into this layer, since those are `@flighthq/filters` descriptor decisions.

## Bronze

The minimum to make every adapter correct and to stop the package from lying in its own doc comments. All within this package plus one small `@flighthq/filters` helper.

- **Fix inner-shadow fidelity.** Make `applyInnerShadowFilterToSurface` honor `angle`/`distance` (offset the shadow inside the boundary), matching the OpenFL `InnerShadowFilter` contract. Today the comment admits it is centered-only — this is the one concrete correctness defect in the package's own remit. Add the colocated aliasing/offset test cases (distinct vs. offset shadow).
- **Land `getShadowFilterOffset` for real.** Five doc comments (`applyDropShadowFilterToSurface`, etc.) reference `getShadowFilterOffset` but it exists nowhere. Define it in `@flighthq/filters` (`getShadowFilterOffset(filter, out: Vector2)` deriving `dx/dy` from `angle`+`distance`) — shared math used by every backend, not re-derived per call site — and update the comments to a real, importable symbol.
- **Document the alias contract uniformly.** Every adapter doc comment already states which calls may pass `source.surface.data` as `out` and which forbid it; normalize the wording and add a one-line `blurBuffer` size rule constant reference so the "raises the floor for correct use" complaint is at least uniform and greppable.
- **Backfill the missing `out`-aliasing tests.** Per Flight's out-param rule, each adapter that accepts `source.surface.data` as `out` needs an explicit aliased-case test; audit the 14 `.test.ts` files and add the missing aliased assertions.

## Silver

Competitive and solid: the package stops pushing compositing back to every call site, reaches behavioral consistency with the GL/CSS backends, and gains the buffer-management ergonomics a professional CPU filter pipeline needs.

- **`compositeFilterResultToSurface(out, mask, source, filter)`** — the `knockout`/`hideObject`-aware finisher. Resolves the repeated "composite `out`, then the original on top; omit if knockout/hideObject" prose into one function so inner-vs-outer ordering is implemented once. This closes the consistency gap: `filters-gl` already short-circuits on `filter.knockout` internally, so the surface backend is currently the odd one out.
- **`applyFilterListToSurface(out, scratch, source, filters: readonly BitmapFilter[])`** — ordered dispatch over a heterogeneous descriptor array, switching on the `kind` discriminant, managing intermediate buffers and per-filter offsets. Requires the kind-dispatch decision (see Sequencing). This is the move from "every filter has a kernel call" to "the filter domain is realized on the CPU backend."
- **Scratch-buffer helper: `createFilterSurfaceScratch(width, height)` / `acquireFilterSurfaceScratch` + `releaseFilterSurfaceScratch`** — an explicit-allocation pool for the `blurBuffer`/intermediate buffers that `applyFilterListToSurface` and multi-pass filters need. Honors the `acquire*`/`release*` bracket rule; keeps allocation explicit but stops every caller from hand-sizing buffers.
- **`getFilterSurfaceBounds(filter, sourceBounds, out: Rectangle)`** — the per-filter bounds expansion (blur/shadow grow the dirty rect; convolution/displacement may too). Needed so `applyFilterListToSurface` can size `out`/scratch correctly and so callers can allocate the grown destination. Pairs with `getShadowFilterOffset` from Bronze.
- **Cross-backend consistency tests** — add functional/parity coverage (`tests/functional`) asserting the surface result matches the CSS/Canvas raster path for blur, drop-shadow (with offset), and a knockout case, per the SDK's backend-parity rule.

## Gold

Authoritative / AAA: exhaustive correctness, performance, and full Rust-port conformance — nothing a domain expert finds missing in the CPU filter backend.

- **Quality/edge-mode exhaustiveness.** Honor every descriptor field across all 14 adapters at all `quality` levels: edge handling (clamp/wrap/transparent) consistent across blur, convolution, and displacement; `preserveAlpha`/`divisor`/`bias` convolution edge cases; gradient-ramp interpolation matching the GL ramp bit-for-bit; bevel `full → both` mapping verified against OpenFL reference output.
- **Performance pass.** Separable-kernel fast paths, typed-array stride-aware loops, optional SIMD-friendly inner loops, and a documented box-vs-Gaussian cost tradeoff. Add a `tools/size`/bench harness entry; the CPU backend is the fallback path that must stay viable on large surfaces.
- **Region-correct partial application.** Verify and test that every adapter respects a sub-`SurfaceRegion` (non-full-surface stride/offset) for `out`, `source`, `blurBuffer`, and displacement `map` — the alias rules currently distinguish "full-surface region" specially; Gold makes sub-region application a first-class, tested path.
- **Full error/sentinel discipline.** Return sentinels for expected failures (mismatched `map` dimensions in displacement, zero-size region, degenerate convolution kernel) and reserve throws for genuine misuse; assert each in tests.
- **1:1 Rust-port conformance.** `flighthq-filters-surface` already exists as a crate. Mirror every TS addition here (`apply_inner_shadow_filter_to_surface` offset fix, `composite_filter_result_to_surface`, `apply_filter_list_to_surface`, `get_filter_surface_bounds`, scratch pool) and record any intentional divergence in the conformance map. Drive the parity differ over the `rust:skia`/surface cells for the full filter set so the CPU backend is a conformance reference, not just present.
- **Complete docs.** A package-level overview documenting the descriptor→kernel mapping table, the mask-vs-composited contract, the scratch/bounds helpers, and the alias matrix — replacing the per-function repetition.

## Sequencing & effort

Recommended order, smallest-correctness-first:

1. **Bronze, low effort, no cross-package design.** Inner-shadow offset fix + `getShadowFilterOffset` in `@flighthq/filters` + test backfill. The offset helper is a prerequisite for Silver's bounds/list work, so do it first. (~1 session.)
2. **Silver compositing tier (`compositeFilterResultToSurface`) — medium effort.** Self-contained in this package; the highest-value single addition because it removes the doc-comment repetition and aligns the backend with `filters-gl`'s existing internal knockout handling.
3. **Silver bounds + scratch helpers — medium effort.** `getFilterSurfaceBounds` and the scratch pool, then the cross-backend parity tests. These unblock the list dispatch.
4. **Silver `applyFilterListToSurface` — medium effort, gated on one design decision (below).**
5. **Gold — large, ongoing.** Performance, exhaustive edge modes, region-correctness, and Rust conformance run last and continuously.

**Cross-package / design-decision items to surface (do not decide unilaterally):**

- **Where does filter-list dispatch live?** `applyFilterListToSurface` switches on `BitmapFilter.kind`. Today `kind` discriminants are inline string literals on each filter interface (`'DropShadowFilter'`, `'BlurFilter'`, …) with **no exported `*FilterKind` constants** and no central union. A per-backend dispatch needs either (a) exported `*FilterKind` string consts in `@flighthq/types`/`@flighthq/filters` (preferred, matches the `*Kind` identifier rule), or (b) a registry. Also decide whether the canonical list-dispatch belongs in each backend or in a single coordinating package that calls into the backends — a genuine cross-package boundary call. Surface this before building step 4.
- **`getShadowFilterOffset` ownership.** Proposed in `@flighthq/filters` (shared by every backend). Confirm that home vs. `@flighthq/types`.
- **Backend-consistency contract.** Decide whether all raster backends should return composited results (GL-style) or masks (current surface-style). Picking one is what makes `compositeFilterResultToSurface` either the public contract or an internal helper; it affects `filters-gl`/`filters-css`/`filters-canvas` symmetry, so it is an SDK-wide filter-backend decision, not a `filters-surface`-local one.
- **New named convolution effects (emboss/Sobel/Laplacian/outline)** remain out of scope here — they are `@flighthq/filters` descriptor additions and should be raised against that package, not this binding layer.
