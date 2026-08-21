---
package: '@flighthq/collision'
updated: 2026-08-21
by: principal
---

# collision — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **3D now carries seven kinds, six closed-form pairs, and the same diagnostics as 2D.** Sphere, aabb,
  box, capsule, cylinder, cone, and convex all register support functions;
  `registerBuiltInCollisionPairTests3D` adds closed-form sphere-sphere, sphere-aabb, sphere-box,
  sphere-capsule, capsule-capsule, and aabb-aabb over the GJK/EPA floor. Box-box is deliberately left
  on the floor: a box boundary is FLAT, so EPA's normal on it is already exact and only speed would
  argue for a hand-written fifteen-axis SAT.
- **The 2D core is proven under the 3D work.** `testCollision2D` dispatches through the pair registry
  then the support floor, the ten SAT pairs register via `registerBuiltInCollisionPairTests2D`, and the
  generic core agrees with all ten incumbents EXACTLY over 4000 seeded pairs — same overlap decision,
  same depth to 1e-5, same normal to the measured 4e-3 EPA ceiling, same sign, no exemptions.

- **Registration is now a precondition of the generic dispatcher, and nothing registers at module
  load.** A caller that opens neither door gets `false` from every pair. That is deliberate — it is
  what makes the ten SAT pairs tree-shakable — and `explainCollisionTest2D` reports
  `'unsupported-shape-kind'` rather than `'separated'` for a valid shape whose kind has no binding, so
  the mistake is diagnosable. The direct typed pair functions need no registration at all.

- **EPA's normal on a CURVED boundary has a far worse TAIL than "a few parts in a thousand".** The
  typical case is excellent and the worst case is not, and only the worst case matters for a contact
  normal. Measured over a seeded 3D sphere-sphere sweep against the exact centre line: median dot
  0.9999999999, p5 0.99998, **worst 0.9656 — a fifteen degree error**. Depth stays good (median 6e-10,
  p95 1.7e-5, tail 2.6e-3) while the closed form's own depth error never exceeds 4.4e-16. Inherent:
  EPA terminates on a DISTANCE, and distance is second-order insensitive to angular error, so a nearly
  converged depth can sit on a facet pointing measurably the wrong way. That tail, not the median, is
  what a closed-form pair buys, and it is why the five curved 3D pairs earn their place on conditioning
  as well as speed. `shapeCollision3D.test.ts` carries the numbers and the tolerances derived from them.
- **Every dimension-specific name in this package now carries its dimension, identifiers AND modules.**
  The 25 formerly bare exports — ten SAT pairs, five `testSegment*`, ten `collide*ContactManifold` —
  are suffixed `2D`, and eight files moved alongside them (`manifold.ts` to `manifold2D.ts`,
  `shapeCollision.ts` to `shapeCollision2D.ts`, and so on), so every 2D module sits beside its 3D twin
  under the same name. Module names are public API in the port — a file maps to one Haxe module — so an
  unsuffixed `manifold.ts` would have exported a type named for the concept rather than the dimension.
  `contactFeatureId.ts` deliberately keeps its bare name: packing two feature indices into one integer
  is dimension-free, and suffixing it would make a reusable utility look 2D-only.
- **The 2D capsule is complete through the contact matrix.** `CollisionCapsule2D` reaches every seam —
  validation, containment, bounds, transform, mass/inertia, debug geometry, segment overlap, raycast —
  and `capsuleContact2D.ts` adds the five manifold pairs (circle, capsule, aabb, obb, polygon), so a
  capsule is a usable rigid-body collider, and `sweepCollisionShape2D` answers for it too, so it also
  works as a CCD bullet. The capsule is done across every 2D seam.
  The manifold is a separating-axis search rather than a distance reduction, and the candidate set is
  what makes it exact: polygon face normals, the capsule's own two side normals, and the direction from
  each polygon VERTEX to the nearest point on the capsule's axis. The vertex axes are not optional — at
  a corner the deepest direction is radial from that corner and matches no face normal of either shape.
