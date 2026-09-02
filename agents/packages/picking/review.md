---
package: '@flighthq/picking'
status: solid
score: 74
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
---

# picking -- Review

## Verdict

**Solid -- 74/100.** The package is a clean composition layer over camera (unprojection) and scene
(raycast traversal), matching the charter's north star. It provides camera and world-ray entry points,
nearest and all-hit queries, visibility pruning, predicate and distance filters, optional backface
culling, local-space ray transforms preserving parametric `t` across meshes, and full hit results
(triangle index, barycentrics, world point, geometric face normal). Since the prior review (70),
`Scene3DHit.node` is honestly `Mesh | null`, and six separately-importable on-demand attribute queries
(material, subset index, UV0, interpolated vertex normal via inverse-transpose, tangent with
mirror-aware handedness, front-facing check) have been verified to return sentinels without touching
caller-owned outputs on a fresh or null-node hit. The broad-phase now reads the `deformedLocalBounds`
runtime slot for posed meshes, so a skinned/morphed mesh whose limb has moved outside its bind box is
not wrongly rejected.

The remaining depth is semantic agreement between picks and rendered geometry (GPU-skinned narrow-phase,
billboard, instance, LOD), alpha-mask coverage, region selection, and acceleration. One charter decision
(replace duplicated transform functions) remains unresolved, and a double cast lacks the required
comment.

## Present capabilities

Grounded in source; file references are relative to `packages/picking/src/`.

**Picking core (`pickScene3D.ts`):** `createScene3DHit` allocates a zeroed Entity-backed hit with
`node: null` and `triangleIndex: -1`. `pickScene3D` unprojects a camera ray and delegates to
`pickScene3DWithRay3D`, returning the nearest hit or `null`. `pickScene3DAll` is the multi-hit
equivalent, delegating to `pickScene3DAllWithRay3D`. `pickScene3DWithRay3D` is the general world-ray
nearest-hit primitive: it walks the scene depth-first, prunes disabled subtrees, applies the predicate
filter per mesh without pruning descendants, and runs a broad-phase (world AABB from
`deformedLocalBounds` or bind-pose bounds) then brute-force ray-triangle narrow-phase per mesh.
`pickScene3DAllWithRay3D` collects every hit into a reusable `outArray` sorted by ascending distance.

The narrow phase transforms the ray into local space via the mesh's inverse world matrix, intentionally
leaving the direction un-normalized so the parametric `t` stays in world-ray units and is comparable
across meshes. Each hit receives the world-space geometric face normal (normalized cross product of two
world-space edges, correct under mirroring/negative scale), barycentric weights (`u + v + w === 1`),
and the world-space hit point. Backface culling uses the dot product of the ray direction with the
world normal. Triangle decoding delegates to `getMeshGeometryTriangleVertexIndices`, supporting indexed,
non-indexed, and triangle-strip topologies with correct alternating CCW winding.

Module-level scratch objects are at the bottom of the file. Non-reentrancy is documented with a C/C++
port note.

**Hit attributes (`sceneHitAttributes.ts`):** Six on-demand query functions that derive additional data
from the core hit and the mesh's current geometry, each independently importable:

- `getScene3DHitMaterial` -- returns the authored `Material` at the hit subset, or `null`.
- `getScene3DHitSubsetIndex` -- returns the subset slot owning the hit triangle, or `-1`.
- `getScene3DHitUv0` -- barycentrically interpolates UV0 into a `Vector2Like` out-param; returns
  `false` without changing `out` when the channel is absent.
- `getScene3DHitVertexNormal` -- interpolates vertex normals and transforms to world space using the
  inverse-transpose of the world matrix, so non-uniform scale remains correct. Returns `false` without
  changing `out` when normals are absent or the transform is degenerate.
- `getScene3DHitVertexTangent` -- interpolates tangent `xyz`, transforms to world space, orthogonalizes
  against the interpolated world normal, and flips handedness under a mirrored world transform
  (determinant check). Returns `false` without changing `out` when tangents or normals are absent.
