---
package: '@flighthq/clip'
status: solid
score: 80
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/clip.md
  - source
  - incoming/builder-67dc46d64/changes.patch
---

# clip — Review

> Survey layer. Judged against `charter.md` (a stub — only "What it is" is filled; North star, Boundaries, Decisions, Open directions are all TODO) and, where the charter is silent, against the codebase-map AAA standard. Evidence is the incoming bundle `incoming/builder-67dc46d64/head/packages/clip/` and its `changes.patch`. Findings cited as `67dc46d64:packages/clip/...`.

## Verdict

**solid — 80/100.** The prior depth review found a "construction half, no operational half" cell (partial, 45/100, 3 exports). This pass landed the operational half: the package went from 3 exports to **24** in `clipRegion.ts` — composition, queries, transform, clone/copy/set, a pool bracket, and five new shape constructors — all colocated-tested (54 tests, every export covered, alias cases included). It is now a genuine clip-region _library_, not a two-function product. It falls short of `authoritative` only because the one operation a region library exists for — **exact boolean algebra** — is still conservative-bounds-only (intersection/union keep one input's contours and a bounding rect; no subtract/xor), and because that gap is honestly a cross-package decision (a path boolean kernel) rather than missing work in this cell.

The status doc's claims (Bronze/Silver/Gold implemented, 54 tests, alias-safety, normalize strategy, Package Map entry) **verify against the diff** — it is accurate, not aspirational. The self-assessed "90/100 Gold" overstates against the AAA bar because conservative boolean ops are not Gold; 80 is the honest read.

## What changed in this bundle

Base `clipRegion.ts` (`67dc46d64:base`) had exactly three exports: `createClipRegionFromPath`, `createClipRegionFromRectangle`, `invalidateClipRegion`. Head adds 21 more (full list in the realized `dist/clipRegion.d.ts`), keeping the file single-source, alphabetized, with pools/constants/helpers at the bottom per source style. One signature widened: `createClipRegionFromRectangle` now takes `Readonly<RectangleLike>` (was `Readonly<Rectangle>`) — consistent with the other `*Like` inputs. No change to the `ClipRegion` type in `@flighthq/types` (still `number[][] | null` contours).

## Present capabilities

Grounded in `67dc46d64:packages/clip/src/clipRegion.ts`:

- **Constructors.** `createClipRegionFromRectangle` (scissor-eligible, clones the rect), `createClipRegionFromPath` (flattens via `@flighthq/path` `flattenPath`, carries path winding), `createClipRegionFromContours` (raw flattened input), and three shape conveniences — `createClipRegionFromRoundedRectangle` (radius ≤ 0 falls back to plain rect), `createClipRegionFromEllipse`, `createClipRegionFromCircle` — all built on cubic-Bezier path appenders (`KAPPA` = 0.5522847498) then flattened. Honest house-style `From<Source>` family.
- **Composition.** `intersectClipRegions(out,a,b)` and `unionClipRegions(out,a,b)`, both alias-safe (inputs read into locals first), both version-bumping. rect∩rect / rect∪rect are exact and stay scissor-eligible; disjoint intersection collapses to an empty region. Mixed/contour forms are **conservative**: bounding-rect intersection/union plus one input's contours kept verbatim (the "richer" input by sub-path count for contour∩contour).
- **Queries.** `clipRegionContainsPoint` (rect bounds gate, then a winding-number ray-cast over contours honoring both `nonZero` and `evenOdd`), `clipRegionIntersectsRectangle`, `clipRegionContainsRectangle`, `getClipRegionBounds(out,clip)`, `isClipRegionEmpty`, `isClipRegionRectangular`, `clipRegionsEqual` (structural, point-by-point, not version-based).
- **Transform.** `transformClipRegion(out,clip,matrix)`, alias-safe: axis-aligned matrices (`b===0 && c===0`) keep the rect form scissor-eligible; rotation/skew promotes the rect to a 4-point quad contour; contour form transforms every point and recomputes the bounding rect.
- **Mutators / lifecycle.** `cloneClipRegion`, `copyClipRegion` (no-op on `out===source`), `setClipRegionToRectangle`, `invalidateClipRegion` (version bump mirroring `invalidateImageResource`), and a pool bracket `acquireClipRegion`/`releaseClipRegion` (reset-on-acquire, module-level pool at file bottom).
- **Normalization.** `normalizeClipRegion(out,clip)` — lightweight, kernel-free canonicalization that promotes a single 4-point axis-aligned quad contour (within `NORMALIZE_EPSILON` = 1e-6) back to the scissor-eligible rect form; the prime case is a rect that a 90°/180°/270° `transformClipRegion` turned into a quad. Multi-contour or non-axis-aligned input copies through unchanged.

Architecture fit is clean: still `sideEffects: false`, value-typed, single root `.` export via `index.ts`, the `ClipRegion`/`HasClip` types stay in `@flighthq/types`, deps are only `geometry`/`path`/`types`. This is exactly the wasm-mixable value-leaf shape (structural-fork D / Mixing) — a strong early Rust↔TS conformance target.

## Gaps vs an authoritative clip/region library

- **Exact boolean algebra (the defining gap).** `intersectClipRegions`/`unionClipRegions` are bounds-plus-one-input conservative for any contour form; there is no `subtractClipRegions`, no `xorClipRegions`, and no true contour intersection/union. A region library's reason to exist is exact boolean composition. The status doc is right that the kernel (Vatti / Weiler-Atherton / Martinez) belongs in `@flighthq/path` or a `path-boolean` neighbor — `@flighthq/path` has only `flattenPath`/`tessellatePath` today — so this is a **cross-package design decision**, not in-cell work. It is the single largest thing between `solid` and `authoritative`.
- **`clipRegionContainsRectangle` over-claims on contour form.** It uses only `clip.rect` (`enclosesRectangle`), so for a concave/holed contour it returns `true` when the rectangle is inside the bounding box but outside the actual region — a **false positive** on a containment query. For a `contains` predicate the safe conservative direction is to _under_-claim (return false when unsure); this does the opposite. The doc comment admits "bounding-box approximation (conservative)" but does not flag that _contains_ is the unsafe direction. A consumer (culling, interaction) that trusts a `true` could skip a needed clip. (`clipRegionIntersectsRectangle` has the symmetric but _safe_ over-claim — over-reporting intersection is the conservative direction for a may-intersect query.)
- **Contour storage is `number[][]`, not typed-array.** The roadmap calls for `Float32Array` flat contours for cheap transform / GPU upload; current per-point `number[]` allocation in `transformClipRegion` and `.map(c => c.slice())` deep copies are GC-heavy on a per-frame animated clip. This is a breaking `@flighthq/types` change (`ClipRegion.contours: number[][] | null`), cross-cutting every backend clip module — a types-layer decision, not in-cell.
- **`createClipRegionFromContours` captures the caller's array by reference** (`clip.contours === the passed array`, asserted by the test), whereas every other constructor clones. Ownership is inconsistent and undocumented: a later caller mutation leaks into the region. Either clone for symmetry or document the borrow explicitly. (In-cell, small.)
- **No winding helpers / normalization.** `getClipRegionWinding`, explicit winding constructors, and even-odd↔non-zero conversion are absent; winding correctness lives entirely in backends. Several constructors hardcode `'nonZero'` on rect results, which is fine, but there is no canonical place to set/convert the rule.
- **No functional/visual test.** No scene exercising nested `intersectClipRegions` across Canvas/DOM/WebGL to confirm the descriptor's bounds match what each backend actually clips. jsdom unit tests cannot reach this; the conservative-bounds behavior is exactly the kind of thing a visual parity test would catch.
- **No Rust `flighthq-clip` crate.** Charter front matter declares `crate: flighthq-clip`; it does not exist yet. Naturally sequenced after the TS surface stabilizes.

## Charter contradictions

None — but only because the charter is a stub. "What it is" (hard transform-exact clip: axis-aligned rectangle scissor or flattened-path stencil-then-cover) is fully honored by the code: the rect/contour discriminant, scissor-eligibility preservation through transform/intersect/normalize, and the "softness is the matte's job" delegation (no feathering here) all match. North star, Boundaries, and Decisions are empty, so there is nothing stronger to contradict. The conservative boolean behavior and the `contains`-over-claim are _gaps against the AAA fallback_, not violations of a stated rule — which is itself the signal that the charter needs to _state_ the rules (see Open directions).

## Contract & docs fit

**Package living up to the contract — strong.**

- Types-first: `ClipRegion`/`HasClip`/`PathWinding` all in `@flighthq/types`; the package adds no cross-package types inline. ✓
- Full unabbreviated names, globally self-identifying (`createClipRegionFromRoundedRectangle`, not `createRoundedClip`). ✓
- `out`-params on every mutating/compute function, all documented alias-safe and tested for the aliased case. ✓
- Sentinels-not-throws: empty/disjoint regions return empty data; no throws on expected inputs. ✓
- Single root `.` export, `sideEffects: false`, pool bracket naming (`acquire`/`release`), `invalidate*` version idiom consistent with the SDK. ✓
- Allocation discipline: `create*`/`clone*`/`acquire*` allocate; `copy*`/`set*`/`get*Bounds`/transform/ intersect/union write to `out`. ✓ One wrinkle: `createClipRegionFromContours`'s by-reference capture (above) is the only allocation-ownership ambiguity.

**Where the docs/contract are stale or need revising (candidate revisions — user's gate):**

- **Package Map entry is already present and accurate.** The bundle's `tools/agents/docs/index.md` carries a full `@flighthq/clip` line (constructors / composition / queries / transform / utilities / pool bracket, "No rendering; rendering is provided by the `displayobject-<backend>` clip modules"). It is well-placed and matches the realized surface — **no revision needed**, contrary to a reading that the entry is still missing. The status doc's claim that it was "added in pass 2" verifies.
- **The package `description` still advertises a product, not the library:** "ClipRegion: hard geometric clip product built from rectangles or paths" (`package.json`). Post-expansion the package is a clip _operations_ library; the description undersells composition/queries/transform. Candidate reword.
- **`charter.md` front matter promises `crate: flighthq-clip`** that does not exist. Not wrong (it is intent), but the register/conformance map should track it as TS-ahead-of-Rust.

## Candidate open directions

The charter's North star / Boundaries / Decisions are TODO; every choice below was assumed against the AAA fallback and should be settled into the charter:

1. **Where does exact boolean algebra live?** This is the package's biggest question and a hard cross-package fork: a path boolean kernel (`intersectPaths`/`subtractPaths`/`xorPaths`) in `@flighthq/path` or a `@flighthq/path-boolean` neighbor, with `clip` composing exact `subtract`/`xor`/`intersect` over it — vs. accepting conservative-bounds as the permanent contract because the renderer's stencil-then-cover realizes the true geometry anyway. The charter should state whether exact algebra is **in scope for `clip`** or explicitly delegated. (Touches structural-fork A: source-data vs. participation, and the bedrock test for a `path-boolean` cell.)
2. **Is conservative containment acceptable, or must `clipRegionContainsRectangle` be exact (or under-claim) for contour forms?** This is a correctness-contract decision, not just a gap — the current false-positive direction needs a blessed ruling.
3. **Contour storage: `number[][]` vs `Float32Array`.** A types-layer/breaking decision that coordinates with every backend clip module; settle before the Rust port locks the seam.
4. **Ownership of `createClipRegionFromContours` input** — clone (symmetry) or document the borrow.
5. **Winding normalization ownership** — does `clip` own even-odd↔non-zero conversion and explicit winding constructors, or does that stay in backends?
6. **Boundaries / non-goals** — confirm soft/feathered masking (MatteFilter), actual rasterization (`displayobject-<backend>` clip modules), and per-node trait wiring (`node`/`displayobject`) are stated non-goals, matching the current correct absences.
