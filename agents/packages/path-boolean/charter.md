---
package: '@flighthq/path-boolean'
crate: flighthq-path-boolean
draft: false
lastDirection: 2026-07-09
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# path-boolean — Charter

## What it is

`@flighthq/path-boolean` is a **neighbor package** of `@flighthq/path` for constructive solid geometry (CSG) boolean operations on 2D paths: union, intersection, difference, xor. A `-subpackage` suffix package that keeps the boolean kernel tree-shakable from the core path package.

Blessed as a new package during the path direction session (2026-07-02). Directed 2026-07-09 for a full **AAA build, phased** (boolean ops + offsetting + simplify/clean + batch, behind a swappable kernel seam).

## North star

The industry-complete 2D CSG kernel for `@flighthq/path` — the Clipper2/Skia-PathOps feature set (boolean ops, polygon offsetting, simplify, clean, multi-path) — behind a **swappable kernel seam** so a user picks their point on the correctness/size/performance triangle. The operation vocabulary is stable; the engine underneath is replaceable (a size-min kernel, a faithful Clipper port, a wasm `path-boolean-rs` drop-in). Correctness is the product: a boolean kernel that silently corrupts on a coincident edge is worse than none, so the test suite's degeneracy coverage IS the deliverable.

## Boundaries

- **CSG on flattened geometry.** Booleans/offsets operate on polygons; béziers flatten to polylines at a tolerance and the result is a polygon-outline `Path`. Curve-preserving boolean is explicitly out of scope (a Skia-PathOps-class stretch). Flattening uses `@flighthq/path`'s `flattenPath`.
- **Depends on `@flighthq/path` + `@flighthq/types`** (and `@flighthq/geometry` for vector math). No DOM, no renderer.
- **Owns no path construction/measurement** — that is `@flighthq/path`. This package only combines/offsets/cleans existing paths.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-09] AAA scope, phased.** The full set: boolean ops (union/intersect/difference/xor + general `booleanPaths(subject, clip, op)`), both fill rules (even-odd, non-zero), polygon **offsetting** (`offsetPath(delta, join, end)` — miter/round/square/bevel joins + miter limit + butt/round/square ends), **simplify** (resolve a self-intersecting path under a fill rule), **clean** (epsilon-dedup coincident/near-collinear vertices), and **multi-path/batch** union. Built across gated phases (see status.md), each held to a degeneracy-test bar before the next.
- **[2026-07-09] Swappable kernel seam.** Operations dispatch through a `PathBooleanBackend` (`setPathBooleanBackend`/`getPathBooleanBackend`/`createDefault…`), matching the SDK's backend-seam pattern (image-codec registry, platform `set*Backend`, textshaper). Heavier/faster kernels (`path-boolean-clipper`, wasm `path-boolean-rs`) swap in without changing the operation API.
  **Why:** boolean CSG genuinely has multiple valid kernels at different correctness/size/perf points — the exact condition that earns a seam over a hard-wired choice; and it future-proofs the Rust/wasm drop-in like `surface-rs`.
- **[2026-07-09] Default kernel = Martinez–Rueda (floating-point sweep-line).** A faithful implementation from the documented reference — robust on holes, self-intersection, and both fill rules, and *implementable correctly from scratch*, which a from-scratch Clipper2 is not (a from-scratch Clipper is less robust than a faithful Martinez, defeating the point). Clipper-style stays the intended future swap-in (a faithful port is its own dedicated effort/neighbor).
  **Why:** correctness-first — the default must be the most-robust kernel we can actually get right, not the most-robust-in-theory kernel we might get wrong.
- **[2026-07-09] Per-operation API + out-params.** `unionPaths(a, b, out?)` / `intersectPaths` / `differencePaths` / `xorPaths` (explicit, matching the SDK's named-op convention) plus the general `booleanPaths`. A fill-rule and flatten-tolerance are options with sane defaults (non-zero, path's default tolerance).