- `isScene3DHitFrontFacing` -- compares the world ray direction with the geometric face normal; treats
  perpendicular rays as front-facing.

All six guard `hit.node === null` before accessing geometry, returning their respective sentinels.

**Export lanes:** `index.ts` re-exports the 11 named functions from `contract.ts`. `contract.ts` uses
`export *` from both source modules. Two-lane structure is correct.

**Package shape:** `sideEffects: false`, no top-level registration or module-scope mutation beyond
scratch allocation. Dependencies are `@flighthq/camera`, `@flighthq/entity`, `@flighthq/geometry`,
`@flighthq/mesh`, `@flighthq/node`, `@flighthq/scene3d`, `@flighthq/types` -- all imported via
`./contract`. No dependency on `@flighthq/sdk` or any render package. The SDK barrel re-exports picking
at both `.` and `./contract` and in the `scene3d` sub-barrel.

**Tests:** Two colocated test files with 27 test cases total. `pickScene3D.test.ts` covers creation,
nearest hit, multi-hit, camera picking, orthographic non-square viewport, ray picking, nearest-of-two
ordering, disabled mesh, disabled subtree pruning, predicate filtering, maxDistance rejection, rotated
and scaled mesh through local-space path, backface culling (front vs. back winding), triangle-strip
indexed pick, morph target with explicit update, and posed `deformedLocalBounds` broad-phase slot.
`sceneHitAttributes.test.ts` covers sentinel returns on fresh/null-node hits, material lookup, subset
index, UV0 interpolation, vertex normal under non-uniform scale, tangent with mirror flip, front-facing
check, and absent-channel guards. Test describe blocks are alphabetized and mirror exported function
names.

## Gaps

Concrete absences relative to AAA picking completeness and the charter's in-scope items.

1. **Charter decision unresolved: local transform duplication.** The 2026-07-03 charter decision says
   “Replace locally duplicated transform functions with `@flighthq/geometry` imports.” Two private
   functions remain in `pickScene3D.ts` -- `transformPointByMatrix4` (line 355) and
   `transformDirectionByMatrix4` (line 367) -- that operate on raw `Float32Array`. Geometry exports
   `matrix4TransformPoint` which takes `Matrix4Like` (the wrapper with `.m`), and has no
   direction-only (w=0) equivalent. The signature mismatch explains why the local copies persist, but
   the charter decision is not resolved: either geometry gains a direction transform and both packages
   converge on `Matrix4Like`, or the charter decision is revised.

2. **Uncommented `as unknown as` cast.** `pickScene3D.ts:191` casts `scene as unknown as Node3D` to
   strip `Readonly`. The codebase convention requires naming the constraint that forced the double cast
   in a comment; none is present.

3. **GPU-skinned narrow-phase tests bind-pose geometry.** The broad-phase reads
   `deformedLocalBounds` for posed meshes, but the narrow-phase ray-triangle test runs against
   `geometry.vertices`, which remain bind-pose for GPU-skinned meshes. Exact triangle picking of a
   skinned mesh requires a prior CPU skin update (`updateMeshSkin`). This is documented in the
   `intersectMeshTriangles` comment but represents a semantic gap: the broad-phase can admit a posed
   mesh whose narrow-phase then tests the wrong geometry.

4. **No InstancedMesh or LodMesh picking.** These are unrealized types in the SDK. The hit contract has
   no instance index, per-instance transform, or selected-LOD identity. Picking would need to consume
   the same prepared draw entry or an immutable snapshot of instance/LOD state to agree with rendering.

5. **No alpha-mask coverage awareness.** Transparent/cutout triangles remain pickable across their full
   geometric area. `pickScene3DAll` cannot filter using sampled material coverage.

6. **No point/line/gizmo threshold queries or region selection.** No frustum, box, or lasso selection.
   No proximity-threshold picking for non-triangle primitives.

7. **No BVH or spatial acceleration.** Brute-force per-triangle within each mesh. The charter correctly
   positions this as later than semantic correctness, and the broad-phase AABB test provides coarse
   rejection.

## Charter contradictions

