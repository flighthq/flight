---
package: '@flighthq/textshaper-canvas'
status: solid
score: 80
updated: 2026-06-25
ingested:
  - status.md
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - source
---

# textshaper-canvas — Review (merge gate)

> Harsh merge-review of the **delta** only: `incoming/integration-b2824e3d8/head/packages/textshaper-canvas/` vs the APPROVED baseline `…/base/…` (`origin/main` `eb73c3d74`). The baseline is the blessed floor and is not under review. Every objection is grounded in a cited `b2824e3d8:<path>` hunk.

## Verdict

**solid — 80/100. Merge-eligible with two must-fix correctness defects.** The incoming change is a clean, idiomatic enlargement of the former advances-only `createCanvasTextShaperBackend` into a real Canvas measure tier: it adds `getFontMetrics`, an explicit `clearCanvasTextShaperBackendCache` invalidation hook, a bounded per-backend advance cache, `letterSpacing`/`wordSpacing`/`direction` plumbing under one-time feature-detect, an `OffscreenCanvas`-first context path, and a documented `-1`/`null` sentinel backend for no-DOM environments. The composition is sound, the naming is exemplary, tree-shaking and side-effect rules are honored, and the seam stays types-first. It is held below merge-clean by exactly two defects the delta itself introduces: the advance cache key omits `letterSpacing`, silently defeating the very plumbing this change adds; and `getFontMetrics` returns `unitsPerEm: 0`, which violates the `FontMetrics` contract's own divide-by-`unitsPerEm` formula. Both are within-package, no signature change, no seam change — they should be fixed before merge.

## The delta under review

The base already shipped a minimal backend: a single private `document.createElement('canvas')` context and a `measureText` that set `context.font` and returned `measureText(text).width`. The head replaces that body wholesale (`b2824e3d8:packages/textshaper-canvas/src/canvasTextShaper.ts`):

- **New export `clearCanvasTextShaperBackendCache(backend)`** (lines 8-10) — free-function cache-invalidation hook.
- **New exported interface `CanvasTextShaperBackend extends TextShaperBackend { clearCache(): void }`** (lines 124-126).
- **`createCanvasTextShaperBackend` rebuilt** to add `getFontMetrics`, the LRU advance cache, the feature-detected `letterSpacing`/`wordSpacing`/`direction` plumbing, `_createContext()` (OffscreenCanvas→document), and `_createSentinelBackend()`.
- **Tests rewritten** — 1 base test grows to ~15 across four `describe` blocks (`b2824e3d8:packages/textshaper-canvas/src/canvasTextShaper.test.ts`).
- No change to `index.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`.

## Judgment against the 7 standards

### 1. Composition / bedrock — PASS

The unit stays a single backend constructor plus a thin free-function hook; complexity is pushed into two private helpers (`_createContext`, `_createSentinelBackend`) rather than absorbed into one branchy function. `getFontMetrics`, `measureText`, and `clearCache` are distinct methods on the returned object, not config-gated branches of one entry point. No fused subjects — this is one subject (Canvas measurement) decomposed to bedrock. No blood-from-a-stone over-split. The `_createContext`/`_createSentinelBackend` extraction is the right cut: the OffscreenCanvas-vs-DOM-vs-none decision is isolated where it belongs.

### 2. Naming clarity — PASS

`createCanvasTextShaperBackend`, `clearCanvasTextShaperBackendCache`, `CanvasTextShaperBackend`, `getFontMetrics`, `measureText`, `clearCache` — every exported name carries the full unabbreviated type words and is globally self-identifying. `get*` prefix used correctly for the accessor. `clearCanvasTextShaperBackendCache` is the verb a reader would reach for. Private helpers (`_createContext`, `_createSentinelBackend`, `_CACHE_MAX_SIZE`) are underscore-prefixed and clear. No abbreviation, no vague name.

### 3. Tree-shaking / bundle invariant — PASS

`"sideEffects": false` and the single root `.` export are unchanged from the approved base (`b2824e3d8:packages/textshaper-canvas/package.json` is byte-identical to base). No eager registration, no top-level side effect: the context is allocated inside `createCanvasTextShaperBackend`, not at module load. The feature-detect (`supportsLetterSpacing` etc.) is computed once per backend instance, not in the hot `measureText` loop, so the new plumbing does not add a per-call branch tax that every importer pays — it is a per-construction cost. The cache is per-backend, not shared global mutable state.

### 4. Registry vs closed union (fork B) — PASS / N/A

No `switch (kind)` over a growing family is introduced. The seam is the open `TextShaperBackend` interface in `@flighthq/types`; this package is one registered backend, installed via `setTextShaperBackend(...)` (the registry mechanism lives in `@flighthq/textshaper`). The delta adds nothing closed.

### 5. Subject triad + plurality guard — PASS

The package is already correctly homed as a `<subject>-<backend>` leaf (`textshaper-canvas`), the blessed shape for backends at ≥2 plurality (canvas today, harfbuzz designed). The delta does not introduce a format codec (no font-file parsing — a measure backend parses nothing), so no `-formats` layer is owed. No premature split. `crate: null` remains correct: the Canvas2D substrate is not in the Rust box, so there is intentionally no `flighthq-textshaper-canvas` mirror.

### 6. Contract hygiene — PARTIAL (one must-fix)

