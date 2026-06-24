---
package: '@flighthq/geometry'
crate: flighthq-geometry
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# geometry — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/geometry` is the SDK's linear-algebra substrate: the value-typed math primitives every other package computes against. It covers the full canonical roster — vectors (vec2/3/4), three matrix tiers (2D affine `Matrix`, `Matrix3`, `Matrix4`), `Quaternion`, the OpenFL-grade 2D `Rectangle`, and the 3D bounding volumes (AABB, sphere, plane, frustum) plus a first-class `Ray3D` with a full intersection suite — along with the supporting infrastructure: typed-array capacity (`reserve*`) helpers and per-type `acquire*`/`release*` object pools.

It is **pure value-math**: free functions over plain data, alias-safe `out`-parameters, sentinel returns, no graph identity, no rendering, no host coupling. Where a neighbor begins: the moment a value gains scene-graph participation it belongs to `@flighthq/node`/`@flighthq/displayobject`/ `@flighthq/scene`, not here; the shared types it operates on (`Ray3DLike`, `FrustumLike`, `EulerOrder`, `BoundingSphereLike`, …) are homed in `@flighthq/types`, not defined inline. How far past pure value-math `geometry` reaches — ray casting, closest-point/distance — is itself live (see Open directions).

## North star (proposed)

_Proposed, not blessed — edit or move any of these to Open directions if they overreach._

- **Greppable, globally self-identifying symmetry.** The package's value proposition is that a name leads directly to its type and operation, and that the same operation reads the same way across every type family. Every function carries the full, unabbreviated type word; one concept has one spelling across vec2/3/4, the matrix tiers, and the bounding volumes. Naming symmetry is a first-class correctness property here, not cosmetics.
- **Pure, alias-safe value-math.** Free functions over plain data. Mutating functions take a leading `out`/`target` and read all inputs into locals before writing, so `out` may alias an input. `create*`/`clone*`/`acquire*` are the only allocators; math/transform/bounds helpers write into `out` and are safe in hot loops.
- **Explicit allocation, explicit ownership.** Typed-array `reserve*` capacity helpers and per-type `acquire*`/`release*` pools make every allocation a named call. Pool brackets are paired; nothing allocates implicitly.
- **Correct, conventional math.** A canonical math library is held to _authoritative_ standard: round-trips hold, conventions are documented, and a blessed handedness/axis convention is applied consistently. (The review flags two live correctness defects against this bar — see Open directions #4.)
- **A faithful Rust mirror.** `flighthq-geometry` is a value-typed leaf and the conformance goal is 1:1; the TS surface and the Rust crate are meant to track each other. Whether crate parity gates a package's status is itself open (see Open directions #5).

## Boundaries (proposed)

_Proposed scope lines — confirm or redraw._

**In scope (proposed):**

- Vector / matrix / quaternion algebra across the full dimension ladder.
- 2D `Rectangle` (OpenFL-grade) and 3D bounding volumes (AABB, sphere, plane, frustum).
- `Ray3D` and its intersection suite (the picking/collision math primitive).
- Float32Array / GPU-buffer packing bridges for vectors and all matrix tiers.
- Typed-array capacity helpers and per-type object pools.

**Non-goals (proposed):**

- Scene-graph participation, transforms-on-nodes, bounds invalidation — owned by `@flighthq/node` and the display/scene packages.
- Rendering, GPU resource ownership, host/platform coupling.
- Defining cross-package types inline — shared shapes live in `@flighthq/types`.

**Undecided edges** (proposed → really Open directions): whether the **closest-point/distance** collision-support kit and ongoing ray-casting belong here or in a consumer (picking/physics) package; and whether **OBB / Capsule** are in scope at all (they need a `@flighthq/types` entry first).

## Decisions

None blessed yet.

## Open directions

Every candidate question the stub charter does not yet answer that the review had to assume, plus the structural forks that touch this package. These are for you to settle — an agent asks here rather than assuming.

1. **Where is the boundary between `geometry` and picking/physics?** A `Ray3D` intersection suite now lives here. Does `geometry` own ray casting and the **closest-point/distance** collision-support kit (`getClosestPointOn{Aabb,BoundingSphere,Plane,Ray3D}`, `getClosestPointBetweenRay3Ds`) as the math substrate for `interaction`/physics, or does anything past pure value-math belong to a consumer package? The prior depth review deferred this; the ray suite already crossed the line, so it is now load-bearing.
2. **OBB / Capsule — in or out of scope, and where does the type live?** Both are the obvious next bounding volumes; both need an `Obb`/`Capsule` entry in `@flighthq/types` first, making them a cross-package design decision rather than a within-package omission. A Boundary/Decision is needed before building.
3. **The intersection-predicate naming convention.** The "do these two volumes overlap?" predicate is currently spelled three ways: `intersectsAabb`, `getBoundingSphereIntersectsBoundingSphere`, and `isFrustumIntersecting{Aabb,Sphere}`. Settle one canonical spelling (the SDK boolean rule favors an `is*`/`has*` prefix, e.g. `isAabbIntersectingAabb`, leaving `intersectAabb` as the out-computing overlap-box op) so the next bounding volume does not invent a fourth. A small Decision here pays forward and is the main symmetry gap the review docks.
4. **Quaternion convention contract.** What handedness / look-rotation convention does the SDK bless? Specifically: should `setQuaternionLookRotation` make "+Z forward, +Y up" identity (it currently uses an undocumented X/Z-swapped axis convention), and is `getQuaternionEuler` expected to round-trip `setQuaternionFromEuler` for **all** Euler orders (it currently only does for single-axis inputs — a real get-side extraction bug)? Fixing the extraction is autonomous once the target convention is chosen, but the _convention_ it should target is a charter-level Decision.
5. **Rust conformance as a release gate** _(fork-adjacent: the conformance posture; applies beyond geometry)._ The crate lags the TS surface (`quaternion`, `aabb`, `boundingSphere`, `plane` and the pass-1/2 ops are unported). Is TS-package completeness allowed to land ahead of the `flighthq-geometry` mirror, or is 1:1 crate parity a blocking gate for a package's status to advance?
6. **Wasm `-rs` mixing leaf** _(structural fork D — the Wasm mixing seam)._ `geometry` is named as a candidate value-typed, Wasm-mixable leaf (value-in/value-out math). Is a `geometry-rs` NPM drop-in a direction worth committing to, and does that obligation shape the API seam?
7. **Closed-union exception is settled, but noted** _(structural fork B — closed union vs. open registry)._ `EulerOrder` is a mathematically fixed six-member set inside a tight conversion loop — the closed-system exception to the registry default, correctly a closed string union here. Recorded so a later pass does not "fix" it into a registry.
8. **Package Map line is stale.** The codebase-map geometry entry ("rectangles, vectors, matrices, typed-array capacity helpers, and pools") predates quaternion, the AABB/sphere/plane/frustum culling set, and `Ray3D`. Candidate revision: widen it to "…matrices, quaternion, bounding volumes (AABB/sphere/plane/frustum), and a Ray3D intersection primitive…". (Cross-doc edit — surface, do not act autonomously.)
