---
package: '@flighthq/textshaper'
status: partial
score: 66
updated: 2026-06-25
ingested:
  - status.md
  - source
  - changes.patch
  - charter.md
  - 'base=origin/main(eb73c3d74)'
  - 'evidence=integration-b2824e3d8 delta'
---

# textshaper — Review (merge gate: integration-b2824e3d8 → origin/main eb73c3d74)

This is a **merge review of the delta only**. Baseline is the approved `origin/main` (`eb73c3d74`), checked out under `incoming/integration-b2824e3d8/base/packages/textshaper/` — the advances-only seam (`index.ts`, `textShaper.ts` + test). The candidate is `incoming/integration-b2824e3d8/head/`. Findings reference `b2824e3d8:<path>`. The charter is an empty stub, so the bar is the codebase-map AAA standard plus the text-stack design (itemize/bidi → **shape** → layout → rasterize; textshaper owns the shape seam).

**Scope note.** The prior `review.md` in the tree (score 62, `base=builder-67dc46d64`) surveyed a _much larger_ head — 16 files with itemize/cluster/cache/pool/signals. This integration branch carries a **trimmed** subset of that work: it adds only `_textShaperHooks.ts` and `textShaperRun.ts` (plus the `@flighthq/types` extensions). No `textShaperItemize`/`Cluster`/`Cache`/`Pool`/`Signals` modules are present in this head. That earlier review is **not** the rubric for this gate — only the eb73c3d74→b2824e3d8 delta is judged here.

## Verdict

`partial — 66/100`. **Mergeable after two small grounded fixes.** The delta is a clean, contract-respecting extension of the seam: it adds the full-glyph **shape** path (`shapeTextRun`/`shapeTextRunInto`), the font path (`getFontMetrics`/`getFontMetricsInto`/`getFontUnitScale`), glyph extents (`getGlyphExtents`/`getGlyphExtentsInto`/`getGlyphExtentsBatch`), glyph introspection (`getGlyphIndexForCodePoint`/`getCodePointForGlyph`/`getGlyphName`), the run-shell helpers (`createShapedRun`/`clearShapedRun`), and an internal hook slot (`_textShaperHooks.ts`) that lets `setTextShaperBackend` notify observers through the single setter — the clean version of the seam the older status flagged. Naming, tree-shaking, types-first, sentinels, and alias-safety all pass. The score is held below the seam's structural completeness because, exactly as on the approved base, **every glyph-producing function is an inert null/-1/'' delegate** — no full-glyph backend exists in this delta to exercise it. Two delta-local defects keep it out of "clean": a gratuitous cast in `getFontUnitScale`, and a real signature asymmetry where `shapeTextRunInto` silently drops the `options` (direction/script) hints that `shapeTextRun` forwards.

## What the delta adds (verified against `b2824e3d8:head` source)

- **`b2824e3d8:packages/textshaper/src/_textShaperHooks.ts`** — `_textShaperBackendHook` slot + `_setTextShaperBackendHook`. Underscore-prefixed (internal-by-convention) and **not** re-exported from the barrel (`index.ts` re-exports only `textShaper` + `textShaperRun`), so it adds no public surface. `textShaper.ts` now fires `_textShaperBackendHook?.(backend)` from inside `setTextShaperBackend`, so a future signal group observes backend swaps through one setter rather than a `setTextShaperBackendWithSignals` fork. Colocated `_textShaperHooks.test.ts` exercises install/clear/replace/last-write-wins.
- **`b2824e3d8:packages/textshaper/src/textShaperRun.ts`** (13 exports, alphabetized): `clearShapedRun`, `createShapedRun`, `getCodePointForGlyph`, `getFontMetrics`, `getFontMetricsInto`, `getFontUnitScale`, `getGlyphExtents`, `getGlyphExtentsBatch`, `getGlyphExtentsInto`, `getGlyphIndexForCodePoint`, `getGlyphName`, `shapeTextRun`, `shapeTextRunInto`. All glyph/metrics functions are thin null-guarded delegates to optional `TextShaperBackend` methods, returning documented sentinels (`null`/`-1`/`''`/`false`/`0`).
- **`@flighthq/types`** (`b2824e3d8:packages/types/src/TextShaper.ts`): adds `ShapeRunOptions` (`direction?`/`script?`) and five optional methods to `TextShaperBackend` (`getCodePointForGlyph`, `getFontMetrics`, `getGlyphExtents`, `getGlyphIndexForCodePoint`, `getGlyphName`, `shapeRun`). New one-concept files `FontMetrics.ts`, `GlyphExtents.ts`, `ShapedRun.ts` (+`ShapedGlyph`), all barrel-exported. `measureText` stays required, so measure-only backends remain valid — correct.

