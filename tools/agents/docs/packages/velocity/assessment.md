---
package: '@flighthq/velocity'
updated: 2026-06-24
basedOn: ./review.md
---

# velocity — Assessment

Sorted from `review.md` (score `solid — 82`), absorbing the prior `reviews/maturation/depth/velocity.md` Bronze/Silver/Gold roadmap (now superseded and slated for removal). The charter is a stub — North star, Boundaries, Decisions, and Open directions are all `TODO` — so most of "what good means here" is an open design question. That keeps `Recommended` deliberately small: the genuinely sweep-safe item is the one contract-hygiene type tightening. The package's headline finding — that `contributeAffineVelocity` stores origin velocity, not affine velocity, and so duplicates `contributeTransformVelocity` — is a naming / semantics decision, so it is parked and routed to the charter's Open directions rather than swept. Every remaining roadmap item is cross-package (buffer-write convention, transform-trait hardening, GL/Wgpu adoption, functional scene, Rust parity) or a memory-model / opt-in design decision (iteration, history, acceleration, signals), so all of them are Backlog.

## Recommended

Strictly sweep-safe: within `@flighthq/velocity`, no cross-package coupling, no behavior change, no open design decision.

- **Tighten `getVelocitySampleAt`'s `currentWorldTransform` parameter to `Readonly<Matrix>`.** The parameter is currently an inline structural literal type `Readonly<{ a; b; c; d; tx; ty }>` (`67dc46d64:affineVelocity.ts:35`), a structural-shape leak the types-layout convention discourages — entity-backed `Matrix` is the sanctioned type, and `getNodeWorldTransformMatrix` already returns a real `Matrix`. Replace the inline literal with `Readonly<Matrix>` imported from `@flighthq/types`. Type-only change, no runtime behavior change, no new export, within-package. (If structural input is later judged a deliberate convenience, that is the Open-direction question in #7 below — but the default, contract-aligned fix is `Readonly<Matrix>`.) — review.md (Contract & docs fit, defect 2).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Resolve the `contributeAffineVelocity` name/semantics mismatch** (and the resulting duplicate `visitTransformVelocity` / `visitAffineVelocity` walkers). The contributor's stored `sample.velocity` is origin/translation velocity — numerically identical to `contributeTransformVelocity` — so the "affine" name over-promises and the two private walkers are dead-duplicate. **Parked:** the fix is a semantics decision (make it genuinely store per-pixel/anchor velocity, vs. rename/redescribe it as "retains the transform so `getVelocitySampleAt` is available", vs. merge it into `contributeTransformVelocity`). Not sweep-safe — routed to Open directions. The walker de-duplication follows whichever way that decision lands.

- **Bulk iteration / `forEachVelocity`.** No way to enumerate every source moving this frame. **Parked:** the clean implementation requires moving `samples` off `WeakMap` to a hybrid (live-this- frame list + retain), which changes the GC/ownership story — and the depth review credits the `WeakMap` keying as a strength. A genuine memory-model design decision; routed to Open directions.

- **Buffer-write convention helper** (`createVelocityWriteParams` / a `@flighthq/types` descriptor for the screen→buffer scale + Y-axis convention the GL/Wgpu writers each bake in). **Parked:** only pays off with cross-package adoption by `displayobject-gl`/`-wgpu` and the Rust port; defining it here without adoption is a half-seam. Cross-package — routed to Open directions.

- **Transform-trait hardening** — remove the `child as unknown as Transform2DNode` cast in both contributors via an `isTransform2DNode` guard or a typed child accessor. **Parked:** the cleanest fix lives in `@flighthq/node` (a child accessor that carries the trait), not here; the local guard is an acceptable fallback but the real fix is cross-package. Routed to Open directions.

- **GL/Wgpu velocity-writer adoption of `getVelocitySampleAt`** — the payoff of the affine primitive (correct motion blur at rotating pivots). **Parked:** touches `displayobject-gl`/`displayobject-wgpu` / `effects-*`, not this package. Cross-package suggestion.

- **Multi-frame history** (`enableVelocityHistory(field, frames)`, a `VelocityHistory` ring in `@flighthq/types`) and **acceleration** (`VelocitySample.acceleration` + `contributeAcceleration` / `getAcceleration`). **Parked:** both change the field/sample shape and the allocation model; they must be opt-in to keep the common path allocation-light — a scope/opt-in design decision (Gold). Routed to Open directions.

- **Opt-in velocity-field signals** (`enableVelocityFieldSignals`, a `VelocityFieldSignals` group in `@flighthq/types`). **Parked:** the `enable*` rule says add the cost only when a real consumer appears; none does yet. Correctly deferred until a consumer exists.

- **Functional conformance scene** (`tests/functional/velocity-*` over translation/rotation/scale motion blur across raster backends). **Parked:** depends on the GL/Wgpu writers adopting `getVelocitySampleAt` first (cross-package), and functional scenes live in `tests/functional/`, not in the package.

- **Rust parity for the 15 new functions** in `flighthq-velocity`, plus recording the `WeakMap<object>` → `HashMap<u64>` keying divergence in the conformance map. **Parked:** Rust work is scoped to the `rust` worktree, not this TS package.

- **Package Map entry for `@flighthq/velocity`** in `tools/agents/docs/index.md` (absent in both the live tree and the incoming head). **Parked:** edits a root-level admin doc that is shared infrastructure, and adding a package to the map is the user's gate, not a within-package sweep. Surface as a one-line admin-doc revision.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The review enumerates these; the assessment confirms they are the design forks that keep the bulk of the backlog parked:

1. **North star** — confirm the durable bar (per-frame, alias-safe, allocation-free value algebra; a single source-agnostic accumulator; explicit-wins-over-baseline fencing; per-instance / buffer-write / tessellation delegated out).
2. **Affine contributor semantics (headline)** — should `contributeAffineVelocity` store per-pixel/anchor velocity (honoring `pivot`), or is anchor velocity the right per-node scalar with per-pixel reprojection strictly a `getVelocitySampleAt` concern? Decide whether the function is renamed, merged with `contributeTransformVelocity`, or made genuinely affine — this resolves both the misnomer and the duplicate walkers.
3. **Bulk iteration vs. `WeakMap` keying** — bless `WeakMap`-only (consumers hold sources) or add a live-this-frame iteration list (the GC/ownership tradeoff).
4. **Buffer-write convention** — centralize the screen→buffer scale + Y-axis convention so the two backends and the Rust port agree (cross-package adoption required).
5. **History & acceleration scope** — confirm both as opt-in Gold features off the default path.
6. **Transform-trait hardening** — local `isTransform2DNode` guard vs. a typed child accessor in `@flighthq/node` (cross-package).
7. **`getVelocitySampleAt` matrix parameter** — `Readonly<Matrix>` (the Recommended default) vs. an explicit `Readonly<MatrixLike>` if structural input is a sanctioned convenience.
8. **Rust parity** — mirror the 15 new functions and record the keying divergence (scoped to the `rust` worktree).
