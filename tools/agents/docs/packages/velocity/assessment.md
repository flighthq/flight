---
package: '@flighthq/velocity'
updated: 2026-06-25
basedOn: ./review.md
---

# velocity — Assessment (merge gate: integration b2824e3d8 → origin/main eb73c3d74)

Sorted from `review.md` (`REVISE — 70`), judging only the incoming delta (two new files: `affineVelocity.ts` + `affineVelocity.test.ts`) against the approved `origin/main` floor. The delta's math is correct but it ships unreachable (barrel un-updated) and with a misnamed contributor. The one hard blocker (barrel re-export) and the one type tightening are within-package and sweep-safe; the naming/semantics decision and everything cross-package is parked.

> Lineage caveat. The previous revision of this file was written against the `builder-67dc46d64` lineage (richer surface, re-exporting barrel) and its headline item assumed `affineVelocity` was already in the barrel. Under the b2824e3d8 gate that assumption is false — the dead-export is a real, new blocker. Items below are re-derived for this delta.

## Recommended

Strictly sweep-safe: within `@flighthq/velocity`, no cross-package coupling, no open design decision.

- **Re-export the new functions from the package barrel (the merge blocker).** `src/index.ts` (`b2824e3d8`) is unchanged from base and re-exports nothing from `./affineVelocity`, so `contributeAffineVelocity` and `getVelocitySampleAt` are unreachable from `@flighthq/velocity` — dead exports whose tests pass only via a direct `./affineVelocity` import. Add `export { contributeAffineVelocity, getVelocitySampleAt } from './affineVelocity';` to the barrel (alphabetized with the existing `contributeTransformVelocity` re-export). Pure surface plumbing, no behavior change. — review.md (standard 3).

- **Tighten `getVelocitySampleAt`'s `currentWorldTransform` to `Readonly<Matrix>`.** It is currently an inline structural literal `Readonly<{ a; b; c; d; tx; ty }>` (`b2824e3d8:src/affineVelocity.ts:35`), a structural-shape leak the types-layout convention discourages — `getNodeWorldTransformMatrix` already returns a real `Matrix`. Replace with `Readonly<Matrix>` imported from `@flighthq/types`. Type-only, within-package, no runtime change. (If structural input is later blessed as a convenience, that is the Open-direction question below — but the contract-aligned default is `Readonly<Matrix>`.) — review.md (standard 6).

## Backlog

Parked: needs a charter decision, crosses a package boundary, or is larger than a sweep. Each carries why.

- **Resolve the `contributeAffineVelocity` name/semantics mismatch** (and the resulting near-duplicate `visitTransformVelocity` / `visitAffineVelocity` walkers). The stored `sample.velocity` is origin velocity — identical to base `contributeTransformVelocity` for an origin-anchored node — so the "affine" name over-promises and the private walkers duplicate. **Parked:** the fix is a semantics decision (store per-pixel/anchor velocity vs. rename/redescribe as "retains the transform so `getVelocitySampleAt` is available" vs. merge into `contributeTransformVelocity`). Not sweep-safe — routed to Open directions; the walker de-duplication follows whichever way it lands.

- **Bulk iteration / `forEachVelocity`.** No way to enumerate every source moving this frame. **Parked:** the clean implementation requires moving `samples` off `WeakMap` to a hybrid (live-frame list + retain), a GC/ownership tradeoff — a memory-model decision, not in the delta. Routed to Open directions.

- **Buffer-write convention helper** (a `@flighthq/types` descriptor / `createVelocityWriteParams` for the screen→buffer scale + Y-axis convention the GL/Wgpu writers each bake in). **Parked:** only pays off with cross-package adoption; a half-seam if defined here without it. Cross-package.

- **Transform-trait hardening** — remove the `child as unknown as Transform2DNode` cast in the contributors (`b2824e3d8:src/affineVelocity.ts:97`, mirrored in base `transformVelocity.ts`) via an `isTransform2DNode` guard or a typed child accessor. **Parked:** the cleanest fix lives in `@flighthq/node`. Cross-package.

- **GL/Wgpu velocity-writer adoption of `getVelocitySampleAt`** — the payoff of the affine primitive (correct motion blur at rotating pivots). **Parked:** touches `displayobject-gl` / `displayobject-wgpu` / `effects-*`, not this package. Cross-package suggestion.

- **Rust parity** for `contributeAffineVelocity` / `getVelocitySampleAt` in `flighthq-velocity`. **Parked:** Rust work is scoped to the `rust` worktree, not this TS merge.

- **Package Map entry for `@flighthq/velocity`** in `tools/agents/docs/index.md` (absent in both trees). **Parked:** edits a shared root-level admin doc; adding a package to the map is the user's gate, not a within-package sweep. Surface as a one-line admin-doc revision.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here):

1. **Affine contributor semantics (headline).** Should `contributeAffineVelocity` store per-pixel/anchor velocity (honoring a pivot), or is anchor velocity the right per-node scalar with per-pixel reprojection strictly a `getVelocitySampleAt` concern? This ruling decides rename vs. rework vs. merge, and dissolves the duplicate walkers.
2. **`getVelocitySampleAt` matrix parameter.** `Readonly<Matrix>` (the Recommended default) vs. `Readonly<MatrixLike>` if structural input is a sanctioned convenience.
3. **Bulk iteration vs. `WeakMap` keying.** Bless `WeakMap`-only (consumers hold sources) or add a live-this-frame iteration list (the GC/ownership tradeoff).
4. **Buffer-write convention.** Centralize the screen→buffer scale + Y-axis convention so the two backends and the Rust port agree (cross-package adoption required).
5. **Rust parity.** Mirror the new functions and record any keying divergence (scoped to `rust`).