## The seven standards, against the delta

1. **Composition / bedrock — PASS.** No feature-as-config-branch, no fused subjects. The hook slot is the correct decomposition of "notify-on-backend-change" out of the setter (avoids the `textShaper.ts` ↔ signals circular dep without a `*WithSignals` fork). `shapeTextRunInto` is the out-param sibling of `shapeTextRun`, not a duplicate. No over-split.

2. **Naming clarity — PASS.** Full unabbreviated type words throughout (`getCodePointForGlyph`, `getFontUnitScale`, `getGlyphExtentsBatch`, `shapeTextRunInto`); `get*`/`create*`/`clear*`/`shape*` verbs used correctly; every name is globally self-identifying. No abbreviations.

3. **Tree-shaking / bundle invariant — PASS.** `package.json` keeps the single `.` export and `sideEffects: false`. `_textShaperHooks` is _not_ in the barrel, so the hook costs nothing to importers of `shapeText`. No eager registration, no new hot-loop branch taxing a primitive, no new dependency (`@flighthq/types` only).

4. **Registry vs closed union (fork B) — N/A / PASS.** No `switch(kind)` introduced; the seam remains a single swappable backend with last-write-wins, which is the package's established model.

5. **Subject triad + plurality guard — PASS.** The delta does not mis-home any format/backend code. Backends (`textshaper-canvas`, future `textshaper-harfbuzz`) correctly live in `<subject>-<backend>` neighbors, not here. No premature split.

