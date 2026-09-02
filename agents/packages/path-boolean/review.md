---
package: '@flighthq/path-boolean'
status: solid
score: 85
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - source
  - types
---

# path-boolean -- Review

Re-review against the live tree (`packages/path-boolean/src/`, 8 source modules including `index.ts`/`contract.ts`, 7 colocated test files, 100 test cases including 8 fuzz invariants at 40 iterations each). No code changes since the prior 2026-07-13 review; the 2026-08-08 status rewrite corrected two false carry-forward items (positive fill rule and absolute epsilons) and consolidated the Open list. All claims below verified against source.

## Verdict

**solid -- 85/100.** All four chartered phases (boolean ops, offsetting, simplify/clean, batch + hardening) are delivered. The Martinez--Rueda kernel correctly separates arrangement from classification, magnitude-relative epsilons track coordinate scale across a proven 1e9 span, and the fuzz harness exercises 8 invariants at 40 iterations with constant seeds. The remaining distance to authoritative is honest, documented limits -- deflation instability on dense arcs, no open-path clipping, O(n^2) classification, missing diagnostics seam -- not silent corruption.

## Present capabilities

- **Operation surface** (`booleanPaths.ts`, 78 lines): `booleanPaths(subject, clip, operation, out?, options?)` plus four named wrappers `unionPaths`/`intersectPaths`/`differencePaths`/`xorPaths`. Flatten-then-boolean via `flattenPath` with controllable `options.tolerance` (default 0.25). `out` is alias-safe against either input (tested both ways in `booleanPaths.test.ts`). Results rebuilt via `writeContours`, forced to `nonZero` winding (holes counter-wound).
- **Backend seam** (`pathBooleanBackend.ts`, 28 lines): `getPathBooleanBackend` (lazy default install, no import side effect), `setPathBooleanBackend` (null resets to lazy default), `createDefaultPathBooleanBackend`. Swap-in verified by a test routing `unionPaths` through a stub backend (`booleanPaths.test.ts:144-155`). The `PathBooleanBackend` interface in `@flighthq/types` is plain-data contours in/out -- wasm/native-implementable as chartered.
- **Martinez--Rueda kernel** (`martinezKernel.ts`, 693 lines): two deliberately separated stages. (1) Sweep-line arrangement with a binary min-heap event queue (`EventHeap`), binary-search status insertion (`insertStatus`), neighbor-only intersection tests (`possibleIntersection`), proper-crossing splits (`divideSegment`) and collinear-overlap subdivision (`divideIfInterior`). (2) Static classification: `mergeCoincidentSegments` folds coincident sub-segments by snapped string key, summing per-operand winding deltas; `classifySegments` samples winding perpendicular to each segment's midpoint via `windingAt` (downward ray), evaluates the boundary test via `combine`/`isInside`, and orients kept edges fill-on-left; `traceRings` chains the directed edges via most-clockwise next-edge selection (`DirectedGraph`). Sweep comparators (`compareSegments`/`compareEvents`) use exact comparisons for a transitive total order; tolerance lives only in geometric tests.
- **Fill rules**: `evenOdd`/`nonZero` on public options; the kernel-level `PathBooleanFillRule` superset adds `positive`/`negative` (`isInside` at `:509-519`), reachable only through the backend seam. `offsetPath` uses `positive` for its Clipper-style cleanup fill. All four rules unit-tested in `martinezKernel.test.ts`, including the same-winding self-overlap and pentagram discriminators.
- **Epsilon strategy**: magnitude-relative throughout. Kernel vertex snap `extent * 1e-9` computed per call (`computeVertexSnap` at `:537`). `INTERSECTION_EPS` (1e-12) scales by squared edge lengths in each orientation test (`:273`, `:388`, `:397`). `PARALLEL_EPS` (1e-12) operates on unit-vector cross products. Offset point epsilon likewise relative (`getContourPointEps`). Scale invariance proven across a 1e9 coordinate span for both the kernel (`:273-288`) and `offsetPath` (`:172-185`).
- **`offsetPath`** (`offsetPath.ts`, 399 lines): signed inflate/deflate against canonical shoelace orientation. Four join types: miter (with `miterLimit` defaulting to Clipper2's 2, falling back to bevel), bevel, round (arc tessellated to `arcTolerance`), square. Three end-cap types for open contours: butt, round, square. Concave inner-miter emission dissolved by positive-fill self-union via `resolvePathRegions`. Global collapse detection (winding inversion or unreduced area) drops over-deflated rings, yielding an empty path sentinel.
- **`simplifyPath`** (`simplifyPath.ts`, 18 lines): Clipper `SimplifyPaths` / Skia `Simplify` -- self-union under the caller's fill rule. Composes over `resolvePathRegions`.
- **`unionAllPaths`** (`unionAllPaths.ts`, 41 lines): N-way union folding all paths' contours through a single kernel pass. Alias-safe `out` parameter. Empty list yields empty path; single path yields its self-overlap-resolved region, matching `simplifyPath`.
- **`resolvePathRegions`** (`resolvePathRegions.ts`, 28 lines): shared "raw rings to clean outline" primitive composing `offsetPath` and `simplifyPath`. Not barrelled in either export lane; file-exported for its colocated test only.
- **Fuzz harness** (`fuzzInvariants.test.ts`, 203 lines): deterministic xorshift32 PRNG, constant seeds, 8 invariants at 40 iterations each -- union commutativity, A minus A equals empty, A union A equals simplify(A), simplify idempotence, unionAllPaths[A] equals simplify(A), offset-zero identity, convex miter double-offset stability (within 3%), concave-offset self-intersection-freeness. The round-join double-offset invariant genuinely failed and was re-scoped to the well-defined miter/convex case rather than tolerance-papered.
- **Test suite**: 100 test cases across 7 files. `martinezKernel.test.ts` (41 cases) covers coincident/shared-boundary degeneracies, holes, self-intersecting input, positive/negative fill, scale invariance, commutativity, corner touching, contained squares, and non-axis-aligned inputs. `booleanPaths.test.ts` (15) covers dispatch, out aliasing, even-odd fill. `offsetPath.test.ts` (14) covers inflate/deflate, all join and end-cap types, concave/slot cleanup, scale invariance, open vs closed. `simplifyPath.test.ts` (7) covers bowtie, self-overlap under both fill rules, pentagram, passthrough, empty/degenerate. `unionAllPaths.test.ts` (6). `pathBooleanBackend.test.ts` (6). `resolvePathRegions.test.ts` (3).

## Gaps

Against a Clipper2/paper.js/CGAL-class library:

- **Open-path (polyline) clipping.** The kernel treats every contour as a closed region; `fillQueue` drops contours with fewer than three vertices and closes every ring (`:172-178`). Intersecting/differencing a polyline against a closed clip region -- a standard Clipper2 capability -- does not exist. Blocked upstream: `flattenPath` does not carry per-subpath closedness, which is also why `offsetPath`/`cleanPath` infer closedness from endpoint coincidence.
- **Curve inputs.** Flatten-first only; the result is always a polygon outline. The charter explicitly rules curve-preserving boolean out of scope -- a boundary, not a defect.
- **Deflation robustness on dense tessellation.** Inner-miter intersection of near-collinear edges shorter than |delta| loses area (observed 40-94% on round-join double-offset). Known, documented, excluded from fuzz invariants. A real fix wants edge-length-aware inner joins or vertex-routing restricted to genuine reflex corners.
- **Minkowski operations.** No `minkowskiSumPaths`/`minkowskiDifferencePaths`. Charter is silent.
- **Result hierarchy.** Output is a flat counter-wound ring set; no PolyTree-style parent/hole nesting query.
- **Performance posture.** O(n^2) static classification (`windingAt` scans all unique segments per sample at `:481-493`), string-keyed `Map`s in `mergeCoincidentSegments` (`:415`) and `DirectedGraph.vertex` (`:632`), linear `findStatus` (`:292-295`), per-event object allocation. The seam exists for a perf-tier swap-in.
- **Numerical robustness.** Floating-point with relative epsilons, not exact predicates or snap-rounding. The fuzz harness exercises messy self-overlapping polygons but adversarial near-degenerate input has no hard guarantee.
- **API asymmetry.** `offsetPath` and `simplifyPath` return fresh paths with no `out?` parameter, while `booleanPaths`/`unionAllPaths` accept one. The charter's out-param decision reads as package-wide.
- **Batch asymmetry.** Only union has an N-way form (`unionAllPaths`); no `intersectAllPaths`. Charter chartered batch union only.
- **Diagnostics seam.** No `explain*` query and no guard module anywhere in the package. Over-deflation collapse, degenerate input, and dropped rings all return a silent empty path. The SDK diagnostics convention asks for both shakeable `explain*` queries and `enable*Guards` modules.
- **Contour-to-path rebuild duplication.** The identical "ring to moveTo/lineTo/close, skip <6" loop appears in `writeContours` (`booleanPaths.ts:66-78`), inline in `unionAllPaths.ts:32-38`, and inline in `resolvePathRegions.ts:19-25`.

## Charter contradictions

None found in the implementation. Every 2026-07-09 decision is realized: per-operation API with named wrappers, both public fill rules, Martinez default behind the seam, positive-fill offset cleanup, phased degeneracy bars. Two **charter-side drift** items (code is correct, charter text is stale):

- Charter Boundaries still lists a `@flighthq/geometry` dependency ("and `@flighthq/geometry` for vector math") that was deliberately dropped in Phase A. The package uses inline plain-number cross products. `package.json` deps are `@flighthq/path` and `@flighthq/types` only.
- Charter's AAA decision lists **clean** in this package's scope, but `cleanPath` correctly lives kernel-free in `@flighthq/path`. The charter should record that split.

## Contract & docs fit

- **Types-first**: all shared types (`PathBooleanOperation`, `PathBooleanOptions`, `PathBooleanBackend`, `PathBooleanContour`, `PathBooleanFillRule`, `PathOffsetJoin`, `PathOffsetEnd`, `PathOffsetOptions`) live in `@flighthq/types`, one concept per file, well-commented. No inline type definitions in the package.
- **Export lanes**: public lane (`.`) exports 8 functions via `index.ts`; contract lane (`./contract`) re-exports all source modules. `resolvePathRegions` is file-exported for its test only, not in either lane. Two-lane structure matches the convention.
- **Naming**: full unabbreviated `*Path`/`*Paths` names, globally self-identifying. Satisfies the exported-function naming rule.
- **Sentinels-not-throws**: a single `throw` in `getOtherEvent` (`martinezKernel.ts:348`) for a programmer error (null event link), which satisfies the "throw only for precondition violations" rule. All expected-failure cases return empty paths.
- **sideEffects**: `false` in `package.json`. Module-scoped `_backend` initialized to `null`, `vertexSnap` to a constant, `nextEventId` to 0 -- none touched at import time.
- **Readonly usage**: parameters consistently typed `Readonly<Path>`, `Readonly<PathBooleanOptions>`, `Readonly<PathOffsetOptions>`, `readonly PathBooleanContour[]`, `readonly number[]`. Aligns with the C++ const convention.
- **Intra-SDK imports**: all use the `@flighthq/x/contract` lane (`@flighthq/path/contract`, `@flighthq/types/contract`).
- **import type separation**: type imports on their own `import type {}` lines throughout; no inline `import { type Foo, bar }` mixing.
- **Module layout**: exported functions precede private helpers and constants (`offsetPath.ts` places `PARALLEL_EPS`, `DEFAULT_MITER_LIMIT`, etc. at the bottom). Aligns with the "public API scans first" convention.
- **Backend seam pattern**: `setPathBooleanBackend`/`getPathBooleanBackend` uses a module-scoped singleton. This is a tension with the explicit-dependency rule ("No `set*Backend` singletons"), but the charter explicitly blesses it as matching the SDK's existing backend-seam pattern (image-codec, platform, textshaper). The seam is chartered for the genuine multi-kernel correctness/size/perf triangle.
- **Re-entrancy**: `vertexSnap` and `nextEventId` are module-scoped and reset per call (`martinezKernel.ts:109-110`). A re-entrant backend (one computing a boolean inside `computePathBoolean`) would corrupt the snap. The source documents this at `:99-101`. Not a defect at current scope (the kernel is synchronous and single-entrant), but a durable comment on `PathBooleanBackend`'s type definition would help if backends proliferate.

## Candidate open directions

- **Open-path clipping** -- requires `flattenPath` in `@flighthq/path` to carry per-subpath closedness, plus a kernel notion of unclosed subject edges. Also the real fix for the closedness-inference caveat in offset/clean.
- **Minkowski sum/difference** -- Clipper2-parity feature the charter is silent on.
- **PolyTree-style hierarchical result** -- whether the seam should grow a nesting-aware result shape or stay flat rings.
- **Deflation hardening** -- edge-length-aware inner joins for densely tessellated rings; likely its own gated pass with its own degeneracy bar.
- **Diagnostics seam** -- `explain*` queries for the silent empty-path sentinels (over-deflation, degenerate input, dropped rings) and a `enable*Guards` module wiring through `@flighthq/log`. Sweep-safe within the package.
- **`out?` on `offsetPath`/`simplifyPath`** -- non-breaking optional-parameter addition to match `booleanPaths`/`unionAllPaths` and the charter's out-param convention.
- **DRY the contour-to-path rebuild loop** -- one module-private helper replacing the three near-identical instances.
- **Perf-tier kernel** -- the chartered Clipper-faithful port or wasm `path-boolean-rs` swap-in behind the existing seam.
