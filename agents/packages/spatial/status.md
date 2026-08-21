---
package: '@flighthq/spatial'
updated: 2026-08-21
by: principal
---

# spatial — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Both dimensions are at exact function-level parity and both ship exactly one backend. Every 2D
operation has a 3D counterpart with the signature dimensionally extended (point gains `z`, ray gains
`dz`), and the policy layer — overflow, decline reasons, the guard, the notice formatter — is shared
unsuffixed because it is genuinely dimension-free. The seam split is ratified in
[spatial dimension seams](../../spatial-dimension-seams.md).

- **A uniform grid is the ONLY index structure, in either dimension.** That is the package's largest
  gap, and it bites hardest in 3D: a grid is pathological when object sizes vary widely or the world is
  unbounded, because an oversized object either spans a punishing number of cells or falls to the flat
  overflow list. The charter's open directions name a quadtree (P2), sort-and-sweep (P3), and a BVH and
  octree behind the 3D seam. None is built. The seam itself is the finished part: a second backend is a
  new `create*SpatialBackend3D` and nothing else moves.
- **Query coverage stops at point, ray, region, and pairs.** There is no sphere/radius query, which is
  the natural form for an explosion, an aggro radius, or audio falloff, and no frustum query, which is
  the single most common reason to keep a 3D index at all. Both are reachable over the existing region
  query as conservative candidate sets, which is the package's standing contract anyway — a pair is
  already documented as a candidate the caller narrow-phases. A frustum's own AABB is very loose for a
  long view frustum, so a useful version slices it along depth rather than querying one box.
- **Ray results are unordered and carry no entry parameter.** Picking and line-of-sight both want the
  NEAREST hit, so today every caller re-tests and sorts what the index hands back. Adding an entry `t`
  to the result changes the seam signature, which is why the review parked it rather than the work
  being hard.
- **There are no persistent pair events.** `querySpatialPairs` reports this frame's candidate set with
  no enter/stay/exit transitions, so a caller wanting "began overlapping" diffs two frames itself.
- **`updateSpatialObject` always removes and re-inserts.** No fast path exists for an object that moved
  within the cells it already occupied, which is the common case for a slow-moving body.
- **`MAX_INDEXED_CELLS_PER_OBJECT` is a module constant shared by both dimensions.** 1024 cells suits a
  2D grid better than a 3D one, where the same span cubes rather than squares; whether it should be
  per-grid is open in the charter.

## Log

- 2026-08-21 — Status file created. It had been the header and nothing else, with `updated: null`, so
  every session re-derived the package's shape and its gaps from source. Content here is from a survey
  of the current tree plus the charter, review, and assessment docs; no code changed.
