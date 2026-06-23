# TS↔Rust Alignment: @flighthq/geometry

**Verdict:** Partially aligned — the 2D core (vector2/3/4, matrix/3/4, rectangle, typedarray, pools) maps 1:1 with correct snake*case naming, but the entire 3D math family (`aabb`, `boundingSphere`, `frustum`, `plane`, `quaternion` + `quaternionPool`) is unported and undocumented, and a few small naming divergences (`Float32Array→f32_slice`, extra `reserve*\*` aliases) are not recorded in the divergence map.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `aabb.ts` (`createAabb`, `setAabb`, `copyAabb`, `cloneAabb`, `setAabbFromPoints`, `expandAabbByPoint`, `getAabbCenter`, `getAabbContainsPoint`, `unionAabb`, `transformAabbByMatrix4`) | — (no `aabb.rs`) | **Unported module.** `Aabb` exists in `flighthq-types` (geometry.rs) and `flighthq-mesh` re-derives bounds inline (`compute_mesh_geometry_bounds`) instead of calling geometry's aabb ops. Missing port; not in the divergence map. |
| `boundingSphere.ts` (`createBoundingSphere`, `setBoundingSphere`, `copyBoundingSphere`, `cloneBoundingSphere`, `setBoundingSphereFromAabb`, `getBoundingSphereContainsPoint`, `transformBoundingSphereByMatrix4`) | — (no `boundingsphere.rs`) | **Unported module.** `BoundingSphere` is not even defined in Rust `flighthq-types`. Missing port; not in the divergence map. |
| `frustum.ts` (`createFrustum`, `setFrustumFromMatrix4`, `isFrustumContainingPoint`, `isFrustumIntersectingAabb`) | — (no `frustum.rs`) | **Unported module.** `Frustum` not in Rust types. Missing port; not in the divergence map. |
| `plane.ts` (`createPlane`, `setPlane`, `copyPlane`, `clonePlane`, `getPlaneSignedDistanceToPoint`) | — (no `plane.rs`) | **Unported module.** `Plane` not in Rust types. Missing port; not in the divergence map. |
| `quaternion.ts` + `quaternionPool.ts` (`createQuaternion`, `setQuaternion*`, `multiplyQuaternion`, `slerpQuaternion`, `normalizeQuaternion`, `conjugateQuaternion`, `equalsQuaternion`, `acquire*/release*/clearQuaternionPool`, `setMatrix4FromQuaternion`, `setQuaternionFromMatrix4`, `composeMatrix4`, `decomposeMatrix4`) | — (no `quaternion.rs`; no quaternion pool entries in `pools.rs`) | **Unported module.** `Quaternion` not in Rust types; `compose_matrix4`/`decompose_matrix4`/`set_matrix4_from_quaternion`/`set_quaternion_from_matrix4` are consequently absent from `matrix4.rs`. Missing port; not in the divergence map. |
| `setMatrixFromFloat32Array` / `writeMatrixToFloat32Array` / `setVector2FromFloat32Array` / `writeVector2ToFloat32Array` | `set_matrix_from_f32_slice` / `write_matrix_to_f32_slice` / `set_vector2_from_f32_slice` / `write_vector2_to_f32_slice` | Type word renamed `Float32Array → f32_slice`. Idiomatic (no `Float32Array` in Rust) but breaks "full type word preserved" and is **not recorded**. Add a one-line map note covering the `Float32Array→f32_slice` mechanical rename for the whole crate. |
| `reserveFloat32Array` / `reserveInt16Array` / `reserveUint16Array` (3 fns, `typedarray.ts`) | `reserve_float32_array` / `reserve_int16_array` / `reserve_uint16_array` **plus** extra `reserve` (generic), `reserve_f32`, `reserve_i16`, `reserve_u16` | The 3 named ports are correct. The 4 extra functions have no TS counterpart — `reserve<T>` is reasonable Rust infra, but `reserve_f32`/`reserve_i16`/`reserve_u16` short aliases are **extra-Rust drift** not in the map. |
| `matrixPool.ts`, `matrix3Pool.ts`, `matrix4Pool.ts`, `rectanglePool.ts`, `vector2Pool.ts`, `vector3Pool.ts`, `vector4Pool.ts` (per-type files) | `pools.rs` (all collapsed) + `pool.rs` (generic `Pool`) | File-name divergence: TS one-file-per-pool collapsed into `pools.rs`. Functions themselves map 1:1 (minus quaternion). Acceptable consolidation; worth a note since it breaks per-file basename tracking. |

## In sync

- **vector2 / vector3 / vector4** — every TS function ports 1:1 with correct `camelCase→snake_case` and full type words preserved (`getVector2DistanceSquared → get_vector2_distance_squared`, `nearEqualsVector3 → near_equals_vector3`, `createVector2FromPolar → create_vector2_from_polar`, `crossVector3 → cross_vector3`, `projectVector4 → project_vector4`, etc.). Axis constants match exactly: `VECTOR2_X_AXIS`/`VECTOR3_*_AXIS`/`VECTOR4_*_AXIS`/`VECTOR4_W_UNIT`.
- **matrix (2D affine)** — full 1:1 map including the transform-point/vector/bounds/rectangle family and `create/set_gradient_transform_matrix`, `create/set_transform_matrix`, `inverse_matrix_transform_*`.
- **matrix3 / matrix4** — full 1:1 map for all 2D/3D affine ops that don't touch quaternions: `is_affine_matrix3/4`, `set_matrix3_normal_from_matrix4`-adjacent ops, `append/prepend_*_matrix4`, `create/set_orthographic/perspective_matrix4`, `set_matrix4_look_at`-class ops, `interpolate_matrix4`, `transpose_matrix4`, element/row/column accessors. (Only the quaternion-coupled four are missing — see above.)
- **rectangle** — complete 1:1 map (getters/setters, `inflate`/`offset`/`merge`/`normalize`/`intersects`/`encloses`/`compute_rectangle_intersection`/`expand_rectangle_to_point`, flipped/empty predicates, normalized corner accessors).
- **Convention carry-through** — out-params → `&mut`, sentinel returns preserved (`inverse_matrix4 → bool`, `normalize_* → f32`), `acquire_*`/`release_*`/`clear_*_pool` pool brackets preserved, `Readonly<T> → &T`.
- **Crate name** — `@flighthq/geometry → flighthq-geometry`, identity (correct, no rename expected).

---

**Divergence-map actions suggested:**

1. Record the unported 3D family (`aabb`, `boundingSphere`, `frustum`, `plane`, `quaternion`/`quaternionPool`, and the four quaternion-coupled `matrix4` fns) as either a tracked TODO (the 3D pipeline — `scene`/`mesh`/`camera` — now exists in Rust, so these _should_ be ported, not excluded) or an explicit deferral with rationale. This is the largest gap and is currently silent because `geometry` is a `FOLDABLE_DEPS` target, so the conformance edge-check does not surface it. A per-export-presence check (already noted as planned in conformance.md) would catch this.
2. Add a one-line note for the crate-wide `Float32Array → f32_slice` mechanical rename.
3. Decide on the extra `reserve_f32`/`reserve_i16`/`reserve_u16` aliases — either record them as accepted Rust-idiom additions or drop them in favor of the `_array` ports + generic `reserve`.
