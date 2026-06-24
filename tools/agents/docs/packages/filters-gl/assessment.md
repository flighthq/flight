---
package: '@flighthq/filters-gl'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/filters-gl

The review (`solid`/90) absorbs and supersedes the prior depth roadmap (`reviews/maturation/depth/filters-gl.md`, `solid`/84). The package's Bronze tier and most of Silver have already landed (knockout, scratch-count family, typed kernel caps, shared inner-clip shader, blur descriptor wrapper, `clearGlFilterProgramCache` eviction seam, Package Map entry). What remains is one doc-honesty fix, one small symmetry helper, and a set of design/cross-package items routed to the charter's Open directions. The charter is still a seed-stub, so several items below are parked on a North-star/Boundary decision rather than recommendable.

Once consumed, the prior roadmap `reviews/maturation/depth/filters-gl.md` is absorbed and can be removed (one-time seed).

## Recommended

Sweep-safe: within `@flighthq/filters-gl`, no cross-package code coupling, no breaking change, no open design decision. Safe under a blanket "do all recommended."

- **Correct the `clearGlFilterProgramCache` documentation to match its actual behavior.** The body only calls `cache.delete(state)` per cache, releasing each cached `WebGLProgram` _to GC_ — it never calls `gl.deleteProgram`. The Package Map line (`tools/agents/docs/index.md`) and the source doc-comment both describe it as "deterministic GPU-resource release," which overstates it. Reword both to "releases cached programs to GC" so the doc stops promising determinism the code does not provide. This is documentation-honesty only; it makes the prose true without changing behavior, naming, or signatures. (The deeper question — whether the function _should_ deterministically `gl.deleteProgram` and become a `destroy*` — is a design fork; see Open directions #1, routed to the charter, not here.) — review.md#gaps-vs-an-authoritative-gpu-image-filter-backend, review.md#contract--docs-fit
- **Add `getBlurFilterGlScratchCount`.** `applyBlurFilterToGl` is the one applier with no matching scratch-count helper, so the family is one short of complete. Blur uses a single `temp` target rather than a `scratch[]`, so the helper returns the count for that single-temp shape (with a doc-comment noting the shape mismatch). Pure exported function returning a `number`, no allocation, colocated test — identical in kind to the 13 helpers already shipped. (Whether "every applier has a scratch-count helper" is a _blessed invariant_ vs. incidental is the charter's call — Open directions #2 — but adding the helper itself is strictly additive and harmless either way, so it is recommendable now.) Run `npm run exports:check` and `npm run order:fix` after. — review.md#gaps-vs-an-authoritative-gpu-image-filter-backend
- **Note the blur scratch-count exception in the status framing.** The status doc's "every `apply*FilterToGl` has a matching `get*FilterGlScratchCount`" claim is not literally true until the helper above lands; if the helper is added, the claim becomes accurate and no further edit is needed. If for any reason the helper is deferred, record the blur exception explicitly. — review.md#contract--docs-fit

## Backlog

Parked: cross-package coordination, a larger scope, or waiting on an Open direction the charter must settle. Not eligible for blanket approval.

- **`clearGlFilterProgramCache` → true deterministic `destroy*`.** Iterating the cached programs and calling `gl.deleteProgram` each (the path `render-gl` already uses elsewhere) would make release genuinely deterministic and arguably rename it to a `destroy*` verb. **Parked:** this is a North-star decision about whether `filters-gl` owns deterministic teardown of the programs it compiles, plus a possible breaking rename. Routed to charter Open directions #1. — review.md#candidate-open-directions
- **Larger convolution via separability detection.** Run factorable >7×7 kernels as two separable 1-D passes instead of clamping. **Parked — cross-package:** the `isConvolutionMatrixSeparable(matrix, w, h, out?)` helper must land in `@flighthq/filters` (shared header-layer math) first, then be consumed by `filters-gl`, `filters-wgpu`, and the surface backend together. Also needs real-hardware WebGL 2 instruction-limit validation (jsdom mocks won't catch it). — review.md#gaps, depth-roadmap#silver
- **Median radius bump (≥4) via histogram/partial-selection.** Replace the full network sort with a partial-selection shader so `GL_MEDIAN_MAX_RADIUS` can rise. **Parked:** depends on real-hardware instruction-limit validation via a `tools/functional` parity run; the current radius-2 cap is typed and honest in the meantime. Whether 7×7 / radius-2 is the permanent GPU ceiling is charter Open directions #4. — depth-roadmap#silver
- **Tiled/large-kernel GPU path.** A tiled multi-pass accumulator so genuinely large non-separable kernels have no hard ceiling. **Parked:** Gold-tier, gated behind the separability work above and a performance/capability-wall decision. — depth-roadmap#gold
- **In-package conformance/parity harness.** A colocated readback comparison against `@flighthq/filters-surface` cannot run here — jsdom's mock WebGL cannot read pixels back. **Parked — structural:** cross-backend fidelity lives in `tests/functional/filter-*-parity` (not yet written). Where the conformance harness lives is charter Open directions #3. — review.md#gaps
- **FP16 (`RGBA16F`) scratch-target precision option.** Prefer floating-point scratch targets where multi-pass chains band at 8-bit. **Parked:** this is a `render-gl` render-target choice, not a filter flag, so it is a cross-package surface decision. — depth-roadmap#silver
- **Performance instrumentation (`getFilterGlPassCount`).** Queryable pass/target counts so a consumer can budget a chain. **Parked:** Gold polish, lower leverage; revisit after the family's correctness items settle. — depth-roadmap#gold
- **Verified 1:1 Rust parity for the new surface.** Mirror every recently-added TS export (knockout, scratch-count family incl. the new blur helper, typed caps, blur wrapper, `clearGlFilterProgramCache`) into `crates/flighthq-filters-gl`, and reconcile the crate's extra functions (`get_gl_inner_clip_pass`, per-shader `get*_shader` accessors) with the TS surface or record them in the divergence map. **Parked — cross-worktree:** requires a Rust-port session and a conformance-map update. — review.md#contract--docs-fit, depth-roadmap#gold
- **Keep `filters-gl` / `filters-wgpu` lockstep.** Every coverage fix should apply to both GPU backends so they never diverge. **Parked:** whether the two are contractually feature-paired or allowed to diverge is charter Open directions #5; it is also a cross-package coordination concern. — review.md#candidate-open-directions
- **Opt-in chain applier (`applyFiltersToGl`).** A turnkey `kind → apply*ToGl` dispatcher. **Parked — out of scope by design:** a `switch(kind)` here would retain every shader and break tree-shaking (the bundle invariant). If wanted, it belongs in `render-gl` or a thin `filters-gl-chain` neighbor with an explicit registry (fork B, registry-by-default). A cross-package design decision for the user. — review.md#gaps, depth-roadmap#gold

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._

## Notes for the charter (Open directions — do not edit the charter here)

Surfaced for the user to settle; these are design forks or cross-package items, not Recommended:

1. **`clearGlFilterProgramCache` semantics — dispose vs destroy.** Release cached programs to GC (current behavior; redoc/rename as a `dispose`-style clear) or deterministically `gl.deleteProgram` each (a true `destroy*`)? A North-star question about whether this package owns deterministic teardown.
2. **Scratch-helper completeness as a blessed invariant.** Is "every applier has a `get*FilterGlScratchCount`" a contract (then the blur helper is required, with its single-`temp` shape acknowledged) or incidental?
3. **Where the conformance harness lives.** State that cross-backend pixel parity is owned by `tests/functional/filter-*-parity` and is a gating requirement, so the in-package absence is intentional.
4. **Kernel-cap ceiling.** Is 7×7 / radius-2 the permanent GPU ceiling (larger kernels delegated to surface/CPU), or a placeholder pending the separability helper and hardware validation?
5. **Boundary with `filters-wgpu`.** Are the two GPU backends contractually kept in feature-parity (knockout, scratch family, typed caps, shared inner-clip), or allowed to diverge?
6. **Color-space stance.** All passes are fixed sRGB-passthrough premultiplied (per the SDK color decision). Worth recording as a Boundary so a future agent does not "add" a linear-light option.