- Types-first: `FontMetrics`, `TextShaperBackend`, `TextFormat` all consumed from `@flighthq/types` (line 2); no cross-package type defined inline. ✓
- Sentinels-not-throws: `_createSentinelBackend` returns `-1`/`null` rather than throwing at construction (lines 166-178); `_createContext` swallows `getContext` failure and returns `null` (lines 139-160). ✓
- `Readonly<>` by default: `getFontMetrics(format: Readonly<TextFormat>)`, `measureText(text: string, format: Readonly<TextFormat>)`, sentinel methods all take `Readonly<TextFormat>` (lines 51, 81, 171, 174). ✓
- No `dispose*`/`destroy*` confusion: `clearCache`/`clearCanvasTextShaperBackendCache` is correctly neither — it is cache invalidation, not entity teardown or resource free. The detached canvas is GC-managed; nothing owns a non-GC resource, so no `destroy*` is owed. ✓
- **FAIL — `unitsPerEm: 0` breaks the `FontMetrics` divide contract.** `b2824e3d8:…/canvasTextShaper.ts:76` returns `unitsPerEm: 0, // not accessible from Canvas; 0 signals "unavailable"`, but `@flighthq/types` `FontMetrics.ts` documents _"Callers divide by unitsPerEm to scale to any target size."_ A contract-following consumer divides by zero. The honest within-package fix is `unitsPerEm: size` (identity — the inverse becomes a safe no-op, which Canvas can truthfully supply); the deeper "carve out 0 = unavailable" is a `@flighthq/types` decision, routed to Open directions. This is introduced by the delta (`getFontMetrics` is new) and is a must-fix.

### 7. Tests & honesty — PARTIAL (one must-fix)

- Colocated `*.test.ts`, four `describe` blocks alphabetized and mirroring exports (`CanvasTextShaperBackend`, `clearCanvasTextShaperBackendCache`, `createCanvasTextShaperBackend`, `createCanvasTextShaperBackend — getFontMetrics`). ✓
- No dead exports: every export (`createCanvasTextShaperBackend`, `clearCanvasTextShaperBackendCache`, `CanvasTextShaperBackend`) is exercised. ✓
- Claims match code: the status doc's six enhancement claims all verify against the head source. ✓
- **FAIL — the cache silently defeats the new `letterSpacing` plumbing, and no test can catch it.** `b2824e3d8:…/canvasTextShaper.ts:83` keys the cache `const cacheKey = \`${fontString}\x00${text}\``, and the cache lookup at lines 85-86 returns before `ctx.letterSpacing`is ever set at lines 93-95.`computeTextFormatFontString`encodes only style/weight/size/family — not`letterSpacing`. So `measureText('hi', { letterSpacing: 0 })`then`measureText('hi', { letterSpacing: 8 })`returns the first (zero-spacing) width for the second call. The letterSpacing plumbing this delta adds is dead on the second measurement of any`(font, text)`pair. The new test`measureText with letterSpacing=0 and non-zero produce number results`cannot catch it because jsdom's`measureText`returns 0 for everything — the test asserts only`typeof`and`>= 0`. This is a correctness regression hidden behind a passing test, and is a must-fix: the key must incorporate every advance-affecting field the context sets (minimally `letterSpacing`).

## Minor (non-blocking)

- **Descender fallback collapses descent.** `b2824e3d8:…/canvasTextShaper.ts:61-62` falls back to `actualBoundingBox*` of `'H'` when `fontBoundingBox*` is undefined; `'H'` has no descender, so descent collapses to ~0 on engines lacking `fontBoundingBox*`. Probe a descender glyph (`'g'`/`'y'`) for the fallback. Within-package, engine-dependent, not merge-blocking.
- **Double cache-clear surface.** Both the free function `clearCanvasTextShaperBackendCache` and the interface method `clearCache` are public. The free function is the C/C++-portable public verb and the method is its dispatch target — defensible, and the free function is the right primary surface. Leave as-is; noted only so a later agent does not read it as accidental duplication.
- **`ctx.letterSpacing` cast** through `unknown as Record<string, unknown>` (lines 94, 97, 103) is a TypeScript-lib lag, not a smell. Remove on a future lib bump. Informational.

## Contract & docs fit

Lives up to the contract on every axis except the two defects above. The file-head doc comment (lines 4-29) is exemplary: it records the extraction lineage from `createCanvasTextMeasure`, the measurement↔rasterization consistency guarantee, the per-instance ownership, the sentinel behavior, and the cache semantics — durable semantic comments that carry rules a name cannot. No transient `TODO`/work-in-progress notes leak into source.

**Candidate revisions (the user's gate, not the reviewer's):**

- `FontMetrics.unitsPerEm` doc in `@flighthq/types` should either carve out "0 = unavailable, do not invert" or stop promising an invertible divisor a legitimate backend cannot supply. Root of the §6 defect; lives in the header, not here.
- Package Map (`agents/index.md`) still reads `text-shaping` _"designed, not yet built"_ and names a hypothetical `@flighthq/text-shaping`, but the seam now ships as `textshaper` + this `textshaper-canvas` backend. Stale against the realized shape; needs reconciling. (Admin-doc owner, not this cell.)

## Charter contradictions

None — the charter's North star / Boundaries / Decisions / Open directions are all still `TODO` stubs (only "What it is" is seeded). There is no blessed principle to contradict; per the rubric this review falls back to the codebase-map AAA standard, and every assumption is surfaced as a candidate open direction in the assessment.
