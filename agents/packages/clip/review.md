---
package: '@flighthq/clip'
status: solid
score: 85
updated: 2026-09-02
ingested:
  - charter.md (lastDirection 2026-07-02, 4 decisions, 4 open directions)
  - status.md (principal 2026-08-08 rewrite, Open + Log contract)
  - packages/clip/src/clipRegion.ts (584 lines, 26 exports)
  - packages/clip/src/clipRegion.test.ts (662 lines, 59 tests)
  - packages/clip/src/enableClipGuards.ts + enableClipGuards.test.ts (33 + 74 lines, 3 tests)
  - packages/clip/src/index.ts, contract.ts, package.json
  - packages/types/src/ClipRegion.ts (ClipRegion + ClipRegionReleaseGuard)
  - agents/packages/CONTRACT.md, index.md
  - prior review.md (2026-07-13, 83/100)
  - functional/scenes/scene2d-clip-rect.ts, scene2d-clip-contour.ts (+ two HDR variants)
---

# clip -- Review

Re-review at HEAD, replacing the 2026-07-13 review (83/100). Since that review, 12 commits touched the package: the guard seam landed (`enableClipGuards`/`disableClipGuards` with `setClipRegionReleaseGuard` and the `warnOnDoubleRelease` reporter through `@flighthq/log`), a new test file `enableClipGuards.test.ts` was added, packaging was restructured through contract lanes, additional alias and edge-case test coverage was added, the CIRCLE_KAPPA constant was consolidated from `@flighthq/math`, and two version bumps brought the package to 0.5.0. The prior review's gap #2 (no diagnostics layer) is now partially closed by the guard seam; all other prior gaps remain open.

## Verdict

**solid -- 85/100.** The conservative clip-region operations library is complete, house-style-clean, and well-tested (26 exported functions across two source files, 62 colocated tests, alias cases on the main out-param functions). The guard seam closes the prior review's diagnostics gap for the pool bracket. What separates it from authoritative is the chartered-but-unbuilt exact tier (now genuinely unblocked by `@flighthq/path-boolean`), the public lane omitting four contract-lane exports that app-boundary callers need, and the parked `Float32Array` storage migration.

## Present capabilities

All in `packages/clip/src/`, exported through a contract barrel (`contract.ts` re-exports `clipRegion.ts` + `enableClipGuards.ts`) and a public barrel (`index.ts` with a curated 22-export subset). `sideEffects: false`; deps exactly `geometry`, `log`, `math`, `path`, `types`. Re-exported into the SDK barrel via `packages/sdk/src/scene2d.ts`.

### Constructors (6)

- `createClipRegionFromRectangle` -- scissor-eligible, clones the input rectangle. Allocation-light.
- `createClipRegionFromPath` -- flattens via `flattenPath` from `@flighthq/path`, carries `path.winding`. Contour form, realized by stencil-then-cover.
- `createClipRegionFromContours` -- deep-copies input with `Readonly` signature, computes bounding rect from contour data.
- `createClipRegionFromCircle` -- cubic-Bezier approximation via CIRCLE_KAPPA, flattened through path.
- `createClipRegionFromEllipse` -- same Bezier approach over a bounding rectangle.
- `createClipRegionFromRoundedRectangle` -- falls back to plain rect when `radius <= 0`; otherwise Bezier arcs and flatlines.

### Composition (conservative tier, 2)

- `intersectClipRegions` -- rect-on-rect is exact and scissor-eligible; disjoint produces empty; mixed/contour forms keep whichever input has more sub-paths and intersect bounding rects. Alias-safe (locals-first reads), bumps version.
- `unionClipRegions` -- `mergeRectangle` bounds; contour heuristic keeps the richer input. Alias-safe, bumps version.

### Queries (6)

- `clipRegionContainsPoint` -- rect fast-reject, then exact winding-number ray-cast (`pointInContours`) for both `nonZero` and `evenOdd`. The only contour-exact query.
- `clipRegionContainsRectangle` / `clipRegionIntersectsRectangle` -- bounds-based only, conservative per charter Decision #1. Ignore `contours` entirely.
- `getClipRegionBounds` -- copies rect into out.
- `isClipRegionEmpty` / `isClipRegionRectangular` -- field-level predicates.
- `equalsClipRegion` -- structural equality (version-independent, point-by-point contour comparison).

### Transform (1)

