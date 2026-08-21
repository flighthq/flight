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

- **3D has two backends; 2D still has one.** `createBvhSpatialBackend3D` is a dynamic bounding-volume
  hierarchy beside the uniform grid, and it is the structure to reach for when object sizes vary widely
  or the world is unbounded — the cases where a fixed cell length is wrong everywhere. Leaves carry FAT
  bounds so a small move needs no reinsertion, which is what makes it usable as a physics broadphase;
  traversal uses the fat box and the leaf test uses the exact one, so results match the grid rather than
  reporting the margin as overlap. 2D still has only the grid, and the charter's quadtree (P2),
  sort-and-sweep (P3), and octree remain unbuilt.
- **The two backends agree on QUERIES and deliberately not on PAIRS.** Region, point, and ray return the
  same sets, down to the shared boundary conventions — strict inequality for region overlap, half-open
  `[min, max)` for point containment. `querySpatialPairs` is different in kind: the grid emits every
  object sharing a cell WITHOUT testing bounds, so its answer is a strict superset, while the tree tests
  overlap at the leaf and returns the true set. Both satisfy the contract, which promises candidates and
  not a particular approximation. A test asserting the two produce equal pair sets is asserting
  something the seam never said.
- **The indexing MODE vocabulary is grid-shaped.** A BVH reports `'cells'` with a bucket count of zero,
  because `'cells'` is the only member meaning "indexed normally" and the explanation type already
  anticipates a bucketless structure. The name is wrong for a tree; renaming it would change a
  vocabulary both dimensions and every backend share, so it is left as an open naming question.
- **A backend reports only FAULTS to the guard, never ordinary success.** Both grids did; the BVH also
  reported every successful insert and update, which made the guard fire once per object per step —
  2,000 notices for 20 bodies over 100 steps, against the grid's zero — and burying the one notice that
  matters is the same failure as omitting it. It also stayed silent on `remove` of an id it never held,
  where both grids report `missing-id`. Both are fixed and now pinned DIFFERENTIALLY against the grid:
  the queries were compared across backends from the start, the notices were not, which is how this
  shipped. The notice text names the unsuffixed backend methods, since a notice carries no axis from
  which to pick a dimensioned name and 3D notices were being described with 2D function names.
- **3D has sphere and frustum queries; 2D has neither, so the dimensions are no longer at parity.**
  `querySpatialSphere3D` and `querySpatialFrustum3D` are built over the region query rather than on new
  backend methods, so the ratified eight-method seam did not widen and every future backend answers them
  for free. Both return CANDIDATE sets, matching what `querySpatialPairs3D` already promises. The
  frustum covers its volume with `slices` boxes taken along DEPTH rather than one box around the whole
  thing: a long perspective frustum's own AABB approaches the whole world, so a single-box version culls
  nothing. The 2D side has no circle query; whether it wants one is open.
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

- 2026-08-21 — BVH guard behaviour brought to grid parity: no notice for ordinary success, a
  `missing-id` notice for `remove` and `update` of an id the tree never held. Notice text is now
  dimension-neutral. Found by counting notices under an ordinary physics3d step loop rather than by
  reading the code.
- 2026-08-21 — `createBvhSpatialBackend3D` landed, the seam's first second backend. Tested
  DIFFERENTIALLY against the uniform grid rather than against itself, which caught two things a
  self-consistent test would not: the grid uses strict inequality for region overlap and half-open
  `[min, max)` for point containment, so an inclusive tree disagreed with it on every exactly-touching
  boundary; and `querySpatialPairs` is a candidate set the two backends legitimately approximate
  differently, so the equality the test first asserted was never owed.

- 2026-08-21 — Status file created. It had been the header and nothing else, with `updated: null`, so
  every session re-derived the package's shape and its gaps from source. Content here is from a survey
  of the current tree plus the charter, review, and assessment docs; no code changed.
