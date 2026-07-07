---
package: '@flighthq/geometry'
crate: flighthq-geometry
draft: false
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# geometry — Charter


## What it is

`@flighthq/geometry` is the SDK's linear-algebra substrate: the value-typed math primitives every other package computes against. It covers the full canonical roster — vectors (vec2/3/4), three matrix tiers (2D affine `Matrix`, `Matrix3`, `Matrix4`), `Quaternion`, the OpenFL-grade 2D `Rectangle`, and the 3D bounding volumes (AABB, sphere, plane, frustum) plus a first-class `Ray3D` with a full intersection suite — along with the supporting infrastructure: typed-array capacity (`reserve*`) helpers and per-type `acquire*`/`release*` object pools.

It is **pure value-math**: free functions over plain data, alias-safe `out`-parameters, sentinel returns, no graph identity, no rendering, no host coupling. Where a neighbor begins: the moment a value gains scene-graph participation it belongs to `@flighthq/node`/`@flighthq/displayobject`/ `@flighthq/scene`, not here; the shared types it operates on (`Ray3DLike`, `FrustumLike`, `EulerOrder`, `BoundingSphereLike`, …) are homed in `@flighthq/types`, not defined inline. How far past pure value-math `geometry` reaches — ray casting, closest-point/distance — is itself live (see Open directions).

## North star

_Proposed, not blessed — edit or move any of these to Open directions if they overreach._

