# Geometry out-parameter completeness sweep

Date: 2026-08-05

## Contract checked

An operation that produces a whole value through `out` must initialize the whole output when
`out` is distinct from every input, and it must remain correct when `out` aliases an input. A
same-type input/output pair is the signal for a whole-value operation; a selected-component
setter, type conversion, or dimension reduction is not silently promoted to that contract.

The locator pass found 336 exported functions in the non-test geometry operation modules, 223
with a leading `out*` parameter, and 119 where a later read-only input has the same carrier type as
the output. Bodies, delegates, typed-array aliases, and every conditional path were then read
manually. A raw direct-write scan could not prove full initialization for 42 of the 119 surfaces;
those 42 form the candidate set below. The scan is only a locator: nested writes, `Float32Array`
aliases, loops, and delegates all require reading the implementation.

All read-only object inputs in the 119-surface same-carrier set are already annotated
`Readonly<>`. The only mutable object parameters after a leading output are additional outputs:
`decomposeMatrix4`'s `outRotation`/`outScale` and `getClosestPointBetweenRay3Ds`'s `outB`.

## Defects and exported surfaces fixed

- `translateMatrix` wrote only `tx` and `ty`; it now writes `a`, `b`, `c`, `d`, `tx`, and `ty`.
- `translateMatrixByVectorXY` had the same partial-write contract; it now writes all six fields.
- `translateMatrixByVector` delegates to `translateMatrixByVectorXY`, so it inherited the defect
  and the fix. It is a separate exported surface and has its own distinct-output and alias tests.

Each surface is tested with a non-identity linear transform so an identity-initialized distinct
output cannot hide a missing `a`/`b`/`c`/`d` write. Each is also tested with `out === source`.

## Rejected same-carrier candidates

These are all 39 locator candidates that were inspected and rejected. Each already establishes a
complete distinct output; no code change is warranted.

| Candidate | Rejection reason |
| --- | --- |
| `copyAabb` | Writes `min.{x,y,z}` and `max.{x,y,z}`; the locator did not flatten nested fields. |
| `expandAabbByPoint` | Writes all six nested min/max components. |
| `expandAabbBySphere` | Both the empty-sphere and normal paths write all six nested min/max components. |
| `intersectAabb` | Reads both inputs before writing all six nested min/max components. |
| `transformAabbByMatrix4` | Writes all six nested min/max components after computing the transformed center/extents. |
| `unionAabb` | Reads both inputs first, then writes all six nested min/max components. |
| `copyBoundingSphere` | Writes `center.{x,y,z}` and `radius`; the locator did not flatten `center`. |
| `mergeBoundingSphere` | Every return path writes `center.{x,y,z}` and `radius`. |
| `transformBoundingSphereByMatrix4` | Writes the transformed `center.{x,y,z}` and scaled `radius`. |
| `copyMatrix` | Delegates to the complete six-field `setMatrix` writer. |
| `inverseMatrixTransformPoint` | Delegates to the XY form, which writes both `Vector2Like` fields. |
| `inverseMatrixTransformVector` | Delegates to the XY form, which writes both `Vector2Like` fields. |
| `matrixTransformPoint` | Delegates to the XY form, which writes both `Vector2Like` fields. |
| `matrixTransformRectangle` | Delegates to `matrixTransformBounds`, which writes `x`, `y`, `width`, and `height`. |
| `matrixTransformVector` | Delegates to the XY form, which writes both `Vector2Like` fields. |
| `copyMatrix3` | `Float32Array.set` copies all nine elements. |
| `inverseMatrix3` | Every success path writes all nine elements; singular paths fill all nine with `NaN`. |
| `multiplyMatrix3` | Both affine and general paths write all nine elements. |
| `rotateMatrix3` | Writes all nine elements through the `out.m` alias. |
| `scaleMatrix3` | Writes all nine elements through the `out.m` alias. |
| `translateMatrix3` | Writes all nine elements through the `out.m` alias. |
| `transposeMatrix3` | Writes all nine elements through the `out.m` alias after preserving aliased reads. |
| `appendMatrix4` | Delegates to the complete 16-element `multiplyMatrix4` writer. |
| `appendRotationMatrix4` | Builds a rotation matrix and delegates through `appendMatrix4` to a complete writer. |
| `appendScaleMatrix4` | Builds a scale matrix and delegates through `appendMatrix4` to a complete writer. |
| `appendTranslationMatrix4` | Copies all 16 source elements when output is distinct, then replaces elements 12–14. |
| `copyMatrix4` | `Float32Array.set` copies all 16 elements. |
| `interpolateMatrix4` | Its 16-iteration loop writes every element. |
| `inverseMatrix4` | The success path writes all 16 elements; the singular path fills all 16 with `NaN`. |
| `multiplyMatrix4` | Reads both matrices into locals, then writes all 16 elements. |
| `prependMatrix4` | Delegates to the complete 16-element `multiplyMatrix4` writer. |
| `prependRotationMatrix4` | Builds a rotation matrix and delegates through `prependMatrix4` to a complete writer. |
| `prependScaleMatrix4` | Builds a scale matrix and delegates through `prependMatrix4` to a complete writer. |
| `prependTranslationMatrix4` | Builds a translation matrix and delegates to the complete `multiplyMatrix4` writer. |
| `rotateMatrix4` | Builds a rotation matrix and delegates to the complete `multiplyMatrix4` writer. |
| `scaleMatrix4` | Copies all 16 source elements when output is distinct, then replaces the nine scaled linear elements. |
| `translateMatrix4` | Copies all 16 source elements when output is distinct, then replaces elements 12–14. |
| `transposeMatrix4` | Copies all 16 source elements when output is distinct, then swaps the six off-diagonal pairs. |
| `expandRectangleToPoint` | Delegates to `inflateRectangle`, which writes all four rectangle fields. |

