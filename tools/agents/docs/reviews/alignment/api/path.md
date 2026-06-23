# API Alignment: @flighthq/path

**Verdict:** Strong, idiomatic surface — naming, `Readonly`, type-import hygiene, and verb choice are all correct; the one real gap is that the two compute functions (`flattenPath`, `tessellatePath`) allocate per call with no `out`-parameter variant for hot-path (per-frame) use.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Medium | `tessellatePath` | Allocates a fresh `PathMesh` (two growing `number[]` buffers) on every call, with no out-param variant. The map's allocation rule reserves bare-verb allocation for `create*`/`clone*`/`acquire*` and asks transform/compute helpers to "write to an `out` parameter" so they are safe in hot loops. Tessellation is a per-frame shape-fill operation; today every frame re-allocates `vertices`/`indices` and all the internal scratch (`pts`, `ring`). | Add an out-writing form, e.g. `tessellatePathInto(path, out: PathMesh, tolerance?)` that resets and reuses `out.vertices`/`out.indices` (set `.length = 0`); keep `tessellatePath` as the allocating convenience over it. This matches the geometry-package pattern (allocating `create*` over a no-alloc `out` helper). |
| Medium | `flattenPath` | Same allocation concern: returns a newly allocated `number[][]` (array-of-contours) each call with no reusable-buffer variant. Named `flatten*` so the allocation is not signalled by the verb. Per-frame clip/fill consumers re-allocate the whole nested array each frame. | Provide an out/sink variant (e.g. `flattenPathInto(path, out: number[][], tolerance?)` clearing and reusing `out`, or a callback/sink form), keeping `flattenPath` as the allocating convenience. At minimum document that it allocates, since the verb does not imply it. |
| Low | `appendPathCurveTo` vs `appendPathCubicCurveTo` | Mild naming asymmetry: the quadratic curve is the unqualified `appendPathCurveTo` while the cubic is explicitly `appendPathCubicCurveTo`. A reader scanning the four `appendPath*` verbs cannot tell that the bare one is specifically quadratic without knowing the Flash `CURVE_TO` convention. | Acceptable as-is (it mirrors `PathCommand.CURVE_TO`/`CUBIC_CURVE_TO` and the canvas command vocabulary), but `appendPathQuadraticCurveTo` would make the degree explicit and symmetric. Keep only if the Flash-`CURVE_TO` lineage is intentionally preserved across the SDK. |

## Clean

- **Full, unabbreviated type word.** Every export carries the complete `Path` type word: `createPath`, `flattenPath`, `tessellatePath`, `appendPathMoveTo`, `appendPathLineTo`, `appendPathCurveTo`, `appendPathCubicCurveTo`. No abbreviation, no `getPathFoo` shorthand.
- **Globally unique names.** `createPath`, `flattenPath`, `tessellatePath`, and all `appendPath*` are unique across `packages/*/src` (verified by grep) — no root-barrel collisions.
- **Allocation verb is correct where it is used.** `createPath` is the only export that announces allocation, and it genuinely allocates a fresh `Path`. (The gap is the two compute functions that allocate _without_ a `create*` verb — see Findings — not a misnamed allocator.)
- **Mutation intent is explicit and correct.** The `appendPath*` mutators deliberately take a mutable `path: Path` (they push into `commands`/`data`), while the read-only consumers `flattenPath`/`tessellatePath` take `Readonly<Path>`. The `Readonly<>` default-on, opt-out-for-mutation rule is followed precisely.
- **No spurious throws.** No expected-failure path throws; unrecognized/`NO_OP` verbs are silently skipped in `flattenPath`, and the ear-clip guard in `tessellatePath` bails out (`break`) on degenerate/self-intersecting input rather than spinning or throwing — correct sentinel-style handling.
- **`import type` hygiene.** `path.ts` and `flattenPath.ts` both split the type-only import (`import type { Path, PathWinding }`) onto its own line, separate from the value import (`import { PathCommand }`). No mixed `import { type Foo, bar }`.
- **Cross-package types from `@flighthq/types`.** `Path`, `PathMesh`, `PathWinding`, and `PathCommand` are all imported from `@flighthq/types`; none are redefined inline. The package's only runtime dependency is `@flighthq/types`.
- **Booleans named correctly (internal).** Internal predicates use `is*` (`isEar`, `isPointInTriangle`); no `get*` returns a boolean.
- **Sensible defaults.** `createPath` defaults `winding` to `'nonZero'` with a comment explaining the clip-union rationale; `flattenPath`/`tessellatePath` default `tolerance = 0.25` consistently across both, keeping the pair symmetric.
