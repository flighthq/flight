---
review: integration merge-review (harsh)
target: integration
head: b2824e3d88375ca0a502335d3ab032020c1634ab
base: origin/main eb73c3d744273f5c5248cd953548b9973c637c15
sibling-bundles:
  builder: 67dc46d64c0ecbd3810ea42708e26691ea07440b (same base eb73c3d74)
  integration-prev: 6ec7beabd
date: 2026-06-25
---

# Integration Merge Review — `b2824e3d8` vs `origin/main` `eb73c3d74`

This is the synthesis layer of a harsh merge-review of the Flight integration branch against the approved `origin/main` baseline. It leads with the structural finding about the shape of the delta, then gives the per-package verdicts, the cross-cutting standard violations, the direction decisions the user must make before merging, and the dispatch plan for the staged briefs.

---

## 0. CORRECTION (2026-06-25, from git evidence run1/run2)

**The interpretation below in §1 — "(c) stranded in builder, accidental partial-merge" — is WRONG.** `git range-diff origin/main..67dc46d64(builder) origin/main..b2824e3d8(integration)` and `git diff 67dc46d64 b2824e3d8 -- packages/geometry packages/node packages/displayobject` settle it:

- **Integration is the advanced, deliberately-curated branch** (22 commits on origin/main, including `feat(ts): add beta apis`, per-package beta commits, and `refactor: apply revision pass`).
- **Builder is an abandoned 2-commit early snapshot**: a single `save progress` WIP dump (dropped from integration's history entirely) plus the `review:snapshot` script commit. The "missing engine core" is _builder's speculative WIP additions_ to geometry/node/displayobject that integration never carried forward — **not** work accidentally stranded out of integration.
- Therefore the engine core matching origin/main in integration is **intentional pruning (answer b), already done** — this is the user's category (C) convergence, not a broken merge. The lead recommendation "do not merge until prune-vs-strand is resolved" is **withdrawn**: integration is a legitimate curated baseline.

The real question flips to: _which of builder's pruned core helpers (if any) should be ported forward_ (several look wanted for OpenFL parity + the in-scope 3D pipeline — raycasting, frustum-sphere culling, node traversal, `disposeNode`, `Loader`, the full `Stage` property set, `cacheAsBitmap`/`scrollRect`). And: integration's revision pass introduced a few **non-prune regressions** to fix regardless — `===`→`==` in `getNodeChildIndex`/`swapNodeChildren`, a lost `Readonly<>` on `getNodeWorldTransformRevision`, and lost matrix pooling in `convertNodeVector3GlobalToLocal`.

The app/filters-css build breaks (§2) remain real REJECTs, but they are independent tsc-b bugs, **not** evidence for the stranded-core theory. Everything below this banner predates this correction.

---

## 1. The central finding: the entire engine core is ABSENT from this integration delta

The integration delta (`b2824e3d8` vs `origin/main` `eb73c3d74`) touches **exactly 55 packages** — and they are all in one band: platform/IO capabilities, the host/event seams, text + layout + shaping, the `-formats` codecs, and the GL **2D** renderers. **Zero** files in the entire engine core changed. These **34 reviewed cells have no diff at all** in the candidate:

```
camera, displayobject, displayobject-canvas, displayobject-dom, displayobject-wgpu,
easing, effects, effects-canvas, effects-gl, effects-wgpu, entity,
filters-gl, filters-surface, filters-wgpu, geometry, interaction, lighting,
materials, math, media, menu, mesh, node, particles, particles-formats, path,
render-wgpu, scene, scene-wgpu, shape, signals, spritesheet, tween, webcam
```

Verified mechanically: in `incoming/integration-b2824e3d8/`, every one of these 34 directories is **byte-identical between `head/` and `base/`** (e.g. `diff -rq base/packages/geometry head/packages/geometry` → IDENTICAL). The MANIFEST confirms exactly 55 packages with a non-zero `changedFiles` count; the 34 above are not among them.

### Is the core (a) already in origin/main, (b) intentionally pruned, or (c) stranded in builder?

**The evidence points hard at (c): stranded in `builder` and missing from the merge.** Two facts settle it:

- **The core is NOT already in `origin/main`.** The `builder-67dc46d64` bundle shares the _same base_ `eb73c3d74` as this integration candidate, and it **does** carry core work: `diff -rq builder/base/packages/geometry builder/head/packages/geometry` → **DIFFERS**. If the core were already in `origin/main`, builder's diff against that same base would be empty. It is not. So there is real, unmerged core work, and the approved floor does not yet contain it.
- **The core IS in `builder` but NOT in `integration`.** Builder touches **all 89 packages**, including every one of the 34 absent cells. Integration touches **55**, none of them. Same base, divergent heads. The integration candidate is the platform/text/format/GL-2D _slice_ of the builder work, merged without the engine-core slice.

This is the same fault the `@flighthq/app` reject exhibits in miniature: `app.ts` was merged but the enriched `@flighthq/types` `App` header it compiles against was dropped on the merge — and that header **exists in builder-67dc46d64**. A partial merge stranded the dependency. The app case is the canary for the whole-core case.

### Concrete host commands to settle it definitively

Run these on the host (range-diff / log need the real object graph, not the bundle snapshots):

```bash
# 1. Is the core already on the approved floor? (expect: core packages present here = NO,
#    meaning origin/main lacks the core work builder carries)
git log origin/main..b2824e3d8 --oneline -- packages/geometry packages/node packages/displayobject \
  packages/render-wgpu packages/materials packages/effects
# empty output for these paths ⇒ the integration branch added nothing to the core (answer not-a).

# 2. Side-by-side: what does builder carry that integration does not?
git range-diff origin/main..67dc46d64 origin/main..b2824e3d8
#   commits present only on the builder side = the stranded core work (answer c).

# 3. Direct head-to-head: builder-head vs integration-head, scoped to the core.
git diff 67dc46d64 b2824e3d8 -- packages/geometry packages/node packages/displayobject \
  packages/effects packages/materials packages/render-wgpu packages/particles packages/path \
  packages/tween packages/signals packages/entity packages/interaction
#   large non-empty diff ⇒ the core lives in builder, absent from integration (confirms c).
```

If (3) shows the core only in builder, the merge decision is **not** "approve these 55" — it is "why did the engine-core slice not come along, and should integration be re-cut from builder (or builder's core re-merged onto integration) before any of this lands." Approving the 55 in isolation ships a platform/text/format layer on top of an _unchanged_ core, which is internally consistent only if the core was deliberately pruned (b). Nothing in the bundle metadata indicates an intentional prune; the `app` header drop indicates an _accidental_ partial merge.

> **Lead recommendation:** treat the missing core as the gating question. Do not merge the 55 until the user confirms whether the core was intentionally held back or accidentally stranded. The per-package verdicts below are correct _for the slice that is present_, but the slice itself may be the wrong unit to merge.

---

## 2. Verdict table — the 55 touched packages

Three packages received full harsh per-package reviews this session (`app`, `clip`, `filters-css`); the remaining 52 are listed with their delta size from the MANIFEST and are **pending** harsh review (no `review.md`/`assessment.md`/brief yet). `Δ` is `changedFiles` from the bundle MANIFEST.

### Reviewed (3)

| Package | Δ | Verdict | One-line |
| --- | --: | --- | --- |
| `@flighthq/app` | 2 | **REJECT** | High-quality `app.ts`/`app.test.ts`, but the integration tree dropped the `@flighthq/types` `App` header it compiles against — `tsc -b` fails on both files. Re-land the header (from builder-67dc46d64) and it builds. A re-merge problem, not a redesign. |
| `@flighthq/clip` | 2 | **REVISE (78/100)** | Mergeable after two in-cell MAJOR fixes (contour false-positive in `clipRegionContainsRectangle`; silent borrow in `createClipRegionFromContours`) + one honest-comment fix in `intersectClipRegions` — all within `clipRegion.ts` and its test. |
| `@flighthq/filters-css` | 1 | **REJECT** | The delta is a single broken `index.ts` re-exporting eight symbols from a non-existent `./svgFilterUrl` module — `tsc -b` and `exports:check` fail. Strictly worse than the compiling base. Revert the barrel or land `svgFilterUrl.ts` + tests as a coherent unit. |

**Reviewed tally:** clean(0) · revise(1) `clip` · reject(2) `app`, `filters-css`.

### Pending harsh review (52)

Grouped by band, with Δ. None of these has a verdict yet — the slice was reviewed depth-first on the three above; the rest inherit the §1 gating question regardless.

- **Platform / capability seams:** `application`(4), `clipboard`(4), `device`(4), `dialog`(2), `filesystem`(4), `geolocation`(2), `haptics`(2), `ipc`(4), `keyboard`(2), `lifecycle`(2), `network`(2), `notification`(2), `platform`(4), `power`(2), `protocol`(2), `screen`(4), `sensors`(2), `share`(4), `shell`(2), `shortcut`(4), `statusbar`(4), `storage`(3), `tray`(2), `updater`(2), `host-electron`(2).
- **Text stack:** `text`(7), `textinput`(8), `textlayout`(8), `textshaper`(6), `textshaper-canvas`(2).
- **`-formats` / codec triad:** `device-formats`(6), `platform-formats`(6), `resource-formats`(6), `spritesheet-formats`(8). _(The first three are already register-rejected as packages — see §4.)_
- **Render / GL-2D:** `render`(3), `render-gl`(4), `displayobject-gl`(23), `scene-gl`(33), `filters`(7), `filters-canvas`(4), `texture`(6).
- **Resources / loading / animation:** `resources`(21), `loader`(2), `sprite`(8), `spritesheet`… _(spritesheet itself is absent; only `spritesheet-formats` is in delta)_, `timeline`(4), `surface`(4), `surface-rs`(2), `velocity`(2).
- **Misc / infra:** `input`(2), `log`(4), `sdk`(5), `types`(8).

The two largest deltas — `scene-gl`(33) and `displayobject-gl`(23) — are the GL **2D** renderers and deserve early harsh review; they are the load-bearing rendering surface of the slice and the place a partial-merge regression would bite hardest.

---

## 3. Cross-cutting themes — the standards most violated across the slice

Drawn from the three reviewed cells plus the structural-forks/register context. The faults cluster into two distinct kinds: **merge-integrity** faults (the slice broke its own dependencies) and **standard-conformance** faults (the new surface violates house rules). The first kind dominates and is the more alarming.

### T1 — Contract hygiene / header-implementer coupling broke twice (the dominant theme)

The single most-repeated failure is **a symbol asserted without its substrate**, producing a `tsc -b` break that should never have reached an integration branch:

- `@flighthq/app`: `app.ts` imports `AppActivationPolicy`/`AppLoginItem`/`AppLoginItemLike`/ `AppPathKind` and calls a ~40-method `AppBackend`, but the in-tree `@flighthq/types` `App.ts` is byte-identical to base (3 signals, 17-method backend). The header was **dropped on the merge** — it exists in builder-67dc46d64.
- `@flighthq/filters-css`: `index.ts` re-exports eight `svgFe*`/`createSvgFilterDataUri` symbols from `./svgFilterUrl`, a file that does not exist in the package. Only the barrel line came across from a more-advanced builder snapshot; the implementation did not.

Both are the _same disease as §1_: a partial merge that brings a consumer without its producer. This is the codebase map's explicit gate (`@flighthq/types` is "the header layer … the full API shape should be navigable from it alone"); the slice violated it twice in three reviews. **Direction-worthy process fix:** require a header and its implementer to land _together_ as a build-gate rule, so a drop surfaces as CI failure rather than reaching integration (raised as a question by the `app` brief).

### T2 — Contract honesty: dishonest comments and silent ownership asymmetry

`@flighthq/clip` carries the conformance-quality faults the harsh bar exists to catch:

- **Unsafe predicate direction.** `clipRegionContainsRectangle` returns a rect-vs-rect answer for the _contour_ form, ignoring `clip.contours` — a false `true` for a concave/holed region (the _unsafe_ direction for `contains`; a culling consumer skips a needed clip). Its sibling `clipRegionIntersectsRectangle` over-claims in the _safe_ direction. The `contains` form got the safe direction backwards.
- **Silent borrow vs. clone asymmetry.** `createClipRegionFromContours` stores the caller's array by reference (mutable `number[][]` param, no `Readonly<>`) while _every_ sibling producer clones — violating the "allocation explicit / `create*` may allocate / `Readonly<>` by default" constraints, and risking silent corruption with no `invalidateClipRegion` bump.
- **Dishonest durable comment.** `intersectClipRegions`'s contour∩rect comment claims the kept contours are clipped; the code copies them verbatim. The map's rule is that durable comments explain _what the code is_ — this one misrepresents it.

### T3 — Tree-shaking / barrel discipline (one breach, otherwise clean)

The `filters-css` dangling re-export is also a **barrel-integrity** breach: a thin root `.` barrel that points at a phantom module. Where the slice was reviewed, the positive discipline held — `clip` and `app` both keep `"sideEffects": false`, a single root `.` export, module-level pools/constants at file bottom with no top-level execution, and no per-file subpaths. The breach is an isolated merge artifact, not a design regression.

### T4 — Naming / verbs / out-param alias-safety (PASS where reviewed)

Worth recording as a _clean_ axis: across the three reviewed cells, full unabbreviated type words in function names, correct `get*`/`has*`/`is*`/`set*`/`create*`/`dispose*`/`destroy*` verbs, alias-safe `out`-params with locals-first reads and aliased-case tests, and `Readonly<>`/`*Like` read-write splits all held up (the lone exception is the `clip` mutable-param borrow under T2). The harsh bar found nothing systemic here in the reviewed slice — the violations are integrity (T1) and honesty (T2), not naming.

### T5 — Triad / plurality / bedrock (the `-formats` cells should not be here)

Three `-formats` packages are **in the delta** — `device-formats`, `platform-formats`, `resource-formats` — and all three are **already register-rejected** (structural-fork E, the plurality guard and bedrock test): `device-formats`/`platform-formats` split a subject with no plurality and misname a UA string as a `-format` (verdict: collapse into a new `useragent` primitive); `resource-formats` duplicates `spritesheet-formats` as a symptom of `TextureAtlas` being mis-homed in `resources` (verdict: becomes `textureatlas-formats` _after_ `textureatlas` is extracted). Merging the slice as-is would **land already-rejected packages onto the approved floor** — exactly the wrong direction. See §4.

### Composition / registry-vs-union

No new monolith-smell or closed-union-where-registry-belongs violation surfaced in the three reviewed cells (`clip` passes the composition/bedrock axis — flat free functions over the `ClipRegion` value, path flattening _borrowed_ from `@flighthq/path` rather than absorbed). The registry-vs-union fork is **latent** in `filters-css`: the downstream `computeBitmapFilterCss` dispatch (closed switch vs. registry) is a real fork but is _gated_ on the SVG/aggregator layer landing, which it has not. Not actionable against the current delta.

---

## 4. Feedback & questions for the user — direction decisions needed before merging

Grouped by the recurring Open directions. These are the calls only the user can make; the merge should not proceed past the ones marked **gating**.

### A. The engine-core slice (GATING — answer first)

1. Was the engine core **intentionally pruned** from this integration candidate (answer b), or **accidentally stranded** in builder (answer c)? The evidence (same base, builder carries the core, integration does not, the `app` header drop is an accidental partial-merge canary) points at (c). Run the three host commands in §1. **Until this is answered, none of the 55 should merge** — the slice may be the wrong unit.
2. Should "a `@flighthq/types` header and its implementer land together" become a **build-gate CI rule**, so a header drop fails CI instead of reaching an integration branch? (The `app` and `filters-css` rejects are both this fault.)

### B. The `-formats` triad — bedrock / plurality (GATING for those 3 packages)

3. `device-formats`, `platform-formats`, `resource-formats` are **in this delta but already register-rejected**. Confirm the standing verdicts before they land on the approved floor:
   - `device-formats` + `platform-formats` → **collapse into `useragent`** (a pure UA-string→identity value-leaf used only by the _web backends_ of `device`/`platform`). Do they merge as-rejected and get reworked, or get held out of the merge entirely?
   - `resource-formats` → **redirect to `textureatlas-formats`**, sequenced _after_ `textureatlas` is extracted from `resources`. Same question: hold out, or merge-then-rework? This is the bedrock test (substantial+irreducible / well-homed / honest-naming) applied — none of the three passes as a package today.

### C. `@flighthq/clip` correctness contract (GATING for clip — charter Open directions #2, #4)

4. **Containment direction (Open #2):** bless the rule for `clipRegionContainsRectangle` on contour forms — must it **under-claim** (return `false` when unsure, the safe direction) or is an **exact polygon-contains** required? The merge needs at minimum the honest under-claim.
5. **`createClipRegionFromContours` ownership (Open #4):** **clone-for-symmetry** (default; `Readonly<>` param) or a **documented deliberate zero-copy borrow**? Both are acceptable shapes; the user blesses which becomes the contract. The silent asymmetry must be resolved either way.

### D. `@flighthq/filters-css` SVG tier (GATING for filters-css)

6. Is the SVG/`svgFilterUrl` data-URI tier meant to **land in this integration pass at all**? This one answer decides revert-to-base-barrel (path a) vs. land-the-tier-whole (path b). All downstream `filters-css` forks (registry-vs-switch for `computeBitmapFilterCss`, the `getShadowFilterOffset` barrel-name collision, SVG anisotropy, aggregation ownership `computeFiltersCss` here vs. in `render-dom`, the `render-dom` consume + pixel baseline) are **gated on this** and are not actionable until a real SVG/aggregator layer lands.

### E. Larger parked forks (non-gating — record, do not act autonomously)

7. **`clip` exact boolean algebra (Open #1):** does the polygon-clipping kernel (Vatti/ Weiler–Atherton/Martinez–Rueda) live in `@flighthq/path` / a new `path-boolean` neighbor, with `clip` composing region-semantics over it — or is conservative-bounds the _permanent_ contract because the renderer's stencil-then-cover realizes the true geometry anyway? The largest fork; gates `subtractClipRegions`/`xorClipRegions`.
8. **`clip` contour storage (Open #3):** `number[][]` → `Float32Array` is a breaking `@flighthq/types` change to settle **before the Rust seam locks**.
9. **`AppLaunchKind`/`AppMemoryPressure`:** after the `app` header re-lands, do these return as types-without-implementers, and do they belong to `@flighthq/app` or `@flighthq/lifecycle` (wire-or-retract)?

---

## 5. Dispatch plan — staged briefs ready for `assign:worktree`

Three dispatch briefs are staged under `outgoing/integration/`, grouped by verdict. Each is a self-contained, file-and-line-specific work order against the integration tree.

### REJECT — return to builder/re-merge before retry (2)

- **`outgoing/integration/app.md`** — Re-land the enriched `@flighthq/types` `App` header from builder-67dc46d64 (extend `packages/types/src/App.ts` to the six-signal interface + ~40-method `AppBackend`; add `AppActivationPolicy.ts` / `AppLoginItem.ts`+`AppLoginItemLike` / `AppPathKind.ts`; export each from `index.ts`). `app.test.ts` compiles automatically once it lands. Confirm `tsc -b` passes on both `app.ts` and `app.test.ts`. _The implementation itself is approve-as-is._
- **`outgoing/integration/filters-css.md`** — Resolve the dangling `./svgFilterUrl` re-export in `src/index.ts`: **(a)** revert to the base 3-export barrel, OR **(b)** land `src/svgFilterUrl.ts` + colocated `src/svgFilterUrl.test.ts` covering all eight exports as a coherent unit. Do not land the half-state. Verify `tsc -b` and `npm run exports:check` pass before re-submitting.

### REVISE — in-cell fixes, then merge (1)

- **`outgoing/integration/clip.md`** — Three changes, all within `packages/clip/src/clipRegion.ts` and its test: (1) fix the `clipRegionContainsRectangle` contour false positive (return `false` honest under-claim + contour test + correct line-43 comment); (2) resolve the `createClipRegionFromContours` silent borrow (clone-for-symmetry _or_ documented borrow, test the chosen ownership); (3) correct the dishonest `intersectClipRegions` contour∩rect comment (comment only — no algebra change). No cross-package change, no new dependency, no API removal.

### Not yet staged (52)

The remaining 52 touched packages have **no brief** — they are pending harsh review. **Do not dispatch them** until §4-A is answered: if the core was accidentally stranded (c), the correct next action is to re-cut/re-merge the full slice, not to file 52 individual briefs against a slice that may be the wrong merge unit. Prioritize harsh review of `scene-gl`(33), `displayobject-gl`(23), `resources`(21), and `types`(8) first — they are the load-bearing and contract-defining cells of the slice.

---

## Appendix — verification commands run for this synthesis

```
# 55 touched packages (delta):
grep -oE '^diff --git a/packages/[^/]+/' incoming/integration-b2824e3d8/changes.patch \
  | sed 's#.*/packages/##; s#/$##' | sort -u | wc -l           # → 55
# 34 core cells absent (each byte-identical head vs base), e.g.:
diff -rq incoming/integration-b2824e3d8/{base,head}/packages/geometry  # → IDENTICAL
# core work IS in builder (same base eb73c3d74):
diff -rq incoming/builder-67dc46d64/{base,head}/packages/geometry      # → DIFFERS
# builder touches all 89 packages; integration touches 55.
```