The other 77 same-carrier surfaces directly write every field of their output carrier on every
path. This includes all component-wise Vector2/3/4 operations, quaternion whole-value operations,
plane whole-value operations, the direct Matrix/Rectangle writers, and the remaining complete
bounding-volume operations; they did not enter the 42-candidate manual fallback set.

## Rejected type-shape and selected-component candidates

The broader "an input field is not written under the same name" heuristic crosses API shapes and
therefore produces false positives. The following families were inspected explicitly and rejected
before applying the same-carrier criterion:

- `projectVector3` deliberately reduces `Vector3Like` to `Vector2Like`; `z` is outside the output
  type. `projectVector4` deliberately reduces homogeneous `Vector4Like` to `Vector3Like` while
  consuming `w` in the perspective divide.
- `setVector2FromVector3` and `setVector3FromVector4` deliberately drop the higher-dimensional
  component. `setVector4FromVector3` writes all four output fields and supplies `w` explicitly.
- `copyMatrixColumnFromVector3`, `copyMatrixRowFromVector3`,
  `copyMatrix3ColumnFromVector3`, `copyMatrix3RowFromVector3`,
  `copyMatrix4ColumnFromVector4`, and `copyMatrix4RowFromVector4` are selected row/column mutators,
  not whole-matrix transforms.
- `copyMatrixColumnToVector3`, `copyMatrixRowToVector3`,
  `copyMatrix3ColumnToVector3`, `copyMatrix3RowToVector3`,
  `copyMatrix4ColumnToVector4`, and `copyMatrix4RowToVector4` are explicit matrix-to-vector
  projections and write every output-vector component.
- `setMatrixFromMatrix3`, `setMatrixFromMatrix4`, `setMatrix3FromMatrix`,
  `setMatrix3FromMatrix4`, `setMatrix4FromMatrix`, and `setMatrix4FromMatrix3` are explicit
  dimension/layout conversions. Each writes the complete destination representation, including
  required identity terms.
- `setVector2FromFloat32Array`, `setVector3FromFloat32Array`,
  `setVector4FromFloat32Array`, `setMatrixFromFloat32Array`,
  `setMatrix3FromFloat32Array`, and `setMatrix4FromFloat32Array` read a fixed-width array slice and
  write the complete typed destination.
- `writeVector2ToFloat32Array`, `writeVector3ToFloat32Array`,
  `writeVector4ToFloat32Array`, `writeMatrixToFloat32Array`,
  `writeMatrix3ToFloat32Array`, and `writeMatrix4ToFloat32Array` serialize a fixed-width value into
  an array slice. The array is a different carrier and elements outside the slice are intentionally
  preserved.
- `matrixTransformBounds`, `matrixTransformPointXY`, `matrixTransformVectorXY`,
  `matrix4TransformPoint`, `matrix4TransformVector`, `transformVector3ByMatrix3`,
  `getQuaternionEuler`, `rotateVector3ByQuaternion`, `getClosestPointOnPlane`,
  `getPlaneCoplanarPoint`, and `projectVector3OntoPlane` consume one carrier to produce every field
  of a different output carrier. Matrix/plane/quaternion fields have no namesake destination
  fields.
- `getRectangleBottomRight`, `getRectangleNormalizedBottomRight`,
  `getRectangleNormalizedTopLeft`, `getRectangleSize`, and `getRectangleTopLeft` are explicit
  rectangle-to-vector projections and write both vector fields.
- `getMatrix4Position` is an explicit Matrix4-to-Vector3 extraction and writes all three vector
  fields. `setMatrix4Position`, `setMatrix3Element`, `setMatrix4Element`, `setRectangleSize`, and
  `setRectangleTopLeft` are selected-component mutators with no same-type source value to copy.
- `matrix4TransformVectors` transforms the complete sequence of packed xyz triples supplied by its
  input length. It preserves no implicit fourth component because the documented carrier is a
  sequence of triples.

These rejections are why call-site count is not part of the criterion: exported whole-value
contracts must work for distinct outputs even with zero in-repository callers, while an explicit
projection or selected-component setter remains correct regardless of how many fields its source
type happens to expose.

## Existing test shape before this fix

- `translateMatrix` had only an aliased-output test.
- `translateMatrixByVector` had only a distinct-output test, but it asserted only `tx`/`ty`.
- `translateMatrixByVectorXY` had both distinct and aliased calls, but both asserted only `tx`/`ty`.

Therefore the pre-existing cases were not uniformly alias-only. The defect survived because no
distinct-output case asserted the complete six-field Matrix contract, and the three exported
surfaces did not each have the required distinct/aliased pair. Whether that assertion gap is
package-wide beyond this source sweep was not measured; this task does not change unrelated tests.
