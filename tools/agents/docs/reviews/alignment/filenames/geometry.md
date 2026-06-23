# Filename Alignment: @flighthq/geometry

**Verdict:** Single-implementation domain package (no backend variants), so no backend prefix applies — filenames take plain domain/object names, and nearly all do; the only weak spots are `typedarray.ts` (generic JS-type name carrying no geometry domain, plus inconsistent casing vs. the package's camelCase norm) and a casing nit on `aabb.ts`/`typedarray.ts` relative to `boundingSphere.ts`.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `typedarray.ts` | Generic JS-type name — names the language primitive (`TypedArray`) rather than the geometry domain it serves. Its exports are capacity-growth helpers (`reserveFloat32Array`, `reserveInt16Array`, `reserveUint16Array`), i.e. the typed-array _capacity/reserve_ concern the package map calls "typed-array capacity helpers". Also lowercased, unlike the package's camelCase norm (`boundingSphere.ts`). | `typedArrayCapacity.ts` (names the domain: typed-array capacity growth). Acceptable fallback: `typedArray.ts` if the file is meant to be the general typed-array home, but the capacity name is more self-describing. |
| `aabb.ts` | Minor casing nit only — acronym lowercased while the type is `AABB`. Still self-describing (names the object). Listed for consistency, not as a real defect; rename optional. | `aabb.ts` is fine; `AABB.ts` would mirror the type but conflicts with the lowercase-first file norm. Leave as-is. |

## Clean

These all name a domain/object and pass the "remove the folder" test — each bare filename identifies its type/concept at a glance, and pools are correctly named after the pooled object plus the `Pool` suffix (a legit object-level concern, not a per-function file):

- `aabb.ts` (self-describing object; casing nit noted above is non-blocking)
- `boundingSphere.ts`
- `frustum.ts`
- `matrix.ts` (the 2D `Matrix`)
- `matrix3.ts`
- `matrix4.ts`
- `plane.ts`
- `quaternion.ts`
- `rectangle.ts`
- `vector2.ts`
- `vector3.ts`
- `vector4.ts`
- `matrixPool.ts`
- `matrix3Pool.ts`
- `matrix4Pool.ts`
- `quaternionPool.ts`
- `rectanglePool.ts`
- `vector2Pool.ts`
- `vector3Pool.ts`
- `vector4Pool.ts`
- `index.ts` (thin barrel: 20 `export *` re-exports, no dumping-ground logic)

Every source file has a colocated `<source>.test.ts` mirroring its name — test colocation is fully aligned.
