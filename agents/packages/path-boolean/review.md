---
package: '@flighthq/path-boolean'
status: solid
score: 85
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# path-boolean — Review

**Verdict:** solid — 85/100. All four chartered phases (boolean ops, offsetting, simplify, batch + hardening) are delivered and verified by ~100 tests including a seeded fuzz-invariant harness; the remaining distance to authoritative is the honest, documented kind — deflation instability on dense arcs, no open-path clipping, an O(n²) classification pass — not silent corruption.

## Present capabilities

- **Operation surface** (`booleanPaths.ts`): `booleanPaths(subject, clip, operation, out?, options?)` plus the named `unionPaths`/`intersectPaths`/`differencePaths`/`xorPaths`. Flatten-then-boolean over `flattenPath` with a controllable `options.tolerance` (default 0.25, the flattener's own). `out` is alias-safe against either input (tested both ways). Results are rebuilt via the path builders and forced `nonZero` (holes counter-wound) — documented in `writeContours`.
- **Backend seam** (`pathBooleanBackend.ts`): `getPathBooleanBackend` (lazy default install, no import side effect), `setPathBooleanBackend` (null resets to lazy default), `createDefaultPathBooleanBackend`. Swap-in verified by a test routing `unionPaths` through a stub backend. Contract (`PathBooleanBackend` in `@flighthq/types`) is plain-data contours in/out — wasm/native-implementable as chartered.
- **Martinez–Rueda kernel** (`martinezKernel.ts`, 689 lines): two deliberately separated stages — (1) sweep-line arrangement with an event min-heap, binary-search status insertion, neighbor-only intersection tests, proper-crossing splits and collinear-overlap subdivision; (2) a static classification pass that merges coincident sub-segments by geometry (summing per-operand winding deltas), classifies each unique segment by winding sampled perpendicular to its midpoint on both sides, orients kept edges fill-on-left, and traces rings via most-clockwise next-edge selection (`DirectedGraph`). Sweep comparators (`compareSegments`/`compareEvents`) are exact-comparison total orders; tolerance lives only in the geometric tests. The static-classification design is why coincident/overlapping edges classify correctly.
- **Fill rules**: `evenOdd`/`nonZero` on the public options; the kernel contract takes the path-boolean-local superset `PathBooleanFillRule` adding `positive`/`negative` (`isInside`), reachable only through the seam — `offsetPath` uses `positive` as its Clipper-style cleanup fill. All four rules unit-tested, including the same-winding self-overlap and pentagram discriminators (the status log's corrected mental model — the bowtie does *not* discriminate).
- **Epsilon strategy**: magnitude-relative — kernel vertex snap `extent · 1e-9` computed per call (`computeVertexSnap`), offset point epsilon likewise (`getContourPointEps`); `INTERSECTION_EPS` scales by squared edge lengths in each test; `PARALLEL_EPS` operates on unit-vector cross products. Scale invariance proven across a 1e9 coordinate span for both the kernel and `offsetPath`.
- **`offsetPath`** (`offsetPath.ts`): signed inflate/deflate against canonical shoelace orientation; miter (with `miterLimit`→bevel fallback, Clipper2 default 2), bevel, round (arc tessellated to `arcTolerance`), square joins; butt/round/square end caps for open contours (stroked via a doubled vertex loop); concave inner-miter emission dissolved by the positive-fill self-union; global collapse detection (winding inversion or unreduced area) drops over-deflated rings → empty path sentinel.
- **`simplifyPath`** / **`unionAllPaths`** / **`resolvePathRegions`**: simplify is the Clipper `SimplifyPaths`/Skia `Simplify` self-union under the caller's fill rule; `unionAllPaths` folds N paths through one kernel pass with an alias-safe `out`; `resolvePathRegions` is the shared "raw rings → clean outline" primitive both offset and simplify compose over — deliberately kept out of the barrel (file-exported for its colocated test only).
- **Fuzz coverage** (`fuzzInvariants.test.ts`): deterministic xorshift32, constant seeds, 8 invariants × 40 iterations — union commutativity, A∖A=∅, A∪A=simplify(A), simplify idempotence, unionAllPaths[A]=simplify(A), offset-zero identity, convex miter double-offset stability (±3%), concave-offset self-intersection-freeness. The status log records that the round-join double-offset invariant genuinely failed and was re-scoped to the well-defined miter/convex case rather than tolerance-papered — the right correctness-first behavior.

## Gaps

Against a Clipper2/paper.js/CGAL-class library:

- **Open-path (polyline) clipping.** The kernel treats every contour as a closed region (`fillQueue` drops <3-vertex contours and closes every ring); intersecting/differencing a polyline against a closed clip region — a standard Clipper2 capability — does not exist. Blocked upstream: `flattenPath` does not carry per-subpath closedness, which is also why `offsetPath`/`cleanPath` infer closedness from endpoint coincidence (the documented open-polyline-with-coincident-endpoints misclassification).
- **Curve inputs.** Flatten-first only; the tolerance is controllable but the result is always a polygon outline. The charter *explicitly* rules curve-preserving boolean out of scope, so this is a boundary, not a defect — noted here only because it is the headline difference from Skia PathOps.
- **Deflation robustness on dense tessellation.** Inner-miter intersection of near-collinear edges shorter than |delta| loses area badly (observed 40–94% on round-join double-offset). Known, documented, and excluded from the fuzz invariant rather than hidden; a real fix wants edge-length-aware inner joins or vertex-routing restricted to genuine reflex corners.
- **Minkowski operations.** No `minkowskiSumPaths`/`minkowskiDifferencePaths` (Clipper2 ships both). Charter is silent.
- **Result hierarchy.** Output is a flat counter-wound ring set; there is no PolyTree-style parent/hole nesting query (Clipper2's `PolyTree64`), which consumers doing per-region processing eventually want.
- **Performance/allocation posture.** Correctness-first by explicit kernel-comment decision: O(n²) static classification (`windingAt` scans all segments per sample), string-keyed `Map`s in `mergeCoincidentSegments`/`DirectedGraph.vertex`, linear `findStatus`, per-event object allocation. Fine for the chartered "modest polygon sizes"; a perf tier is what the seam exists for (Clipper port / wasm drop-in).
- **Numerical robustness story.** Floating-point with relative epsilons, not exact predicates or snap-rounding. The comparators are exactly ordered and the fuzz harness exercises 40 messy self-overlapping polygons, but adversarial near-degenerate input has no hard guarantee — consistent with the "most-robust kernel we can actually get right" decision.
- **API symmetry.** `offsetPath` and `simplifyPath` return fresh paths with no `out?` parameter, while `booleanPaths`/`unionAllPaths` take one; the charter's out-param decision reads as the package-wide convention.
- **Batch symmetry.** Only union has an N-way form; no `intersectAllPaths` etc. (charter chartered batch *union* only — minor).
- **Diagnostics.** Silent sentinels (empty path from over-deflation collapse, degenerate input, dropped rings) have no `explain*` query or guard module, which the SDK diagnostics convention asks for.

## Charter contradictions

None found. Every 2026-07-09 decision is realized: per-operation API, both public fill rules, Martinez default behind the seam, positive-fill offset cleanup, phased degeneracy bars. Two mild *drift* items (charter-side, not code-side) are listed under candidate revisions: `clean` landed in `@flighthq/path` as `cleanPath`, and the `@flighthq/geometry` dependency the Boundaries mention was deliberately dropped in Phase A.

## Contract & docs fit

- **Types-first**: all shared types (`PathBooleanOperation`, `PathBooleanOptions`, `PathBooleanBackend`, `PathBooleanContour`, `PathBooleanFillRule`, `PathOffsetJoin`/`PathOffsetEnd`/`PathOffsetOptions`) live in `@flighthq/types`, one concept per file, well-commented. ✔
- **Naming**: full unabbreviated `*Path`/`*Paths` names, globally self-identifying. ✔ Sentinels-not-throws: no `throw` anywhere; empty paths for expected-empty results. ✔ Single root `.` export, `sideEffects: false`, deps `path` + `types` only. ✔ Barrelled in `@flighthq/sdk`. ✔
- **Module-scoped mutable kernel state** (`vertexSnap`, `nextEventId`): never touched at import time (side-effect-free holds) and single-entrant by construction; a re-entrant backend (one that computes a boolean inside `computePathBoolean`) would corrupt the snap. Acceptable, documented in source; worth a durable comment on the seam if backends proliferate.
- **Candidate doc revisions**: (a) charter Boundaries still says "(and `@flighthq/geometry` for vector math)" — the dep was dropped and status says keep it dropped; (b) charter's AAA decision lists **clean** in this package's scope, but `cleanPath` correctly lives kernel-free in `@flighthq/path` — the charter should record that split; (c) the Package Map's "the full AAA set" is accurate for the *chartered* scope (curve-preserving out, all four phases in) but overstates against Clipper2 itself (no open-path clipping, no Minkowski) — a light temper ("the full chartered AAA set") would make it exact; (d) `status.md` front matter lacks the contract's `by:` key.

## Candidate open directions

- **Open-path clipping** — in scope? Requires `flattenPath` to carry per-subpath closedness (a `@flighthq/path` change) and a kernel notion of unclosed subject edges. Also the real fix for the closedness-inference caveat in offset/clean.
- **Minkowski sum/difference** — Clipper2-parity feature the charter is silent on.
- **PolyTree-style hierarchical result** — should the seam grow a nesting-aware result shape, or stay flat rings?
- **Deflation hardening** — edge-length-aware inner joins for densely tessellated rings: kernel-adjacent geometry work, likely its own gated pass.
- **Perf-tier kernel** — the chartered Clipper-faithful port / wasm `path-boolean-rs` swap-in; when does it earn its build?
