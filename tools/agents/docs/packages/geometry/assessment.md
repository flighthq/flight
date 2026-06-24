---
package: '@flighthq/geometry'
updated: 2026-06-24
basedOn: ./review.md
---

# geometry — Assessment

Sorts the gaps from `review.md` (solid, 90/100) and the absorbed roadmap (`reviews/maturation/depth/geometry.md`) into sweep-safe `Recommended` work and parked `Backlog`. Most of the prior roadmap's Bronze/Silver and part of Gold already landed across builder passes 1–2 (the full vec2/3/4 symmetry set, quaternion-to-canonical, Float32Array bridges, the AABB/sphere/plane/frustum culling set, and a first-class `Ray3D` intersection suite); what remains is a small correctness/consistency tail plus the larger parked workstreams.

Design forks and cross-package items are **not** in `Recommended` — they are surfaced to the charter's Open directions (the stub charter's _North star_/_Boundaries_/_Decisions_ are still `TODO`). `Approved` is empty until the user verbally approves.

## Recommended

Strictly sweep-safe: within `@flighthq/geometry`, no cross-package type, no breaking signature change, no open design decision. Each follows the established file-per-type, free-function, out-param, alias-safe, pooled style; every addition is a barrel re-export from `index.ts`.

- **Fix `getQuaternionEuler` extraction (correctness defect).** The _set_ side (`setQuaternionFromEuler`) is the standard per-order half-angle product and is correct; the _get_ side extracts with a convention that does not invert the set-side multiply order, so `set → get` only round-trips for single-axis inputs (a combined `(0.3, 0.5, 0.7)` XYZ rotation drifts ~0.027 in `|dot|`). Make `getQuaternionEuler` the true inverse of the existing `setQuaternionFromEuler` for all six orders. This targets the already-shipped set-side convention — no new convention decision is required, so it is autonomous. Add a `set → get` round-trip test per `EulerOrder`. (review.md#gaps; the choice of _which_ handedness/look convention to bless is the separate Open direction, below.)
- **Closest-point / distance suite.** Add `getClosestPointOnAabb`, `getClosestPointOnBoundingSphere`, `getClosestPointOnPlane`, `getClosestPointOnRay3D`, and `getClosestPointBetweenRay3Ds` — the standard collision-support kit that pairs with the now-present intersection suite. Pure omission, no new `@flighthq/types` entry, low design risk; operates on types that already exist. (review.md#gaps, roadmap Gold.)
- **`expandAabbBySphere` should take `Readonly<BoundingSphereLike>`.** It currently accepts an inline anonymous `Readonly<{ center; radius }>` that bypasses the already-homed `BoundingSphereLike` and reads inconsistently with `setBoundingSphereFromAabb`/`expandAabbByPoint`. Swap to the homed type. Non-breaking (the inline shape is structurally assignable from `BoundingSphereLike`), within-package, uses an existing `@flighthq/types` entry. (review.md#contract-fit.)
- **Document `setQuaternionLookRotation`'s axis convention in JSDoc.** Its body swaps X/Z (`fz = forward.x; fx = forward.z`), so "look along +Z, +Y up" is not identity — deterministic but undocumented. _Documenting the existing behavior_ is sweep-safe; **changing** the convention is the routed Open direction. State the current convention precisely so callers can rely on it. (review.md#gaps.)
- **Numerical / edge-case hardening.** Add explicit handling + tests for degenerate input that the current guards do not cover: `setQuaternionFromUnitVectors` antiparallel case, gimbal at ±90° in Euler conversions, singular-matrix inverse returning a documented sentinel/identity. Add property-based round-trip tests (compose∘decompose, inverse∘transform = identity, quat↔matrix round-trip). Within-package, no new surface. (roadmap Gold.)
- **Batch / performance pass.** Add `applyMatrix4ToVector3Array(out, source, count, matrix)`-style batch transforms for vertex buffers, and confirm hot transforms/multiplies stay allocation-free and alias-safe under fuzz. Additive, within-package; verify tree-shaking with `npm run size` after. (roadmap Gold.)

## Backlog

Parked — each names _why_ it is not sweep-safe.

- **`getQuaternionEuler` / `setQuaternionLookRotation` convention contract.** _Parked: open design decision._ Fixing the get-side extraction (above) is autonomous, but the SDK-blessed handedness and look-rotation convention (does "+Z forward" = identity? which Euler round-trip guarantee does the SDK promise?) is a charter Decision, not a within-package add. Routed to Open directions #4.
- **Intersection-predicate naming unification.** _Parked: open design decision (API-shape fork)._ The same "do these two volumes overlap?" predicate is spelled three ways — `intersectsAabb`, `getBoundingSphereIntersectsBoundingSphere`, `isFrustumIntersecting{Aabb,Sphere}`. In a package whose whole value is greppable symmetry this is a real defect, but picking the one canonical spelling (lean: an `is*…Intersecting*` form per the SDK boolean rule, leaving `intersectAabb` as the out-computing overlap-box op) is a charter Decision that governs every future bounding volume — and the rename touches the public surface. Routed to Open directions #3.
- **OBB and Capsule primitives.** _Parked: cross-package — needs new `@flighthq/types` entry first._ Both require an `Obb`/`Capsule` type in `@flighthq/types`, and whether ray casting / volume math of this kind belongs in `geometry` at all is the geometry↔picking/physics boundary question. Bedrock test: a real subject (mature engines ship OBB/capsule), but it is a cross-package design decision, not an in-package omission. Routed to Open directions #1 and #2.
- **Rust crate conformance (`flighthq-geometry`).** _Parked: separate crate, large workstream, fork-adjacent._ The crate gained `frustum.rs` + `ray3d.rs` but still lacks `quaternion.rs`, `aabb.rs`, `boundingSphere.rs`, `plane.rs`, and every op from passes 1–2. Per the 1:1 conformance goal this is Gold-blocking, but it is a crate defect (a Rust-focused workstream + `flighthq-functional` conformance scenes), not a TS-package defect — and whether TS completeness may land ahead of the crate mirror is itself a fork-adjacent posture question. Routed to Open directions #5.
- **Geometry concepts doc + Package Map line.** _Parked: outside the package source tree._ A short coordinate-conventions doc (row/column-major, handedness, radian convention, matrix-multiply order, tier suffixes) under `tools/agents/docs`, plus widening the stale codebase-map geometry line to name quaternion / bounding volumes / `Ray3D`. Both edit shared docs, not `packages/geometry/`. Surface the Package Map edit to the user.

## Approved

_None. Approval is the user's verbal gate; nothing frozen yet._

---

### Notes for the charter's Open directions

Carried from review.md#candidate-open-directions for the user to settle (this skill does **not** edit the charter):

1. The `geometry` ↔ picking/physics boundary — does `geometry` own ray casting and the closest-point/distance support kit as the math substrate for `interaction`/physics?
2. OBB / Capsule scope, and where the `@flighthq/types` entry lives.
3. The one canonical intersection-predicate spelling (governs every future bounding volume).
4. The SDK quaternion handedness / look-rotation convention, and the `setQuaternionFromEuler` ⇄ `getQuaternionEuler` round-trip guarantee.
5. Rust conformance as a release gate — may TS-package completeness land ahead of the `flighthq-geometry` mirror (fork-adjacent, applies beyond geometry).

### Roadmap absorption

`reviews/maturation/depth/geometry.md` is now fully absorbed into this assessment (its Bronze/Silver and the Ray3D slice of Gold already landed; the residue is sorted above). It is one-time seed and can be removed.
