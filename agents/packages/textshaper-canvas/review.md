---
package: '@flighthq/textshaper-canvas'
status: solid
score: 72
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - assessment.md
  - source
---

# textshaper-canvas — Review

## Verdict

**solid -- 72/100.** A focused, single-responsibility Canvas 2D text-measurement backend that satisfies the `TextShaperBackend` contract with clean naming, explicit allocation, no side effects, and a correct sentinel path. The two must-fix defects identified in the prior review (cache key missing `letterSpacing`, `unitsPerEm: 0` divide-by-zero) and both minor items (descender fallback collapsing descent, cache-key regression test) have all been resolved. The score reflects remaining structural issues: the public `.` lane exports nothing (making the package unreachable from `@flighthq/sdk`), the cache is FIFO despite being documented as LRU, `getFontMetrics` is uncached, and the test suite is limited to type/non-throw assertions because jsdom returns zero for all `TextMetrics` fields. No correctness defects remain in the source; the gap is between what the package delivers today and what a complete advances-only measurement tier requires.

## Present capabilities

- **`createCanvasTextShaperBackend()`** (`canvasTextShaper.ts:30`) -- factory returning a `CanvasTextShaperBackend` with its own private canvas context. Each instance owns exactly one context (OffscreenCanvas preferred, HTMLCanvasElement fallback) and a bounded advance cache (512 entries). No shared mutable state, no top-level side effects.

- **`measureText(text, format)`** (`canvasTextShaper.ts:89`) -- delegates to `ctx.measureText(text).width` after setting `ctx.font` via `computeTextFormatFontString` from `@flighthq/text`. Results are memoized in a per-backend cache keyed by `${fontString}\x00${letterSpacing}\x00${text}` (`canvasTextShaper.ts:96`). One-time feature-detects gate `letterSpacing`, `wordSpacing`, and `direction` context properties (`canvasTextShaper.ts:38-40`).

- **`getFontMetrics(format)`** (`canvasTextShaper.ts:51`) -- derives vertical metrics from three `ctx.measureText` probes: `'H'` for cap height, `'x'` for x-height, `'g'` for descender extent. Uses `fontBoundingBoxAscent`/`Descent` where available, with `actualBoundingBox*` fallbacks. Returns `unitsPerEm: size` (identity convention, safe divide-by-1 for callers applying the `FontMetrics` scaling formula). Provides size-relative estimates for `lineGap`, `underlinePosition`, and `underlineThickness` (`canvasTextShaper.ts:72-79`).

- **`clearCanvasTextShaperBackendCache(backend)`** (`canvasTextShaper.ts:8`) -- free-function invalidation hook that clears the advance cache. Designed for webfont-load callbacks (`document.fonts.ready`).

- **Sentinel backend** (`canvasTextShaper.ts:171-183`) -- returned when neither `OffscreenCanvas` nor `document.createElement('canvas')` is available. Yields `-1` for advances and `null` for metrics. `clearCache` is a no-op.

- **Context creation** (`_createContext`, `canvasTextShaper.ts:144-165`) -- OffscreenCanvas-first, HTMLCanvasElement fallback, `null` for non-DOM/non-worker environments. Both paths use `try`/`catch` around `getContext('2d')`.

- **Type surface** -- `CanvasTextShaperBackend` interface lives in `@flighthq/types` (`CanvasTextShaperBackend.ts`), extending `TextShaperBackend` with `clearCache(): void`. All parameter types (`TextFormat`, `FontMetrics`) imported from `@flighthq/types/contract`.

- **Package manifest** -- `sideEffects: false`, two export lanes (`.` and `./contract`), dependencies on `@flighthq/text`, `@flighthq/textshaper`, `@flighthq/types` only. `crate: null` (Canvas2D has no Rust equivalent).

- **Tests** -- four `describe` blocks across 189 lines (`canvasTextShaper.test.ts`). Coverage includes cache-key correctness (spy-based test pinning that distinct `letterSpacing` values produce distinct cache keys at line 106), `getFontMetrics` field presence and `unitsPerEm` identity assertion, seam installation via `setTextShaperBackend`, multi-backend independence, and sentinel non-throw.

## Gaps

Each item verified against current source (`packages/textshaper-canvas/src/`).

