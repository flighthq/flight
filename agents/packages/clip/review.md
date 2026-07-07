---
package: '@flighthq/clip'
status: solid
score: 78
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - incoming/integration-b2824e3d8/head/packages/clip/
  - incoming/integration-b2824e3d8/changes.patch (packages/clip/ slice)
  - charter.md
  - agents/packages/CONTRACT.md
  - agents/packages/structural-forks.md
  - agents/index.md
---

# clip — Merge Review (integration → origin/main)

> Harsh merge gate. The **approved baseline** is `origin/main` (`eb73c3d74`) at `incoming/integration-b2824e3d8/base/packages/clip/` — a three-export construction stub (`createClipRegionFromPath`, `createClipRegionFromRectangle`, `invalidateClipRegion`). The **candidate** is the integration head at `incoming/integration-b2824e3d8/head/packages/clip/`. This review judges only the **delta** (head vs base), grounded in the `packages/clip/` hunks of `changes.patch`. Cited as `b2824e3d8:packages/clip/...`. Judged against `charter.md` (draft; `Decisions` empty) and, where the charter is silent, the codebase-map AAA standard + `CONTRACT.md` + structural forks.

## Verdict

**revise — 78/100. Mergeable after two in-cell fixes.** The delta is the operational half of the package: base had 3 exports, head's `clipRegion.ts` carries **24** — composition, queries, transform, clone/copy/set, a pool bracket, and five shape constructors — all colocated-tested (54 tests, every export covered, alias cases included). The architecture is clean and the house-style discipline is real. But two findings in the **new** surface are correctness defects, not cross-package gaps, and both should be fixed before this lands on the approved floor: `clipRegionContainsRectangle` returns a **false positive** on the contour form (an unsafe-direction `contains` predicate), and `createClipRegionFromContours` silently **borrows** the caller's array where every sibling constructor clones. Neither needs another package; both are local. The conservative boolean algebra (the package's defining gap) is correctly a cross-package fork and is _not_ a blocker for this merge.

The delta touches only `clipRegion.ts` and `clipRegion.test.ts` — `package.json`, `index.ts`, and the `ClipRegion` type in `@flighthq/types` are unchanged from base (confirmed: `grep` finds no `packages/clip/package.json` or `packages/types/src/ClipRegion` hunk in `changes.patch`).

## Scorecard (7 axes, delta only)

1. **Composition / bedrock — PASS.** The delta is a flat set of free functions over the `ClipRegion` value; no config-gated mega-function, no fused subjects. Path _flattening_ is borrowed from `@flighthq/path` (`b2824e3d8:packages/clip/src/clipRegion.ts:12` imports `flattenPath`; the shape constructors compose `createPath` + `append*` appenders, lines 482–522), so `clip` stays a thin region layer over a path primitive rather than absorbing tessellation. The one missing primitive underneath — a path-boolean kernel — is correctly _not_ bundled here (it would be the wrong home); its absence shows up as the conservative boolean behavior, which is a delegation question, not a decomposition smell in this cell.

2. **Naming clarity — PASS.** Every new export carries the full unabbreviated type word and is globally self-identifying: `createClipRegionFromRoundedRectangle`, `clipRegionIntersectsRectangle`, `normalizeClipRegion`, `acquireClipRegion`/`releaseClipRegion` (`b2824e3d8:packages/clip/src/clipRegion.ts:139,50,250,18,316`). `is*` for booleans (`isClipRegionEmpty`, `isClipRegionRectangular`, lines 232,239), `get*` for the accessor (`getClipRegionBounds`, line 151). No abbreviation, no vague verb. This is the word a reader reaches for.

3. **Tree-shaking / bundle invariant — PASS.** `index.ts` is still a single `export * from './clipRegion'` (unchanged by the delta); `package.json` keeps `"sideEffects": false`; the pool, `KAPPA`, and `NORMALIZE_EPSILON` are module-level at the file bottom (`b2824e3d8:packages/clip/src/clipRegion.ts:427–435`) with no top-level execution. No `register*`/global mutation at import. No shared hot-loop branch or growing `switch` that every importer pays — each function tree-shakes independently. An assembly never taxes a primitive here.

4. **Registry vs closed union (fork B) — PASS / N/A.** No `kind`/handler family is introduced. The only discriminant is the `contours === null` rect-vs-contour fork, which is a two-state value shape (a closed binary, not a growing family) and is the right call. Winding is a closed `'nonZero' | 'evenOdd'` `PathWinding` from `@flighthq/types`, again a genuine closed set. Nothing in the delta wants a registry.

5. **Subject triad + plurality guard — PASS.** No format codec or backend code is mis-homed here. Rasterization (scissor/stencil) is correctly _absent_ and delegated to `displayobject-<backend>` clip modules per the type doc (`head/packages/types/src/ClipRegion.ts`), and the delta introduces no premature `clip-formats`/`clip-<backend>` split. The cell stays a single value-leaf.

6. **Contract hygiene — PARTIAL (one new contract violation).** Strong on most counts: types stay in `@flighthq/types` (the delta adds no inline cross-package type; it widens its imports to `MatrixLike`/`PathWinding`/`RectangleLike`, `b2824e3d8:packages/clip/src/clipRegion.ts:13`); `Readonly<>` on every input param; `out`-params on all compute/mutate functions with alias-safe locals-first reads (`intersectClipRegions` lines 163–179, `transformClipRegion` lines 334–344, `unionClipRegions` lines 398–405) and aliased tests for each; sentinels not throws (empty/disjoint return empty data); allocation verbs honored (`create*`/`clone*`/`acquire*` allocate, `copy*`/`set*`/transform/intersect/union write to `out`). **The violation:** `createClipRegionFromContours` captures the caller's array by reference — `return { contours, ... }` with no clone (`b2824e3d8:packages/clip/src/clipRegion.ts:106-110`), asserted by its own test `expect(clip.contours).toBe(contours)` (`...clipRegion.test.ts:231`) — while every other constructor clones (`createClipRegionFromRectangle` clones the rect, line 134; `cloneClipRegion` deep-copies, line 82). This is an undocumented, asymmetric borrow: a later caller mutation leaks into the region. See objection below.

7. **Tests & honesty — PASS (with one honest-comment lapse).** `clipRegion.test.ts` is colocated, `describe` blocks alphabetized and mirroring every export, 54 cases, alias cases present for all `out`-param functions (`...clipRegion.test.ts:342-360,554-560`). No dead export, no unexported-but- implemented public surface (the helpers `pointInContours`/`append*ToPath`/`setRectangleToContoursBounds` are correctly file-private). The lapse is a _comment_ that overstates: `intersectClipRegions`'s "Contours ∩ rect: keep contours, clipped bounds computed above" (`b2824e3d8:packages/clip/src/clipRegion.ts:207-208`) implies the contours are clipped — they are not; only the bounds rect is intersected, the kept contours are copied verbatim (line 209) and can extend outside `out.rect`. The comment should say "bounds clipped, contours kept verbatim (conservative)".

## Objections (grounded in the delta)

### MAJOR — `clipRegionContainsRectangle` false-positives on the contour form (unsafe-direction `contains`)

`b2824e3d8:packages/clip/src/clipRegion.ts:44-46`:

```ts
export function clipRegionContainsRectangle(clip: Readonly<ClipRegion>, rectangle: Readonly<RectangleLike>): boolean {
  return enclosesRectangle(clip.rect, rectangle);
}
```

It tests only the _bounding rect_, ignoring `clip.contours`. For a concave/holed/triangular contour region a rectangle inside the bounding box but outside the real fill returns `true` — a **false positive**. The doc comment admits "bounding-box approximation (conservative)" (line 43) but the direction is _not_ conservative for a `contains` query: a containment predicate must _under_-claim (return `false` when unsure), because a consumer that trusts `true` (culling, interaction skip) will skip a clip that is actually needed. Contrast the sibling `clipRegionIntersectsRectangle` (lines 50–52), whose bounding-box over-claim _is_ the safe direction for a may-intersect query. The two predicates have opposite safe directions and the delta got one backwards. This is new surface (the export did not exist in base) shipping an incorrect answer, so it is a merge objection, not a roadmap gap. **Fix:** for the contour form, fall back to `false` (honest under-claim) unless an exact polygon-contains is implemented — and update the comment to say the contour answer is a conservative _false_, not a conservative _true_. The test (`...clipRegion.test.ts:104-114`) only covers the rect form, so it would not catch a fix that corrects the contour direction; add a contour false-positive case.

### MAJOR — `createClipRegionFromContours` borrows the caller's array; every sibling clones

`b2824e3d8:packages/clip/src/clipRegion.ts:106-110`:

```ts
export function createClipRegionFromContours(contours: number[][], winding: PathWinding): ClipRegion {
  const rect = createRectangle();
  setRectangleToContoursBounds(rect, contours);
  return { contours, rect, version: 0, winding };
}
```

`contours` is stored by reference (test asserts `expect(clip.contours).toBe(contours)`, `...clipRegion.test.ts:231`). Every other producer in the delta clones its source — `createClipRegionFromRectangle` (`cloneRectangle`, line 134), `cloneClipRegion`/`copyClipRegion` (`.map(c => c.slice())`, lines 82,91), even `intersectClipRegions`/`unionClipRegions` deep-copy kept contours (lines 209,218,413,420). This lone borrow is an undocumented, asymmetric ownership rule: a later caller mutation silently corrupts the region's geometry without an `invalidateClipRegion` bump. The signature also takes a mutable `number[][]`, not `Readonly<...>`, advertising a borrow the contract forbids by default. **Fix:** clone for symmetry (`contours.map((c) => c.slice())`) and accept `Readonly<readonly number[][]>`, OR, if the by-reference capture is a deliberate zero-copy fast path, document the borrow in a durable comment and keep the param mutable — but the silent inconsistency is not the final shape. The existing test must be updated to assert the chosen ownership.

### MINOR — `intersectClipRegions` contour∩rect leaves contours wider than the stated bounds rect

`b2824e3d8:packages/clip/src/clipRegion.ts:198-220`. The result rect is the _intersection_ of the two bounds (lines 198–201), but the kept contours are the _unclipped_ input contours (line 209: `aContours.map(...)`). So `out.contours` can describe geometry outside `out.rect` — an internal inconsistency where the bounds rect no longer encloses the contours it is paired with. Downstream culling that trusts `rect` as the contour extent will be wrong. This is the conservative-bounds behavior the charter parks as a cross-package decision (a path-boolean kernel), so it is **not a merge blocker** — but the _comment_ claiming the contours are "clipped" (lines 207–208) is dishonest about it and should be corrected in this delta even though the algebra stays conservative. (`unionClipRegions` lines 412–421 has the analogous keep-verbatim behavior, which is correct for a union since the merged rect already encloses both.)

### MINOR (carry-over, not introduced by the delta) — `package.json` description still says "product"

`head/packages/clip/package.json` still reads `"ClipRegion: hard geometric clip product built from rectangles or paths"`. The delta does **not** touch `package.json` (no such hunk in `changes.patch`), so this is a baseline carry-over, not a delta regression — flagged only so the integration worker rewords it post- expansion (it is now an operations library, not a single product). Not weighed against the merge.

## Cross-package gaps (NOT merge blockers — charter `Open directions`)

These are correctly out of this cell and must not gate the merge; they are the charter's open forks:

- **Exact boolean algebra** is conservative-bounds-only (no `subtractClipRegions`/`xorClipRegions`, no true contour intersection/union). The kernel (Vatti/Weiler-Atherton/Martinez) belongs in `@flighthq/path` or a `path-boolean` neighbor — a cross-package design decision. The renderer's stencil-then-cover realizes the true geometry of the _kept_ contours, which is why conservative bounds is a defensible interim contract.
- **Contour storage `number[][]` vs `Float32Array`** — a breaking `@flighthq/types` change coordinating with every backend clip module; the per-point `.map(c => c.slice())` deep copies (lines 82,91,209,…) and the per-point `new Array` in `transformClipRegion` (lines 375–386) are the GC cost this would remove. Settle before the Rust `flighthq-clip` seam locks.
- **Winding helpers** — no `getClipRegionWinding`, explicit-winding constructors, or even-odd↔non-zero conversion; winding correctness lives in backends.
- **Rust `flighthq-clip` crate** — charter declares it; it does not exist yet. TS-ahead-of-Rust.
- **Functional/visual parity test** — no scene exercises nested `intersectClipRegions` across Canvas/DOM/WebGL to confirm the descriptor's bounds match what each backend clips. jsdom cannot reach it.

## Charter alignment

The charter's "What it is" and proposed North star are fully honored by the delta: value-typed side-effect-free leaf, scissor-eligibility preserved through transform/intersect/normalize, hard clipping with softness delegated to MatteFilter. The two MAJOR objections above are _exactly_ the questions the charter's Open directions #2 (contour-`contains` correctness) and #4 (`createClipRegionFromContours` ownership) flag as needing a blessed ruling — which is the signal that they should be resolved _before_ this lands on the approved floor rather than after, since the floor is what subsequent work conforms to.
