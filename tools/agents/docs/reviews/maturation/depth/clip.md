# Maturation Roadmap: @flighthq/clip

**Current verdict**: partial — 45/100. A correct, well-shaped value-typed leaf that _describes_ a clip (two `createClipRegionFrom*` producers + `invalidateClipRegion`) but cannot yet _operate_ on one — no composition, query, transform, or clone surface.

The package owns the `ClipRegion` data primitive: a hard, transform-exact clip in one of two forms — axis-aligned rectangle (scissor-eligible, `contours: null`) or flattened contours (stencil-then-cover). The `ClipRegion` interface and `HasClip` trait already live in `@flighthq/types`; geometry already offers a rich rectangle vocabulary (`computeRectangleIntersection`, `intersectsRectangle`, `containsRectanglePointXY`, `enclosesRectangle`, `isEmptyRectangle`, `mergeRectangle`) that the operational half can lean on directly. The frontier is the missing operations, not the descriptor.

## Bronze

The 20% that turns a descriptor into a usable region. All slot into the existing out-param / value-type conventions; none require new `@flighthq/types` shapes beyond what `ClipRegion` already exposes.

- **`intersectClipRegions(out, a, b)`** — the defining real-world operation (nested clipping: a clipped node inside a clipped subtree). Bronze scope: rectangle∩rectangle fast path via `computeRectangleIntersection` → scissor-eligible result (`contours: null`); rectangle∩contours and contours∩contours intersect _bounds only_ and carry the finer form's contours (conservative — render backends already stencil-cover, so a conservative bound is safe and correct for the rect-vs-rect common case). Bump `out.version`.
- **`getClipRegionBounds(out, clip)`** — copy `clip.rect` into an `out` rectangle. The canonical culling/measurement accessor every consumer currently reads by hand.
- **`isClipRegionEmpty(clip)`** — true when the region clips everything away (empty `rect`, via `isEmptyRectangle`, or a non-null but zero-length `contours`). Sentinel-returning predicate.
- **`isClipRegionRectangular(clip)`** — named predicate for the `contours === null` discriminator that is currently read inline at every backend callsite.
- **`cloneClipRegion(clip)`** — allocating deep copy (clone `rect`, copy `contours` arrays, carry `winding`, reset/keep `version`). Conventional for a mixable value type and currently absent.
- **`copyClipRegion(out, source)`** — in-place mutator form (mirrors `copyRectangle`), for reusing a region object across frames without allocation.
- Colocated tests for every new export (`exports:check` requires it), including the aliased `out === a` case for `intersectClipRegions` and `copyClipRegion`.

## Silver

Competitive with a good region library: full query set, transform support, raw-contour construction, and the convenience constructors a 2D SDK is expected to offer.

- **`transformClipRegion(out, clip, matrix)`** — bake a clip into a different space (apply a `Matrix` to `rect` for the rectangle form; transform each contour point and recompute the bounding `rect` for the contour form). Note in a comment that an affine-transformed rectangle is only scissor-eligible while axis-aligned — when the matrix rotates/skews, the result must promote to contours (4-point quad) so the rect form's scissor invariant holds. This is the single largest correctness item: today every backend re-applies the world transform independently.
- **`clipRegionContainsPoint(clip, x, y)`** — rectangle form via `containsRectanglePointXY`; contour form via even-odd / non-zero point-in-polygon honoring `clip.winding`. Backs interaction hit-testing against a clip.
- **`clipRegionIntersectsRectangle(clip, rectangle)`** and **`clipRegionContainsRectangle(clip, rectangle)`** — culling/visibility queries (rect fast paths via `intersectsRectangle` / `enclosesRectangle`; contour form falls back to bounds, conservative).
- **`createClipRegionFromContours(contours, winding)`** — raw flattened-contour input without a `Path` (completes the `From<Source>` family; the depth review explicitly flagged this as the signalled extension point).
- **`setClipRegionToRectangle(out, rectangle)`** — in-place mutator to retarget an existing region to a rectangle form (mirrors `setRectangle`), avoiding per-frame allocation in the common animated-clip case.
- **Convenience constructors** — `createClipRegionFromRoundedRectangle(rectangle, radius)`, `createClipRegionFromEllipse(rectangle)`, `createClipRegionFromCircle(x, y, radius)`. Each builds a `Path` internally and flattens via the existing `From<Path>` path, with a `tolerance` knob; these are the shapes app authors reach for most after a plain rect.
- **`clipRegionsEqual(a, b)`** — structural comparison (form, `winding`, `rect`, contour point equality) for cache reuse independent of the manual `version` stamp.
- **`unionClipRegions(out, a, b)`** — bounding-box union (via `mergeRectangle`) for the "either region" case; conservative for contours. Rounds out the boolean set begun by `intersect` in Bronze.
- **Cross-backend consistency note** in tests: assert that the winding rule and rect/contour discrimination produced here match what the four `displayobject-<backend>` clip modules consume, so the descriptor and its realizers cannot drift.

## Gold

Authoritative clip/region domain owner: exhaustive boolean algebra, true (non-conservative) contour composition, performance, and 1:1 Rust parity.

