# Depth Review: @flighthq/geometry

**Domain:** 2D/3D linear-algebra math primitives — vectors (2/3/4), matrices (2D affine `Matrix`, `Matrix3`, `Matrix4`), quaternion, rectangle, and bounding volumes (AABB, sphere, plane, frustum), plus typed-array capacity helpers and per-type object pools.

**Verdict:** solid — **78/100**

The package is broad, internally consistent, and well implemented. It covers the full type roster a mature game/graphics math library carries (vec2/3/4, three matrix tiers, quaternion, AABB/sphere/plane/frustum) and the Flight conventions (out-params, alias-safety, `create`/`copy`/`set`/`clone`, pooled `acquire`/`release`) are applied uniformly and correctly. It falls short of "authoritative" because the per-type operation sets have real, non-design holes — most visibly the vector families are asymmetric (only `Vector2` has `interpolate`) and several canonical vector and quaternion operations are simply absent.

## Present capabilities

- **Vectors (vec2/3/4):** create / clone / copy / set, equals / nearEquals, add / subtract / negate / scale / offset, dot, length / lengthSquared, distance / distanceSquared, normalize (returns original length, zero-guarded), angleBetween (clamped acos). vec2 adds `createVector2FromPolar` / `setVector2FromPolar` and `interpolateVector2`. vec3 adds `crossVector3` and `projectVector3` (perspective divide to vec2); vec4 adds `projectVector4`. Float32Array bridges on vec2 (`setVector2FromFloat32Array`, `writeVector2ToFloat32Array`). Axis constants (`VECTOR3_X_AXIS`, etc.).
- **2D `Matrix` (affine a,b,c,d,tx,ty):** create / set / copy / clone / equals, identity, multiply, translate / rotate / scale, inverse, transform point / vector / XY variants, inverse-transform point / vector, `matrixTransformRectangle`, `matrixTransformBounds`, `createTransformMatrix` / `setTransformMatrix` (TRS compose), `createGradientTransformMatrix` (OpenFL gradient box), Float32Array I/O, and conversions to/from Matrix3/Matrix4.
- **`Matrix3` (3×3):** full set/copy/clone/equals, identity, multiply, translate/rotate/scale, inverse, transpose, element get/set, row/column ↔ vec3, `isAffineMatrix3`, normal-matrix from Matrix4, conversions from Matrix/Matrix4.
- **`Matrix4` (4×4):** the deepest type — multiply, append/prepend TRS, compose / decompose, inverse, transpose, determinant, transform point/vector(s), perspective & orthographic builders, `setMatrix4LookAt`, `setMatrix4FromQuaternion`, position get/set, `interpolateMatrix4`, `isAffineMatrix4`, row/column ↔ vec4, element access, from-2D and from-Matrix3.
- **Quaternion:** create / clone / copy / set, identity, equals, multiply, normalize, conjugate, slerp, from-axis-angle, from-Matrix4.
- **Rectangle:** the richest non-matrix type — contains / intersects / encloses, intersection, union (`mergeRectangle`), inflate, offset, normalize, empty test/set, flipped-axis tests, normalized corners, every edge/corner get/set, size. A genuinely complete OpenFL-grade `Rectangle`.
- **Bounding volumes:** AABB (create/set/copy/clone, fromPoints, expandByPoint, center, contains, union, transform-by-Matrix4), bounding sphere (from-AABB, contains, transform), plane (signed distance), frustum (from-Matrix4, contains-point, intersects-AABB). A coherent culling primitive set.
- **Infrastructure:** typed-array `reserve*` capacity helpers (Float32/Int16/Uint16) and per-type pools (`acquire*` / `acquireEmpty*` / `acquireIdentity*` / `release*` / `clear*Pool`) for every entity type. Pools and the entity/runtime wrapping are clean and consistent.

Implementation quality is high throughout: functions read inputs into locals before writing `out` (alias-safe), normalize/divide paths guard against zero, `angleBetween` clamps the cosine, and JSDoc is thorough. Test files are large and present for every source file.

## Gaps vs an authoritative math library

These are missing-by-omission, not missing-by-design — none conflict with the free-function / out-param style:

