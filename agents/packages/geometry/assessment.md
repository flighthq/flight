---
package: '@flighthq/geometry'
updated: 2026-08-25
basedOn: ./review.md
---

# geometry — Assessment

Sorts the gaps from `review.md` (authoritative, 92/100, 2026-07-13). The prior assessment's Recommended list and the Approved guard item are fully landed: the Euler-extraction fix, closest-point suite, `expandAabbBySphere` typing, look-rotation convention (fixed to standard per Decision, beyond the documented-only ask), predicate renames, hardening tests, and guarded pool mode all shipped. What remains is a small correctness/consistency tail plus additive breadth on existing types.

## Recommended

Strictly sweep-safe: within `packages/geometry/`, existing `@flighthq/types` entries only, no breaking change, no open design decision. Each follows the file-per-type, free-function, out-param, alias-safe style; additions are barrel re-exports via the existing `export *`.

- ~~**Fix the `translateMatrix` / `translateMatrixByVectorXY` out-param defect.**~~ Verified landed 2026-08-25 — both functions destructure all fields from source and write the full matrix via `setMatrix`; alias-safe. `: void` annotations present.
- **Document `setPerspectiveMatrix4`'s parameter as tan(fovY/2) and rename the param.** `top = fov * zNear` means `fov` is the half-FOV tangent, not an angle; the compensating comment currently lives in the consumer (`camera/src/projection.ts`), the exact caller-side-warning smell the diagnostics rule bans. Renaming a parameter and writing the JSDoc is non-breaking; _changing_ the semantics to radians is the routed Open direction. (review.md#gaps.)
- **Add the missing pair predicates on existing types:** `isAabbIntersectingSphere` (Arvo), `isObbIntersectingSphere`, `isCapsuleIntersectingAabb`, `isFrustumIntersectingObb` — all spelled per the blessed 2026-07-01 `is*Intersecting*` Decision, all over already-homed types. (review.md#gaps.)
- **Add the missing conventional singles:** `transformRay3DByMatrix4` (transform origin as point, direction as vector — the picking-into-local-space primitive), `getQuaternionAxisAngle` (inverse of the existing `setQuaternionFromAxisAngle`), and the 2D vector kit — scalar `crossVector2`, `rotateVector2`, `getVector2Angle`. Additive, textbook semantics, no new types. (review.md#gaps.)
- **`transformVector3ByMatrix3` should take `Readonly<Matrix3Like>`** instead of the inline `Readonly<{ m: Readonly<Float32Array> }>` — same homed-type swap as the landed `expandAabbBySphere` fix; structurally assignable, non-breaking. (review.md#contract--docs-fit.)
- **Doc/style hygiene pass:** correct the "byte offset" JSDoc on the element-offset Float32Array bridges (vector3/vector4/matrix3), reattach the orphaned transpose JSDoc block in `matrix4.ts` to `transposeMatrix4`, and retire the `var` relics in `rotateMatrix`. (review.md#gaps.)

## Backlog

Parked — each names why it is not sweep-safe.

- **Perspective fovY semantics.** _Parked: design fork, breaking._ Switching `setPerspectiveMatrix4` to take fovY radians (GLM/three.js convention) changes the contract and `camera`'s call site. Routed to Open direction #1; the Recommended rename/JSDoc item removes the hazard meanwhile.
- **Naming unification, second wave.** _Parked: open design decision + cross-package renames._ One spelling for containment (`containsAabbPoint` vs `isFrustumContainingPoint`), one for smallest-enclosing (`unionAabb` vs `mergeBoundingSphere`/`mergeRectangle`), whether the rectangle family (`intersectsRectangle`, consumed by `spatial`/`clip`/`interaction`) joins `is*Intersecting*`, and the `matrix4Transform*` → `transform*ByMatrix4` family. Extends the 2026-07-01 Decision; needs a charter ruling before the renames touch consumers. Routed to Open direction #2.
- **Obb/Capsule field shape.** _Parked: `@flighthq/types` design._ Flattened scalars vs the nested-`Vector3Like` shape Aabb/BoundingSphere use — the blessed shape for future volume types should be decided once, in the types layer. Routed to Open direction #3.
- **Singularity policy across matrix tiers.** _Parked: behavioral convention choice._ `inverseMatrix4` (absolute `1e-6`, NaN-fill) vs `inverseMatrix3` (`=== 0`, NaN-fill) vs `inverseMatrix` (`=== 0`, degenerate fill). Unifying changes observable behavior; wants one documented rule (likely magnitude-relative epsilon). Routed to Open direction #4.
- **2D `Matrix` skew + decompose.** _Parked: convention choice._ Canonical for the 2D authoring domain (Flash/CSS heritage), but the skew representation (angle vs factor, skewX/skewY definition) and the decompose contract need blessing before the API is frozen.
- **Rust crate conformance.** _Parked: external repo._ No `crates/` exists in this monorepo — `flighthq-geometry` work belongs to the flight-rs repo. The charter's "faithful Rust mirror" North star and this cell's crate framing should be re-pointed there (a charter/docs edit, surfaced to the user, not package work).

## Approved

- [2026-07-03 · charter session] Guarded pool mode (`enableGeometryPoolGuards`) — charter Decision 2026-07-03 (diagnostics)
- [2026-08-12 · completed] Supersedes the 2026-07-03 entry: guarded pool mode is implemented.
- [2026-07-22 · completed] `setPerspectiveMatrix4` evaluates the infinite-far limit explicitly, so
  source formats with an omitted far plane do not produce `Infinity / Infinity` NaNs.