- **True contour boolean composition** — `subtractClipRegions(out, a, b)` and `xorClipRegions(out, a, b)`, plus _exact_ (not bounds-conservative) `intersectClipRegions` / `unionClipRegions` for the contour form. This requires a polygon-clipping kernel (Vatti / Weiler–Atherton or a Martinez–Rueda implementation) that operates on flattened contours and respects `winding`. **Design decision to surface (see Sequencing):** this kernel almost certainly belongs in `@flighthq/path` (or a `@flighthq/path-boolean` neighbor) as path-level boolean ops, with `clip` composing over it — not duplicated here. `clip` should own the _region semantics_; `path` should own the _geometry kernel_.
- **`normalizeClipRegion(out, clip)`** — canonicalize a region: collapse a contour set that is exactly an axis-aligned rectangle back to the scissor-eligible rect form (a meaningful perf win — keeps fast-path scissor instead of stencil), drop degenerate sub-paths, and normalize winding. Pairs with `clipRegionsEqual` for stable cache keys.
- **`getClipRegionWinding` / explicit winding constructors** — `createClipRegionFromContoursWithWinding` and a helper to normalize even-odd↔non-zero where a backend needs one specific rule; today winding correctness lives entirely in backends.
- **Performance**: contour storage as flat `Float32Array` (or a documented `number[][]` → typed-array path) for cheap transform and GPU upload; a `releaseClipRegion` / pool (`acquireClipRegion`) bracket if profiling shows per-frame region churn; ensure every query and `transformClipRegion` is allocation-free in the hot path.
- **Error/edge handling**: explicit, tested behavior for empty contours, single-point/degenerate contours, NaN/Infinity coordinates (sentinel-empty, not throw), self-intersecting input under both winding rules, and fully-disjoint intersection (→ empty region).
- **Tests & docs**: exhaustive unit coverage of every boolean/query/transform combination across both forms and both winding rules; a functional test (via the `functional-test` skill) proving the descriptor's composition matches across Canvas/DOM/WebGL realizers (boolean clips must look identical on all backends); a doc note in the SDK map / a `clip` package README on the descriptor↔backend contract.
- **Rust port — `flighthq-clip`** — 1:1 mirror crate (does not exist yet): `create_clip_region_from_rectangle`, `create_clip_region_from_path`, `intersect_clip_regions(out, a, b)`, `transform_clip_region`, the query set, etc., over a `ClipRegion` struct in `flighthq-types`. As a value-typed leaf with a plain-data seam, `clip` is in the **mixable** set — a strong early Rust↔TS conformance target (deterministic, no GPU, headlessly fingerprint-able), with the boolean kernel mirrored from the Rust `path`/tiny-skia geometry stack.

## Sequencing & effort

Recommended order, with dependencies and items to surface to the user:

1. **Bronze first (small, self-contained, ~half a day).** All six Bronze additions depend only on existing `@flighthq/geometry` rectangle ops and the current `ClipRegion` shape — no `@flighthq/types` change, no other package. `intersectClipRegions` (rect fast path) + `getClipRegionBounds` + the two predicates immediately unblock the render layer, which today intersects clips ad hoc per backend. Do `clone`/`copy` alongside since they are trivial and conventional. This is the highest value-per-effort step and the one that most justifies the package existing as a domain owner.

2. **Silver next (~1–2 days), in this sub-order:** `transformClipRegion` (highest correctness payoff — removes per-backend transform duplication) → the three query functions (unblocks `@flighthq/interaction` hit-testing and culling) → `createClipRegionFromContours` + `setClipRegionToRectangle` → convenience constructors → `clipRegionsEqual` + `unionClipRegions`. The transform rotation/skew → contour-promotion rule should be cross-checked against the four backend clip modules so the scissor-eligibility invariant matches what they assume.

3. **Gold is gated on a cross-package design decision — surface this before starting:** true contour boolean composition needs a polygon-clipping kernel. **Recommendation to raise with the user:** add boolean ops to `@flighthq/path` (or a `@flighthq/path-boolean` neighbor following the `-formats`/neighbor convention) and have `clip` compose over it, rather than embedding a clipper inside this leaf. `path` currently has only `flattenPath` / `tessellatePath` — no boolean kernel exists anywhere in the monorepo, so this is genuinely new geometry work and the largest single effort in the roadmap. Do not implement autonomously; it crosses a package boundary and is a foundational design choice.

4. **Other cross-package / design items to surface:**
   - **Add an explicit `@flighthq/clip` entry to the Package Map** in `tools/agents/docs/index.md` — it is conspicuously absent (only `clipboard` appears), so the intended scope is undocumented. The roadmap above is itself the proposed scope statement.
   - **Winding normalization ownership** — decide whether even-odd↔non-zero conversion lives in `clip`, `path`, or stays in backends (currently the latter). Affects `normalizeClipRegion` and the explicit-winding constructors.
   - **Rust `flighthq-clip` crate** does not exist; creating it is a separate Rust-worktree task, naturally sequenced after the TS Bronze/Silver API stabilizes (port the stable surface, not a moving target). Its boolean kernel depends on the same path-clipping decision as TS Gold.

Honest effort summary: Bronze and most of Silver are low-risk, single-package, out-param-convention work the existing geometry vocabulary already supports. Gold's contour boolean algebra is the only genuinely hard, cross-package piece and should be scoped as its own initiative (kernel in `path`, semantics in `clip`).