- `transformClipRegion` -- axis-aligned matrices keep rect form (scissor-eligibility invariant, North star #2); rotation/skew promotes to a 4-point quad contour; contour form transforms every point and recomputes bounds. Alias-safe.

### Canonicalization (1)

- `normalizeClipRegion` -- single-contour 4-point axis-aligned quad (within `NORMALIZE_EPSILON` = 1e-6) promotes back to scissor-eligible rect form; all other shapes copy through. Bumps version.

### Lifecycle (7)

- `cloneClipRegion` / `copyClipRegion` -- deep copies; copy no-ops on identity.
- `setClipRegionToRectangle` -- in-place retarget to rect form.
- `invalidateClipRegion` -- `(version + 1) >>> 0` wrap.
- `acquireClipRegion` / `releaseClipRegion` -- pool bracket, reset-on-acquire, module-level pool at file bottom.
- `setClipRegionReleaseGuard` -- the diagnostics seam; null uninstalls.

### Diagnostics (2)

- `enableClipGuards` -- installs the `warnOnDoubleRelease` callback through `setClipRegionReleaseGuard`, which emits a `logOnce` warning via `@flighthq/log` when a region already in the pool is released again. The `O(pool)` membership scan (`clipRegionPool.includes(clip)`) runs only while the guard is installed; production pays a single null comparison.
- `disableClipGuards` -- uninstalls the guard.

### Tests

Two test files, 62 tests total (59 in `clipRegion.test.ts`, 3 in `enableClipGuards.test.ts`). `describe` blocks are alphabetized and mirror export names. Alias cases cover `intersectClipRegions` (out === a, out === b), `copyClipRegion` (out === source), `transformClipRegion` (rect form, out === clip), and `unionClipRegions` (both directions). Pool reuse/reset, winding preservation, rotation promotion, and all five `normalizeClipRegion` branches (including 90-degree rotation round-trip) are covered. Guard tests exercise double-release detection, silent paired acquire/release, and uninstallation.

### Functional scenes

Four scenes exercise clip across backends:
- `scene2d-clip-rect.ts` -- rectangular clip via `createClipRegionFromRectangle`, proves pixels inside/outside the clip window.
- `scene2d-clip-contour.ts` -- triangular contour clip via `createClipRegionFromPath`, proves contour-based stencil-then-cover.
- `scene2d-clip-contour-hdr.webgl.ts` / `scene2d-clip-contour-hdr.webgpu.ts` -- HDR variants for WebGL/WebGPU backends.

This closes the prior review's gap #7 and charter Open direction #3 (no functional/visual scene).

## Gaps

Judged against the charter and codebase-map standard:

1. **The exact tier does not exist -- and is now unblocked.** No `intersectClipRegionsExact`, `subtractClipRegionsExact`, `unionClipRegionsExact`, `xorClipRegionsExact`, or `clipRegionContainsRectangleExact`. `@flighthq/path-boolean` ships a Martinez kernel whose `PathBooleanBackend.computePathBoolean` seam accepts exactly clip's flat-contour storage format. The status notes this is a "wiring-and-boundary question, not new geometry." Design question remains: direct dependency on `path-boolean` vs. accepting the backend through a parameter (tree-shaking favors separate importability either way).

2. **Public lane omits four contract-lane exports.** `index.ts` exports 22 of 26 functions. Missing: `invalidateClipRegion`, `enableClipGuards`, `disableClipGuards`, `setClipRegionReleaseGuard`. The first three are needed by app-boundary callers: `invalidateClipRegion` is referenced in `ClipRegion.ts`'s own doc comment as the versioning verb, and roughly twenty other packages export their `enable*Guards` from the public lane (e.g. `geometry`, `node`, `render`, `interaction`, `collision`, `assets`). `setClipRegionReleaseGuard` is the internal seam and could reasonably stay contract-only, but the other three are a lane gap.

3. **Diagnostics scope is narrow.** The guard covers only the pool double-release footgun. Three other caller-facing concerns remain unguarded: invalid/unclosed contours in `createClipRegionFromContours`, use-after-release on a pooled region, and no `explain*` query for the conservative-answer cases (a consumer cannot programmatically ask "was this result conservative?"). The inversion rule says each of these warning comments is a missing guard.

4. **Two contour-form queries are bounds-only with no queryable indicator.** `clipRegionContainsRectangle` and `clipRegionIntersectsRectangle` answer from `clip.rect` alone. Per Decision #1 this is by design (conservative tier), but there is no `isClipRegionConservative` predicate or `explain*` function that lets a consumer know the answer is an approximation. The conservatism is a doc comment, not a runtime-queryable fact.

5. **Missing region-vs-region predicates.** No `clipRegionContainsClipRegion` or `clipRegionIntersectsClipRegion` (conservative over bounds). These are the queries a culling or nested-clip consumer reaches for first.

6. **In-place retarget asymmetry.** `setClipRegionToRectangle` exists; there is no `setClipRegionToContours`, so pooled/animated contour-clip workflows must hand-assign fields (bypassing the bounds recompute and version bump).

7. **Test blind spots.** No contour-form cases for `clipRegionContainsRectangle` / `clipRegionIntersectsRectangle` (the conservative contract is untested exactly where it is conservative -- a test that builds a concave contour clip, asks containment on a rect that's inside the bounds but outside the concavity, and asserts `true` would document the conservatism). No alias case for `normalizeClipRegion` (out === clip) or the contour branch of `transformClipRegion` (out === clip with contours).

8. **`Float32Array` contour storage** -- blessed by Decision #2 but undesigned. The per-contour `.map((c) => c.slice())` copies in `transformClipRegion`, `intersectClipRegions`, `unionClipRegions`, `normalizeClipRegion`, `cloneClipRegion`, and `copyClipRegion` are the allocation cost it would remove. Cross-package impact: `@flighthq/types` `ClipRegion` interface change + every backend clip module.

9. **No backend package imports `@flighthq/clip` functions.** `scene2d-canvas`, `scene2d-gl`, `scene2d-dom`, and `scene2d-wgpu` all consume the `ClipRegion` type from `@flighthq/types` directly; none imports `@flighthq/clip/contract`. The functional scenes import through `@flighthq/sdk`. This means clip's own functions are not structurally depended upon by the renderer pipeline -- the package is a "leaf for app code" but not a consumed utility within the SDK. This is not necessarily wrong (backends use the data structure, not the operations library), but it means the operations functions are tested in isolation, not by integration.

## Charter contradictions

**None.** The code honors every Decision: conservative names unchanged (Decision #1), contours deep-copied with `Readonly` input, winding consumed but not converted (Decision #3, `pointInContours` duplication explicitly justified), rasterization/soft-masking/trait-wiring all absent (Decision #4). Scissor-eligibility is preserved everywhere the charter demands (transform, rect-on-rect intersection, normalize).

## Contract & docs fit

### Package vs contract -- strong

- Types live in `@flighthq/types` (`ClipRegion`, `ClipRegionReleaseGuard`).
- Every export carries the full unabbreviated `ClipRegion` name.
- `is*`/`get*`/`equals*`/`has*` verb conventions hold consistently.
- `Readonly<>` on all inputs; out-params with locals-first alias safety.
- Sentinels not throws (boolean returns, null contours for rect form).
- Allocation verbs honored: `create*`/`clone*`/`acquire*` allocate; `copy*`/`set*`/compose write to `out`.
- Pool bracket paired (`acquireClipRegion`/`releaseClipRegion`).
- Module-level state (pool, epsilon, guard slot) at file bottom per style rule.
- Single root export, `sideEffects: false`, two-lane exports structure.
- `@flighthq/log` dependency only via `enableClipGuards.ts` (tree-shakes out of production).

### Candidate revisions (user's gate)

- **`MatteFilter` is stale vocabulary.** The `ClipRegion` type doc (`packages/types/src/ClipRegion.ts:6`) and the charter's "What it is"/North star #3 both delegate softness to "MatteFilter." Fork H (2026-07-11) dissolved `@flighthq/filters`; no `MatteFilter` exists anywhere in the tree. Both docs should name the real soft-matte destination.
- **Charter Open direction #1 is resolved by events.** The kernel home is `@flighthq/path-boolean` (built, shipping Martinez). The direction should be rewritten from "decide the kernel's home" to "decide clip's composition shape over the existing `PathBooleanBackend` seam."
- **Charter Open direction #3 is resolved by events.** Four functional scenes now exist (`scene2d-clip-rect`, `scene2d-clip-contour`, two HDR variants). This direction can be retired.
- The Package Map line for clip in AGENTS.md is accurate; no change needed.

## Candidate open directions

1. **Composition shape for the exact tier.** Direct `@flighthq/path-boolean` dependency vs. passing a `PathBooleanBackend` in. The seam's flat-contour contract matches clip's storage format, so either approach is thin. Also whether `subtractClipRegions` gets a conservative form (result = `a`'s bounds is a valid over-approximation) or arrives exact-only.
2. **Post-fork-H softness naming.** What replaces "MatteFilter" in clip-adjacent docs (charter + types doc).
3. **`Float32Array` layout** -- unchanged from charter Open direction #2, still needs design before the Rust seam locks. Offsets array vs. sentinel separators vs. a single flat array with length-prefixed sub-paths.
4. **Public-lane completeness.** Should `invalidateClipRegion`, `enableClipGuards`, and `disableClipGuards` be promoted to the public lane? Every other package with a guard seam exports it from `.`; the `invalidate*` verb is the versioning mechanism documented in the `ClipRegion` type itself.
