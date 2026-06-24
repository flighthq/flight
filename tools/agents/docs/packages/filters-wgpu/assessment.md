---
package: '@flighthq/filters-wgpu'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/filters-wgpu

The review verdict is **solid — 90/100**: a faithful, full-coverage WGSL executor of the canonical `@flighthq/filters` descriptor set, one-for-one with `filters-gl`. This pass already closed the two prior depth gaps (convolution parameter coverage; pipeline-cache / side-effect hygiene) and added device-loss recovery. What remains is **not missing filters** — it is downstream wiring, cross-backend verification, and a handful of open design decisions. By the sweep-safe test, almost nothing here is a within-package, non-design, non-breaking change an agent can just do, so `Recommended` is intentionally thin and most of the review's gaps land in `Backlog` or route out to the charter's Open directions.

No prior `reviews/maturation/depth/filters-wgpu.md` roadmap exists (this is a recently-created backend cell), so there is no Bronze/Silver/Gold seed to absorb — the review is the sole input.

## Recommended

_Sweep-safe: within `@flighthq/filters-wgpu`, no cross-package coupling, no breaking change, no open design decision._

- **Document the gradient-ramp / pipeline-cache eviction split at the teardown call site.** `destroyWgpuFilterPipelines` evicts `ALL_WGPU_FILTER_PIPELINE_CACHES` + the dynamic registry but _not_ `rampCaches`; reclaiming ramp textures still needs a separate `destroyWgpuGradientRampTextures` call. Whether that two-call split should be _unified_ is an open design decision (routed below). But regardless of that decision, the current asymmetry is a recovery-completeness footgun, and a comment on `destroyWgpuFilterPipelines` naming the companion call is a pure within-package clarity fix with no API or behavior change — sweep-safe today. (review.md#gaps, Open direction 5)

## Backlog

_Parked: cross-package coordination, larger scope, or waiting on an Open direction._

- **Wire `apply*FilterToWgpu` into a real render path (cross-package).** No renderer consumes these functions — `render-wgpu`/`render` have no filter dispatch, and there is no `applyBitmapFilterToWgpu` anywhere. The package's correctness is unit-asserted only, never exercised end-to-end. This is a **shared filter-backend-family integration gap** (`filters-gl` has the same — no `FilterToGl` consumer in `render-webgl`), so it is coordinated render-side work, not a filters-wgpu defect. Parked on cross-package coordination; the _where does dispatch live_ design question is Open direction 2. (review.md#gaps)

- **Cross-backend pixel-parity gate (cross-package + open decision).** All unit tests are jsdom-mocked "does not throw" / shape assertions — the WGSL never executes, so "matches the surface/GL reference" is asserted by reading shaders, not measured. The status doc names colorMatrix and convolution as the best single-pass parity candidates. A real parity gate depends on the render wiring above (to execute shaders) and on a charter-level decision about whether parity is the acceptance bar (Open direction 3). Parked on both. (review.md#gaps, Open direction 3)

- **Convolution beyond 7×7 (larger scope).** Kernels above `MAX_KERNEL = 49` `throw` and point at the surface path — an acceptable uniform-buffer limit. Lifting it needs a storage-buffer upload or a two-pass decomposition (status lists it Gold / out-of-scope). Parked as a larger design+impl effort, not a sweep. (review.md#gaps)

- **Filter-vocabulary extras across the whole family (cross-package).** levels / curves / threshold / gradient-map adjustment filters are absent. This is a `@flighthq/types` + `@flighthq/filters` scope question — a _new filter type_ starts upstream, not in a backend. Parked as cross-package / upstream-owned. (review.md#gaps, Open direction 1)

- **Scratch-count extensibility — fork B (open design decision).** The `apply*` family is open (no central kind-switch; `index.ts` deliberately refuses a dispatch facade), but `getWgpuFilterScratchCount` re-introduces a closed `switch(filter.kind)`. It is not a hot loop (called once per filter application), so there is no bundle/perf tax — the cost is purely extensibility: a custom filter kind cannot declare its scratch budget. Whether to make it registry-backed / descriptor-property-driven, or keep the closed switch, is a fork-B design fork. Parked on Open direction 4. (review.md#contract-fit, Open direction 4)

- **Package Map doc revision (outside this package).** `tools/agents/docs/index.md` names the filter backends only obliquely; as the `<subject>-<backend>` filter family has become real, a Package Map line enumerating `filters-wgpu` / `filters-gl` / `filters-surface` / `filters-canvas` / `filters-css` would match the shape the work took. Edits a shared doc, not this package — surfaced for the user's gate, not auto-applied. (review.md#contract-fit)

## Approved

_Frozen on the user's verbal approval only. Empty until then._

## Notes for the charter (Open directions — do not edit the charter here)

The charter is a stub (North star / Boundaries / Decisions / Open directions all `TODO`). The review surfaced five questions a reviewer had to assume past; they are design/cross-package forks and belong in the charter's **Open directions**, not in `Recommended`:

1. **Is `filters-wgpu` _only_ an executor?** Confirm as a Boundary that the filter vocabulary is owned by `@flighthq/filters` and a _new filter type_ is out of scope here (it starts in `filters`/`types`).
2. **Where does descriptor→backend dispatch live, and when is it wired?** `index.ts` asserts it belongs in `render-wgpu`, but no renderer wires it. A Decision here resolves the integration gap.
3. **Is a cross-backend pixel-parity gate a charter-level requirement?** Declaring parity as the acceptance bar (and which filters must be pixel-exact vs. tolerance) turns the deferred parity work into a blessed roadmap rather than worker discretion.
4. **Scratch-count extensibility (fork B).** Should custom filter kinds declare a scratch budget (registry-backed / descriptor property), or is the closed switch in `getWgpuFilterScratchCount` acceptable because custom filters drive the pipeline primitives directly?
5. **Device-loss recovery completeness.** Should `destroyWgpuFilterPipelines` also evict the gradient-ramp textures (one teardown for all GPU resources held against a state), or is the two-call split the intended boundary?