1. **The public `.` lane exports nothing.** `index.ts:1` reads `export {} from './contract';` -- an empty re-export. The SDK barrel (`packages/sdk/src/index.ts:137`) re-exports from `@flighthq/textshaper-canvas` which resolves to this empty `.` lane, so `createCanvasTextShaperBackend` and `clearCanvasTextShaperBackendCache` are absent from `@flighthq/sdk`. An app using the blessed public imports cannot perform the setup step the package's own header documents (`canvasTextShaper.ts:14`). Meanwhile `@flighthq/textshaper`'s `.` lane also withholds `setTextShaperBackend`, compounding the gap: neither the creation nor the installation function is reachable from the app lane.

2. **The advance cache is FIFO, documented as LRU.** The file-head comment (`canvasTextShaper.ts:24`) describes a "per-backend LRU cache," but eviction deletes the first key from insertion-order iteration (`cache.keys().next().value` at line 123), and a cache hit never reorders the entry. A hot string measured 513 calls ago is evicted regardless of recency. The comment is incorrect; the implementation is FIFO.

3. **`getFontMetrics` is uncached.** Each call performs three `ctx.measureText` probes (`canvasTextShaper.ts:56-61`) with no memoization. The advance path beside it uses a 512-entry cache. For layout passes that query metrics per paragraph or per line, this is a per-call cost that the advance path already solves.

4. **`wordSpacing` is hardcoded to `'0px'` and `direction` to `'ltr'`.** (`canvasTextShaper.ts:110`, `:116`). `TextFormat` (`packages/types/src/TextFormat.ts`) carries neither `wordSpacing` nor `direction` fields; the code documents this limitation with inline comments. Adding either field is a cross-package header decision touching every text consumer.

5. **No `shapeRun` and no marker.** The backend object (`canvasTextShaper.ts:46`) declares `clearCache`, `getFontMetrics`, and `measureText` only -- no `shapeRun`. A caller checking `backend.shapeRun` sees `undefined` on both the real backend and the sentinel, with no positive signal that this is the advances-only tier rather than an incomplete implementation. Whether to use an explicit `shapeRun: () => null` marker or let absence be the signal is a seam-wide convention question.

6. **No per-cluster segmentation.** `measureText` returns a whole-string advance (`ctx.measureText(text).width` at line 119). No `Intl.Segmenter` grapheme pass, so caret placement across combining marks and ZWJ emoji has no source of truth at this tier.

7. **Structural divider comments** at `canvasTextShaper.ts:133-135` (`// ---------------------------------------------------------------------------` / `// Internal helpers`) violate the Source Style rule against structural divider comments.

8. **`kerning` and `variations` not reflected in measurement.** `TextFormat` carries `kerning?: boolean` and `variations?: readonly FontVariation[]`. Neither is plumbed to the canvas context or incorporated into the cache key. `computeTextFormatFontString` (in `@flighthq/text`) also omits both. For `kerning`, Canvas 2D provides no toggle (it is always on); for `variations`, CSS `font-variation-settings` exists but is not set. A `TextFormat` with `variations` set produces measurements that ignore the axis values.