- **Greppable, globally self-identifying symmetry.** The package's value proposition is that a name leads directly to its type and operation, and that the same operation reads the same way across every type family. Every function carries the full, unabbreviated type word; one concept has one spelling across vec2/3/4, the matrix tiers, and the bounding volumes. Naming symmetry is a first-class correctness property here, not cosmetics.
- **Pure, alias-safe value-math.** Free functions over plain data. Mutating functions take a leading `out`/`target` and read all inputs into locals before writing, so `out` may alias an input. `create*`/`clone*`/`acquire*` are the only allocators; math/transform/bounds helpers write into `out` and are safe in hot loops.
- **Explicit allocation, explicit ownership.** Typed-array `reserve*` capacity helpers and per-type `acquire*`/`release*` pools make every allocation a named call. Pool brackets are paired; nothing allocates implicitly.
- **Correct, conventional math.** A canonical math library is held to _authoritative_ standard: round-trips hold, conventions are documented, and a blessed handedness/axis convention is applied consistently. (The review flags two live correctness defects against this bar — see Open directions #4.)
- **A faithful Rust mirror.** `flighthq-geometry` is a value-typed leaf and the conformance goal is 1:1; the TS surface and the Rust crate are meant to track each other. Whether crate parity gates a package's status is itself open (see Open directions #5).

## Boundaries

_Proposed scope lines — confirm or redraw._

**In scope:**

- Vector / matrix / quaternion algebra across the full dimension ladder.
- 2D `Rectangle` (OpenFL-grade) and 3D bounding volumes (AABB, sphere, plane, frustum).
- `Ray3D` and its intersection suite (the picking/collision math primitive).
- Float32Array / GPU-buffer packing bridges for vectors and all matrix tiers.
- Typed-array capacity helpers and per-type object pools.

**Non-goals:**

- Scene-graph participation, transforms-on-nodes, bounds invalidation — owned by `@flighthq/node` and the display/scene packages.
- Rendering, GPU resource ownership, host/platform coupling.
- Defining cross-package types inline — shared shapes live in `@flighthq/types`.

**Decided edges:**

- **Collision math (ray intersection, closest-point/distance)** is in scope — pure value-math on geometry primitives with no graph identity. Consumers (`interaction`, physics) depend on geometry for these; geometry is the substrate.
- **OBB and Capsule** are in scope as standard bounding-volume primitives. Both need a type entry in `@flighthq/types` first.

## Decisions

- **[2026-07-01] Geometry owns collision math.** Ray intersection, closest-point/distance, and bounding-volume predicates are pure value-math on geometry primitives — they belong here, not in a consumer package. Geometry is the math substrate; consumers (`@flighthq/interaction`, physics) depend on it. **Resolves open direction #1.**

- **[2026-07-01] OBB and Capsule are in scope — build now.** Both are standard bounding-volume primitives that complete the canonical roster. Each needs a type entry in `@flighthq/types` (`Obb`/`ObbLike`, `Capsule`/`CapsuleLike`) first, then implementation in geometry. **Resolves open direction #2.**

- **[2026-07-01] Intersection predicates use `is*Intersecting*`.** The canonical spelling for "do these two volumes overlap?" is `is[TypeA]Intersecting[TypeB]` — e.g. `isAabbIntersectingAabb`, `isBoundingSphereIntersectingBoundingSphere`, `isFrustumIntersectingAabb`, `isFrustumIntersectingSphere`. This follows the SDK's `is*` boolean-prefix convention. `intersectAabb` (no `s`, no `is` prefix) stays as the out-computing overlap-box operation. Renames: `intersectsAabb` → `isAabbIntersectingAabb`; `getBoundingSphereIntersectsBoundingSphere` → `isBoundingSphereIntersectingBoundingSphere`. `isFrustumIntersecting*` already follows the convention and stays. **Resolves open direction #3.**

- **[2026-07-01] Standard quaternion look-rotation convention: +Z forward, +Y up = identity.** Fix `setQuaternionLookRotation` to use the standard convention (matching three.js, Unity, and most engines). The current X/Z-swapped axis convention is non-standard and undocumented. Also fix `getQuaternionEuler` to fully round-trip `setQuaternionFromEuler` for all six Euler orders — the get-side extraction bug is a correctness defect, not a convention choice. **Resolves open direction #4.**

- **[2026-07-01] TS packages advance independently of Rust conformance.** A TS package can reach Gold and ship status without waiting for the Rust crate to mirror it 1:1. Rust conformance is tracked (in the conformance map) but is not a blocking gate for TS package status. **Resolves open direction #5.**

- **[2026-07-03] Guarded pool mode is chartered: `enableGeometryPoolGuards()`.** Opt-in, module-scoped, in a sibling module. When enabled, every pool `release*` checks membership and warns once on a double release (`logOnce`, channel `'geometry'`) — the corruption-shaped misuse: a double-released object is handed out twice later, aliased across owners. A leaked `acquire*` stays unguarded (it just GCs; the pairing rule remains a documented bracket). Core pool hot paths gain no branches when guards are off — attachment is via the pool's internal slot. Full convention: [diagnostics](../../conventions/diagnostics.md). **User-blessed 2026-07-03.**

  **Why:** double-release corrupts silently at a distance — the failure appears frames later on an unrelated matrix, which is the hardest shape for an agent to trace back. It is the highest-value pool guard and the only one that cannot be caught by reading the callsite.

## Open directions

Remaining questions not yet settled by a Decision above.

1. ~~Where is the boundary between `geometry` and picking/physics?~~ **Resolved — see Decision [2026-07-01].**
2. ~~OBB / Capsule — in or out of scope?~~ **Resolved — see Decision [2026-07-01].**
3. ~~Intersection-predicate naming convention.~~ **Resolved — see Decision [2026-07-01].**
4. ~~Quaternion convention contract.~~ **Resolved — see Decision [2026-07-01].**
5. ~~Rust conformance as a release gate.~~ **Resolved — see Decision [2026-07-01].**
6. **Wasm `-rs` mixing leaf** _(structural fork D — the Wasm mixing seam)._ `geometry` is named as a candidate value-typed, Wasm-mixable leaf (value-in/value-out math). Is a `geometry-rs` NPM drop-in a direction worth committing to, and does that obligation shape the API seam?
7. **Closed-union exception is settled, but noted** _(structural fork B — closed union vs. open registry)._ `EulerOrder` is a mathematically fixed six-member set inside a tight conversion loop — the closed-system exception to the registry default, correctly a closed string union here. Recorded so a later pass does not "fix" it into a registry.
8. **Package Map line is stale.** The codebase-map geometry entry ("rectangles, vectors, matrices, typed-array capacity helpers, and pools") predates quaternion, the AABB/sphere/plane/frustum culling set, and `Ray3D`. Candidate revision: widen it to "…matrices, quaternion, bounding volumes (AABB/sphere/plane/frustum), and a Ray3D intersection primitive…". (Cross-doc edit — surface, do not act autonomously.)
