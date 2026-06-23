# Filename Alignment: @flighthq/node

**Verdict:** Single-implementation domain package (not a backend-variant package — no `gl`/`canvas`/`dom`/`wgpu` prefixing applies); every source file is named after a coherent domain or trait object and passes the folder-removal test. No renames required; one minor casing observation on the `hasTransform2d` / `hasTransform3d` pair.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `hasTransform2d.ts` | Minor: convention example shows `HasTransform2D → transform2D.ts` (capital `D`). This file keeps the `has` trait prefix (consistent with its sibling `has*` trait files and the exported `HasTransform2D` type) but lowercases the `d`. Not a misnaming — the file self-describes the trait — only a `2D`/`2d` casing inconsistency vs the type name `HasTransform2D`. | (optional) `hasTransform2D.ts` to match the `2D` token in the type name |
| `hasTransform3d.ts` | Same minor `3D`/`3d` casing point as above. | (optional) `hasTransform3D.ts` |

No files are named after a single function; no generic dumping-ground names (`data.ts`, `utils.ts`, `helpers.ts`, `math.ts`, `common.ts`) exist. `index.ts` is a thin barrel.

## Clean

- `boundsRectangle.ts` — bounds domain (compute/ensure/get/set bounds rectangle, width, height).
- `hasAppearance.ts` — `HasAppearance` trait object.
- `hasBoundsRectangle.ts` — `HasBoundsRectangle` trait object (init trait + runtime trait).
- `hasClip.ts` — `HasClip` trait object.
- `hasMaterial.ts` — `HasMaterial` trait object.
- `hasTransform2d.ts` — `HasTransform2D` trait object (name self-describing; see casing note).
- `hasTransform3d.ts` — `HasTransform3D` trait object (name self-describing; see casing note).
- `hierarchy.ts` — child-management / parent-child graph domain (add/remove/swap/contains/getParent/getRoot/child index).
- `node.ts` — the `Node` entity/runtime object (create, runtime, signals, enabled).
- `revision.ts` — revision + invalidation domain (revision getters, `invalidateNode*`).
- `transform2d.ts` — 2D transform domain (local/world matrix, vector global↔local conversion).
- `transform3d.ts` — 3D transform domain (matrix4, vector3 conversion).
- `viewport.ts` — `Viewport` object (create + align/fill/fit/render-transform compute).
- `index.ts` — package barrel.
- Tests: all colocated as `<source>.test.ts`, mirroring each source filename exactly.