9. **`as unknown as Record<string, unknown>` casts.** Three casts at `canvasTextShaper.ts:107`, `:110`, `:116` for `letterSpacing`, `wordSpacing`, and `direction` context properties. This is a TypeScript lib-types lag (the properties are standard but absent from the lib's `CanvasRenderingContext2D` definition). The casts satisfy the constraint in the narrowest available way but should be removed when lib types catch up.

10. **Test depth limited by jsdom.** All metric and advance assertions check type and non-throw rather than numeric correctness because jsdom's `measureText` returns `{ width: 0 }` with all bounding-box fields as 0. The one structural test (spy-based cache-key check at test line 106) pins the `letterSpacing` keying behavior, but no test can verify that measured advances match rasterized output. A functional scene comparing shaped advances against Canvas renderer drawn extents is the missing coverage layer.

## Charter contradictions

None. The charter's North star, Boundaries, Decisions, and Open directions sections are all `TODO` stubs. Only "What it is" is populated: "Canvas 2D backend for the text-shaping seam -- turning a text run + `TextFormat` into the metrics the layout engine needs, using the browser's `CanvasRenderingContext2D.measureText`." The source matches this description. In the absence of blessed principles, this review evaluates against the codebase-map AAA standard.

## Contract & docs fit

- **Export lanes**: Two lanes declared in `package.json` (`.` and `./contract`). `contract.ts` re-exports `canvasTextShaper.ts`, providing both functions to intra-SDK consumers. The `.` lane re-exporting nothing is the principal structural defect (gap 1 above).
- **Types home**: `CanvasTextShaperBackend` lives in `@flighthq/types` (`CanvasTextShaperBackend.ts`). No types defined inline in this package. `FontMetrics` and `TextFormat` imported from `@flighthq/types/contract`.
- **Side-effect freedom**: `sideEffects: false` declared. No module-level registration, no global mutation, no listeners/timers at import time. Context allocation deferred to `createCanvasTextShaperBackend` call.
- **Sentinels over throws**: `_createSentinelBackend` returns `-1`/`null` sentinels. `_createContext` catches and returns `null` on failure. No exceptions for expected failure cases.
- **`Readonly<T>`**: Both `getFontMetrics(format: Readonly<TextFormat>)` and `measureText(text: string, format: Readonly<TextFormat>)` and sentinel equivalents use `Readonly<TextFormat>`.
- **Naming**: Exported functions carry full unabbreviated type names (`createCanvasTextShaperBackend`, `clearCanvasTextShaperBackendCache`). `get*` prefix on `getFontMetrics`. Private helpers underscore-prefixed.
- **Teardown vocabulary**: `clearCache`/`clearCanvasTextShaperBackendCache` is correctly cache invalidation, not `dispose*` or `destroy*`. The detached canvas is GC-managed; no non-GC resource owned.
- **File-head comments**: Durable semantic comments documenting the extraction lineage, measurement-rasterization consistency guarantee, per-instance ownership, sentinel behavior, and cache semantics. No transient `TODO`/work-in-progress notes in source.
- **Test colocated**: One test file (`canvasTextShaper.test.ts`) colocated in `src/`. Four `describe` blocks alphabetized, mirroring export names.
- **Dependencies**: `@flighthq/text` (for `computeTextFormatFontString`), `@flighthq/textshaper` (for `setTextShaperBackend`/`getTextShaperBackend` in tests), `@flighthq/types`. No dependency on `@flighthq/sdk`.

## Candidate open directions

Surfaced for charter direction; not actionable without a decision.

1. **Populate the `.` lane.** Decide which functions belong on the public app-facing surface. At minimum `createCanvasTextShaperBackend` and `clearCanvasTextShaperBackendCache` should be reachable from `@flighthq/sdk`. This may also require `@flighthq/textshaper` to expose `setTextShaperBackend` on its `.` lane.

2. **Fix the cache description or the eviction policy.** Either rename the comment from "LRU" to "FIFO bounded" or implement true LRU (move-to-end on hit). The choice depends on whether hot-path re-measurement of the same strings is the expected access pattern.

3. **Cache `getFontMetrics` results.** The advance cache demonstrates the pattern; font-level metrics change only when the font string changes (even less often than advances), making them a strong caching candidate.

4. **`TextFormat.direction` and `TextFormat.wordSpacing` fields.** Cross-package header decision. The hardcoded defaults are documented but limit the backend to LTR single-word-spacing text.

5. **Advances-only marker convention.** Whether `shapeRun` absence or an explicit `shapeRun: () => null` is the blessed signal for an advances-only backend. Affects every advances-only implementation.

6. **Measurement-rasterization parity functional test.** A functional scene that asserts shaped advances match the Canvas renderer's drawn extents. This is the coverage layer that catches bugs invisible to jsdom. Ownership (here, `textlayout`, or `scene2d-canvas`) is itself a decision.

7. **Per-cluster advance segmentation.** Whether `Intl.Segmenter`-driven per-cluster advances for caret/selection belong in this package or in `textlayout`. Gold-tier feature with a type design implication (`@flighthq/types` cluster-shape type).

8. **Variable-font `variations` support.** `TextFormat.variations` exists but is not reflected in measurement. Whether to set `ctx.fontVariationSettings` (CSS `font-variation-settings`) and incorporate it into the cache key, or delegate to a HarfBuzz backend.