1. **Local transform duplication contradicts 2026-07-03 decision.** The charter explicitly records
   “Replace locally duplicated transform functions with `@flighthq/geometry` imports.” The two local
   functions in `pickScene3D.ts` are functionally equivalent to what geometry could provide but use raw
   `Float32Array` signatures. Until either geometry adds direction-transform support and the local
   copies are removed, or the charter decision is revised, this is a contradiction.

2. **No other contradictions found.** The package is a thin composition layer (camera + scene) as the
   charter intends. `pickScene3D` and `pickScene3DAll` match the charter's API design. Multi-hit,
   filtering (predicate, maxDistance, backface cull), and hit normals are all present. The
   implementation does not duplicate ray-triangle intersection math (it uses
   `intersectRay3DTriangle` from geometry) or scene traversal logic (it reads children from
   `getNodeRuntime`). Types are homed in `@flighthq/types`. The package declares `sideEffects: false`
   and performs no top-level registration.

## Contract and docs fit

**(a) Package -> contract conformance:**

- Types are correctly homed in `@flighthq/types`: `Scene3DHit` and `Scene3DPickOptions` live there,
  exported on both the public and contract lanes. The package exports functions only.
- Full unabbreviated names on all 11 exported functions: `pickScene3D`, `pickScene3DWithRay3D`,
  `pickScene3DAll`, `pickScene3DAllWithRay3D`, `createScene3DHit`, `getScene3DHitMaterial`,
  `getScene3DHitSubsetIndex`, `getScene3DHitUv0`, `getScene3DHitVertexNormal`,
  `getScene3DHitVertexTangent`, `isScene3DHitFrontFacing`.
- `out`-param style with alias safety is consistent: miss returns leave `out` untouched. Documented in
  function comments.
- Sentinels on failure: `null` for missed picks and absent materials, `-1` for out-of-range subset,
  `false` for unavailable attribute channels. No throws.
- `sideEffects: false`, no top-level registration.
- Two export lanes (`.` and `./contract`) are correct.
- `Readonly<T>` used on all input parameters throughout both source files.
- `import type` on separate lines from value imports.
- Exported functions alphabetized within each file.
- Module-level scratch at file bottom in both source files.
- `createScene3DHit` uses `createEntity`, satisfying the Entity invariant.

**(b) Contract/docs -> reality candidate revisions:**

- **Package Map in `AGENTS.md`.** The line reads `picking` under the 3D-data grouping. Accurate.
- The `scene-picking` example exists under `examples/packages/scene-picking/` with both WebGL and
  WebGPU renderers, demonstrating real usage.

## Candidate open directions

Questions the charter does not answer that this review had to assume or leave open.

1. **Should `@flighthq/geometry` gain a `matrix4TransformDirection` function?** The charter decision
   says to replace local copies with geometry imports, but geometry has no w=0 direction transform for
   Matrix4. Either geometry adds one (and picking drops its local copy), or the charter decision is
   revised to acknowledge the intentional raw-array optimization in the tight inner loop.

2. **Should the broad-phase use `deformedLocalBounds ?? ensureMeshGeometryBounds(geometry)` as the
   MeshRuntime type comment prescribes?** Currently the fallback path calls `getNode3DWorldBounds`,
   which goes through `scene3d` and may compute differently. The two paths produce equivalent results
   for a rigid mesh, but the explicit convention in the `MeshRuntime` type comment names the
   `ensureMeshGeometryBounds` fallback.

3. **Should the NDC-to-screen coordinate mapping consume a Viewport contract?** The current API takes
   raw `screenX`/`screenY` in `[-1, 1]` NDC coordinates. The assessment backlog notes that a viewport
   contract would centralize the pixel-to-NDC mapping rather than requiring each caller to duplicate it.

4. **Should module-level scratch become caller-owned query scratch?** The non-reentrancy constraint is
   documented and acceptable for the current single-threaded JS target. If reentrancy becomes needed
   (e.g., a pick inside a pick callback, or a multi-threaded C/C++ port), the scratch would need to
   move to per-call allocation or a caller-provided context.
