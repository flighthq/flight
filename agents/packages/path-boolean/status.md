---
package: '@flighthq/path-boolean'
updated: 2026-08-08
by: principal
---

# path-boolean — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

All four chartered phases are delivered. Every item below was re-checked against
`packages/path-boolean/src/` on 2026-08-08 and is an honest, documented limit rather than a silent one.

- **No open-path (polyline) clipping.** The kernel treats every contour as a closed region — contours
  under three vertices are dropped and every ring is closed (`martinezKernel.ts:178`). Blocked upstream:
  `flattenPath` does not carry per-subpath closedness, which is also why `offsetPath` infers closedness
  from first/last-vertex coincidence, so an open polyline with coincident endpoints misclassifies. Not
  fixable from flattened geometry alone.
- **Deflation is unstable on densely tessellated input.** Inner-miter intersection of near-collinear
  edges shorter than `|delta|` loses 40–94% of area on round-join double-offset. The fuzz invariant is
  deliberately scoped to the miter/convex case rather than tolerance-papered; a real fix wants
  edge-length-aware inner joins or vertex-routing restricted to genuine reflex corners.
- **No diagnostics seam.** Over-deflation collapse, degenerate input, and dropped rings all return a
  silent empty path, but there is no `explain*` query and no guard module anywhere in the package —
  a grep for `explain` / `Guards` over `src/` returns nothing. The SDK diagnostics convention asks for
  both.
- **`out` asymmetry.** `offsetPath` (`offsetPath.ts:16`) and `simplifyPath` (`simplifyPath.ts:14`)
  return fresh paths with no `out?`, while `booleanPaths` (`booleanPaths.ts:10-16`) and `unionAllPaths`
  (`unionAllPaths.ts:13-17`) take one. The charter's out-param decision reads as package-wide.
- **Correctness-first performance posture, nothing behind the seam.** Classification is O(n²) —
  `windingAt` scans every unique segment per sample (`martinezKernel.ts:477-479`) — plus string-keyed
  `Map`s in coincident-segment merging and the directed graph, and a linear status search. Fine for the
  chartered modest polygon sizes; the backend seam exists for a perf tier that is unbuilt.
- **Missing Clipper2-parity surface**: no `minkowskiSumPaths` / `minkowskiDifferencePaths`, and the
  result is a flat counter-wound ring set with no PolyTree-style parent/hole nesting query. Only union
  has an N-way form (`unionAllPaths`); there is no `intersectAllPaths`.
- **Kernel state is module-scoped and single-entrant.** `vertexSnap` (`martinezKernel.ts:101`, assigned
  per call at `:110`) and `nextEventId` are never touched at import time, but a re-entrant backend — one
  computing a boolean inside `computePathBoolean` — would corrupt the snap.
- **Two design calls are baked and still unconfirmed by the user:** (a) `PathBooleanFillRule` as a
  package-local superset of `PathWinding`, with `positive`/`negative` reachable only through the backend
  seam rather than widening the core type or the public options; (b) the `unionAllPaths` name over
  `unionPathList` or an overload of the binary `unionPaths`.
- **Charter drift to reconcile:** Boundaries still lists a `@flighthq/geometry` dependency (deliberately
  dropped in Phase A for inline plain-number cross products — keep it dropped), and lists `clean` in
  this package's scope though `cleanPath` correctly lives kernel-free in `@flighthq/path`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The Phase A/B carry-forward lists checked
  out **false**: "the kernel lacks a **positive fill rule** — a positive-fill capability in the kernel is
  the real fix" was closed by Phase D (`martinezKernel.ts:509-511`, consumed by `offsetPath.ts:63`), and
  the "absolute epsilons `VERTEX_SNAP=1e-7` / `INTERSECTION_EPS=1e-12`, magnitude-relative snapping
  wanted" item is likewise dead — snap is now `extent · 1e-9` (`:85`, `:551`) and `INTERSECTION_EPS`
  scales by squared edge lengths at every use (`:281`, `:384`, `:393`).
- **2026-07-13** — Review pass: solid/85, all four phases verified in source, no charter contradictions;
  the distance to authoritative is documented limits, not silent corruption.
- **2026-07-09** — Phase D: `PathBooleanFillRule` with positive/negative behind the seam,
  magnitude-relative epsilons proven scale-invariant across 1e9, `unionAllPaths`, and a seeded
  xorshift32 fuzz harness over eight invariants × 40 iterations.
- **2026-07-09** — Phase C: `simplifyPath` here and kernel-free `cleanPath` in `@flighthq/path`, both
  composing over the extracted module-private `resolvePathRegions`. The bowtie does **not** discriminate
  fill rules; the real discriminators are same-winding self-overlap and the pentagram.
- **2026-07-09** — Phase B: `offsetPath` with miter/bevel/round/square joins, butt/round/square end caps,
  and raw-ring self-union; reclaimed the name from the naive version removed from `@flighthq/path`.
- **2026-07-09** — Phase A (`70e6b440`): backend seam plus the Martinez–Rueda kernel, whose classification
  is a separate static winding-sum pass over the arrangement — that separation is why coincident and
  overlapping edges classify correctly.