6. **Contract hygiene — mostly PASS, two defects.** Types-first honored; `Readonly<>` on every format/input; `out`-params alias-safe (the `*Into` functions read the backend's freshly-returned object before writing `out`, and `out` is never aliased to an input); sentinels not throws; no `dispose*`/`destroy*` misuse; `crate: flighthq-textshaper` consistent. **Defects below.**

7. **Tests & honesty — PASS, one stale claim.** Colocated `textShaperRun.test.ts` and `_textShaperHooks.test.ts`, alphabetized `describe` blocks mirroring exports, covering no-backend, advances-only, and full-backend paths plus the alias/zero-fill cases. No dead or unexported-but-implemented surface in the delta. One **claim/code mismatch** (status doc) noted below.

## Delta defects (each grounded, each sweep-safe within the package)

- **Gratuitous cast in `getFontUnitScale` (`b2824e3d8:packages/textshaper/src/textShaperRun.ts:55`).** `const size = (format as { size?: number }).size ?? 12;` — but `TextFormat.size?: number` is a declared field (`b2824e3d8:packages/types/src/TextFormat.ts:17`), so `format.size ?? 12` reads it directly. The cast invents a structural type that already exists on `TextFormat`, defeating the type system for no reason. Fix: drop the cast, read `format.size`.

- **`shapeTextRunInto` silently drops `options` (`b2824e3d8:packages/textshaper/src/textShaperRun.ts:113-116`).** `shapeTextRun(text, format, options?)` forwards its `options` to `backend.shapeRun(text, format, options)` (line 110), but the out-param sibling `shapeTextRunInto(text, format, out)` takes **no** `options` parameter and calls `backend.shapeRun(text, format)` (line 116) — so the alias-safe/pooled path cannot pass `direction`/`script` hints. For RTL/script-tagged runs (the whole reason `ShapeRunOptions` exists) the two entry points are not interchangeable, and a caller migrating from `shapeTextRun` to the allocation-free `shapeTextRunInto` silently loses shaping hints. Fix: add `options?: Readonly<ShapeRunOptions>` to `shapeTextRunInto` and forward it.

- **Unused-but-advertised `format` parameter on the glyph-introspection wrappers (`b2824e3d8:packages/textshaper/src/textShaperRun.ts:59,65-67,85,95,101`).** The backend's glyph methods are glyphId-only by the delta's own type (`getGlyphExtents?: (glyphId: number) => …`, `getGlyphName?: (glyphId: number) => …`, etc.), so the wrappers' `format` argument is never consumed. The single-glyph wrappers honestly name it `_format` (intentionally unused), but `getGlyphExtentsBatch` (line 67) and `getGlyphExtentsInto` (line 85) name it `format` while never using it — an in-file naming inconsistency, and all of them advertise a `format` parameter the seam cannot honor. This is sweep-safe to normalize (underscore the unused ones for consistency); whether the glyph methods _should_ be format-aware is a seam-shape design question routed to Open directions.

- **Status doc claims an option param that does not exist (honesty, admin-doc).** `status.md` lists `shapeTextRunInto(text, format, out, options?) => boolean` (and `getGlyphExtents?(glyphId, format)` on the backend), neither of which matches the shipped code (`shapeTextRunInto` has no `options`; backend `getGlyphExtents` is glyphId-only). The status was distributed as-claimed from a worker report describing the larger `builder-67dc46d64` head and is now stale against this trimmed integration head. Not a code defect — a status-verification item.

## Not a defect (adversarially re-checked, dropped)

- _"`shapeTextRunInto` dereferences `result` without a null check" (line 116-118)_ — **dropped.** `TextShaperBackend.shapeRun` is typed `=> ShapedRun` (non-null); the `| null` on `shapeTextRun`'s return comes only from the no-backend guard. The deref is type-safe.
- _"unused `format` fails typecheck"_ — **dropped.** `tsconfig.base.json` sets `strict: true` but not `noUnusedParameters`, so the non-underscore unused params do not break `tsc -b`. Style only.
- _Critiques of `shapeText`-returning-`number`, the absent harfbuzz backend, no UBA/itemization, no font fallback_ — **dropped as out-of-delta.** `shapeText` is unchanged from the approved base; the missing backend/itemizer are not regressions this delta introduces. They are real package gaps but belong to the charter's Open directions, not this merge gate.

## Contract & docs fit

Strong. The delta upholds every applicable contract rule (full names, `Readonly<>`, `out`-param alias-safety, sentinels, types-first, single `.` export, `sideEffects: false`, no top-level registration, correct teardown vocabulary, string-kind model untouched). The one admin-doc drift is the stale `status.md` signatures above; the codebase-map Package Map still labels the seam `@flighthq/text-shaping (designed, not yet built)` — a Package-Map-owner revision, not a package change, and pre-existing rather than introduced by this delta.

## Candidate open directions (charter is an empty stub)

1. **North star.** Bless textshaper as the canonical home of the **shape** layer; heavy full-glyph backends stay opt-in `<subject>-<backend>` neighbors per the bundle rule.
2. **Should glyph-introspection methods carry `format`?** Today `getGlyphExtents`/`getGlyphName`/`getCodePointForGlyph`/`getGlyphIndexForCodePoint` are glyphId-only on the backend, so the wrappers' `format` is dead. Decide: format-aware glyph methods (a real font needs the face the format selects) or format-free (drop the wrapper param). A seam-shape ruling.
3. **harfbuzz backend timing + wasm asset strategy** — the gate that turns this inert seam into a real pipeline.
4. **textlayout measure-provider → ShapedRun migration (cross-package)** — do not perform autonomously.