- **Vector lerp asymmetry (most important).** Only `interpolateVector2` exists. `interpolateVector3` / `interpolateVector4` are absent despite being staple operations and despite `interpolateMatrix4` and `slerpQuaternion` existing. This is an obvious symmetry hole.
- **Component-wise vector ops absent everywhere:** no `multiplyVector*` (Hadamard product) or `divideVector*`, no per-component `minVector*` / `maxVector*` / `clampVector*`. These are standard in glMatrix, three.js (`Vector3.multiply/min/max/clamp`), and Unity (`Vector3.Scale/Min/Max`).
- **`reflectVector*`** (reflect across a normal) — canonical for any vector library used in physics/lighting; absent on all three.
- **No `transformVector3ByMatrix3` / vec3-by-Matrix3 helper.** Matrix4 transforms vec3-shaped data, but there is no vec3↔Matrix3 multiply for normal/TBN math even though `setMatrix3NormalFromMatrix4` exists to build the matrix.
- **Quaternion is the thinnest 3D type relative to its canonical scope.** Present: multiply, normalize, conjugate, slerp, fromAxisAngle, fromMatrix4. Missing: `dotQuaternion`, `inverseQuaternion` (only conjugate, which differs for non-unit quats), `rotateVectorByQuaternion` (apply a quat to a vec3 — arguably the single most-used quaternion operation), Euler conversions (`setQuaternionFromEuler` / `getQuaternionEuler`), `setQuaternionFromUnitVectors` / look-rotation, `getQuaternionAngleBetween`, and `quaternionToMatrix4` (the forward direction of `setMatrix4FromQuaternion`). For a quaternion to stand alone it needs at least apply-to-vector, inverse, and Euler interop.
- **No vec3-from-spherical / vec3 polar helpers**, while vec2 has polar constructors — another asymmetry.
- **Plane is minimal:** `getPlaneSignedDistanceToPoint` only. A canonical plane offers `setPlaneFromPoints` / `setPlaneFromNormalAndPoint`, `normalizePlane`, `projectPointOntoPlane`, and ray/segment intersection. Likely acceptable as a frustum support type, but thin if judged as a plane primitive.
- **No ray / line-segment type** and no intersection routines (ray-AABB, ray-sphere, ray-plane, ray-triangle). A graphics math library at AAA scope usually includes a ray for picking; here picking presumably lives in `@flighthq/interaction`, so this may be a deliberate boundary — call out for the breadth review rather than treating as a depth defect.
- **No `getMatrix3Determinant`** to mirror `getMatrix4Determinant`, and no `Matrix4` equivalent of the 2D `matrixTransformBounds` / `matrixTransformRectangle` (3D AABB transform exists as `transformAabbByMatrix4`, so this is covered by a different type — acceptable).

## Naming / API-shape notes

- Naming is exemplary and on-spec: every function carries the full unabbreviated type word (`getVector3LengthSquared`, `inverseMatrixTransformPointXY`), `get*`/`is*`/`has*` prefixes are honored, `create`/`set`/`copy`/`clone` allocation verbs are consistent, and pool brackets (`acquire*`/`release*`) are paired per type.
- The three matrix tiers use distinct, discoverable suffix conventions (`Matrix` = 2D affine, `Matrix3`, `Matrix4`) with explicit cross-conversions in both directions — a clear, greppable design.
- Minor inconsistency: `Matrix4` transforms are spelled `matrix4TransformPoint` / `matrix4TransformVector` (type-prefixed), whereas the 2D matrix uses `matrixTransformPoint`. Both read fine, but the verb position differs across the two matrix families.
- `slerpQuaternion` and `interpolateMatrix4` set the precedent that interpolation belongs in this package; the absence of `interpolateVector3/4` reads as an oversight against that precedent, not a boundary decision.

## Recommendation

Treat as **solid, one focused pass from authoritative.** The structure, conventions, and implementation rigor are already at the target bar; the shortfall is operation coverage, not design. To close the gap within a session:

1. Add `interpolateVector3` / `interpolateVector4` (and `lerp` consistency) — highest-value, removes the most glaring asymmetry.
2. Round out the vector op set across vec2/3/4: component-wise `multiply`/`divide`, `min`/`max`/`clamp`, and `reflect`.
3. Deepen quaternion to canonical scope: `rotateVectorByQuaternion`, `inverseQuaternion`, `dotQuaternion`, `getQuaternionAngleBetween`, Euler get/set, and `setQuaternionFromUnitVectors`.
4. Add `getMatrix3Determinant` for symmetry and consider a vec3-by-Matrix3 transform for normal math.

Defer (raise to breadth/boundary review, do not resolve here): whether a `Ray` type and ray-intersection routines belong in `geometry` or in `interaction`/`scene`, and whether the minimal `Plane` should grow plane-construction/projection helpers or stay a frustum support type.