- **More shapes.** 2D rounded polygon, and a general concave-as-convex-decomposition path.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-21** — The capsule sweep closed the last gap, by decomposing each capsule into the two discs
  and the rectangle whose UNION it exactly is and taking the earliest impact among the pieces: the time of
  impact of a union IS the minimum of its parts, so no new continuous geometry was written. Two defects
  the differential march caught. The capsule branch sat AFTER the circle branches, so circle-versus-capsule
  fell into the circle path, asked a capsule for polygon vertices, got none, and reported a clean miss —
  a tunnelling bullet, and silent, because a sweep reporting no hit looks exactly like a clear path. And
  the piece decomposition was first held in module SINGLETONS, which this file's own nested-sweep test
  clobbers; it lives in the pooled scratch now, like everything else here, for exactly that reason.

- **2026-08-21** — The capsule's contact manifolds landed, and a differential instrument found three real
  defects that hand-written expectations would not have. (1) capsule-capsule cannot reduce to the distance
  between the two AXES: two capsules crossing in an X have axes at distance zero and are deeply
  interpenetrating, so that reduction reported a depth of `rA + rB` that did not separate them — clearing
  a crossed pair means moving far enough for the SEGMENTS to clear, a distance set by their lengths.
  (2) the face-span clip fabricated two points for a near-END-ON capsule, placing them inside the shape by
  stepping `radius` along a normal nearly parallel to the axis; a span is only meaningful when the
  capsule's flat side faces the face. (3) a single contact point must be the SUPPORT point in `-normal`,
  not the closest axis point, or it sits `radius * |sin(angle)|` from the axis and is again inside.
  After all three: over 1383 seeded overlapping pairs, pushing A by `normal * depth` separates every one,
  and every contact point lies on the capsule's surface to 5.6e-16.

- **2026-08-21** — The 2D capsule landed as far as the contact matrix, deliberately stopping short of it
  rather than shipping a shape the solver silently ignores. Two findings worth keeping. The inertia is
  NOT the rectangle's plus a disc's about the centre: each end cap's centroid is a further `4r/(3*pi)`
  outboard of the circle centre it is drawn about, leaving a cross term that a naive parallel-axis step
  drops and that under-reports a long capsule — grid integration agrees with the corrected form to 0.001%
  across axis-aligned, diagonal, degenerate, and long-thin cases. And the raycast is the union of two
  discs and a rectangle rather than a fourth hand-rolled quadratic, which is only safe because the
  rectangle's flat END faces can never be the first surface: a ray crossing `x = 0` does so inside the
  first disc, which it therefore entered strictly earlier.

- **2026-08-21** — 25 exports and 8 modules took a `2D` suffix, closing the naming asymmetry; renamed with
  a negative lookahead because every 3D name has its 2D twin as a prefix.
- **2026-08-21** — Cylinder and cone landed across every 3D seam; a brute-force containment scan caught an
  inverted cylinder CAP normal no unit test had, and the cone's inertia is grid-checked because the
  textbook transverse moment is quoted about the APEX.
- **2026-08-21** — `explainCollisionTest3D` and `getCollisionShapeValidationStatus3D` now exist; both had
  been cited by source comments for some time without being written.
- **2026-08-21** — The differential test found a real defect in the incumbent: the SAT paths oriented their
  manifold normal by comparing centroids while the winning side was already computed and thrown away.
- **2026-08-21** — EPA tie-break canonicalized into a half-plane with a lexicographic fallback; the
  centroid rule applied unconditionally was tried first and took disagreements from 4 to 47.
- **2026-08-20** — The dimension boundary and the support-function core landed (`collisionSupport2D.ts`,
  `gjk2D.ts`); three bugs the tests caught, one of them in the test's own polygon generator.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract; all five previously-open items checked out
  false and were deleted.
- **2026-07-29** — Contact manifolds landed as a parallel lane, with feature ids packed by positional
  multiplication in the private `contactFeatureId.ts`.
- **2026-07-10** — Phase 1 built: ten manifold pair tests over a shared SAT core, the kind-ranked
  dispatcher, containment, and five segment queries. Frozen conventions: the normal pushes **A out of B**;
  touching is exclusive for manifolds and inclusive for containment/segment queries.
