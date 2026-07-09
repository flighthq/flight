---
package: '@flighthq/path-boolean'
updated: 2026-07-09
---

# path-boolean — Status

Directed 2026-07-09 for a full **AAA build, phased** (see charter Decisions). Correctness-first: each phase must pass its degeneracy-test bar before the next.

## Phase plan

- **Phase A — kernel + boolean ops (foundation).** Package scaffold + registration; the `PathBooleanBackend` seam (`setPathBooleanBackend`/`getPathBooleanBackend`/`createDefaultPathBooleanBackend`); the Martinez–Rueda default kernel; `unionPaths`/`intersectPaths`/`differencePaths`/`xorPaths` + `booleanPaths`; both fill rules (even-odd, non-zero); flatten-then-boolean over `flattenPath` with a tolerance. **Degeneracy tests:** disjoint, contained, overlapping, coincident edges, shared vertices, holes, self-intersecting input, empty/degenerate. This is the load-bearing pass.
- **Phase B — offsetting.** `offsetPath(path, delta, options)` with join types (miter + miterLimit / round / square / bevel) and end types (butt / round / square) for open paths; inflate and deflate. Tests: convex/concave joins, the miter-limit fallback, round-join arc tessellation, open vs closed, negative delta.
- **Phase C — simplify + clean.** `simplifyPath` (resolve self-intersections under a fill rule via the kernel) and `cleanPath` (epsilon-dedup coincident/near-collinear vertices). Tests: self-touching, spikes, duplicate points, collinear runs.
- **Phase D — batch + hardening.** `unionPaths` over an array (multi-path union), remaining op ergonomics, and a hardening pass widening degeneracy coverage + fuzz-style random-polygon round-trip invariants (`A ∪ B == B ∪ A`, `A ∖ A == ∅`, double-offset stability).

Each phase: dispatched to a builder, reviewed for geometry correctness, gated (`npm run check` + package tests + build), committed.

## State

Phase A in progress.
