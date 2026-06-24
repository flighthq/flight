---
package: '@flighthq/textshaper'
status: partial
score: 62
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/textshaper.md
  - source
  - changes.patch
  - charter.md
---

# textshaper — Review

Evidence: `incoming/builder-67dc46d64/head/packages/textshaper/` + `head/packages/types/src/` + `changes.patch`. Findings reference `67dc46d64:<path>`. This is a large pass: the base (`67dc46d64:base/packages/textshaper/src/`) was 3 files (`index.ts`, `textShaper.ts` + its test — the advances-only seam the prior depth review surveyed at 18/100); the head is 16 files. The prior depth review (`reviews/depth/textshaper.md`) is superseded here — it described the pre-pass stub and its four-step recommendation (add `ShapedGlyph`/`ShapedRun` types, a `shapeRun` method + free function, a metrics path, the harfbuzz sibling) has been **largely executed at the seam level**, which is the central story of this review.

## Verdict

`partial — 62/100`. The full-glyph shaping _seam_ and its supporting API are now broad and largely well-shaped: shaped-run types in `@flighthq/types`, `shapeTextRun`/`shapeTextRunInto`, font metrics/extents/unit-scale, cluster/caret navigation, itemization, an explicit cache, a pool, and an opt-in signal group. The 62 (below the worker's self-estimated 72) reflects this review's distance-to-authoritative bar in a domain whose authoritative reference is HarfBuzz: **every substantive shaping operation is still a `null`/`-1`/`''` delegate** because no full-glyph backend exists yet (`textshaper-harfbuzz` is deferred), so the entire glyph-producing surface is unexercised by any real implementation — itemization is the only built-in compute, and it is a deliberately simplified bidi/script fallback. The score also carries one real defect (a dead branch in `getIndexRangeForCluster`), a seam/free-function asymmetry (four backend introspection methods have no package wrapper), a hand-rolled signal that bypasses the signals package, and a status doc whose "concerns" and per-file test counts are stale against the shipped code. The charter is an empty stub, so most of "what good means here" is assumed from the codebase-map text-stack design, not confirmed.

## Present capabilities (verified against source)

**The seam** (`textShaper.ts`). `getTextShaperBackend()` / `setTextShaperBackend(backend|null)` / `shapeText(text, format) => number` (advance width, sentinel `-1` when no backend). Last-write-wins, never throws on re-registration, no module-load registration. `setTextShaperBackend` now fires a hook (`_textShaperBackendHook`) after each install so the signal group can observe backend changes through the single setter — see Signals below.

**Shaped-run API** (`textShaperRun.ts`, 13 exports). `createShapedRun()` / `clearShapedRun(out)` allocate/reset the run shell (glyphs array reference retained on clear). `shapeTextRun(text, format, options?) => ShapedRun | null` and the alias-safe out-param `shapeTextRunInto(text, format, out, options?) => boolean` delegate to `backend.shapeRun`, returning `null`/`false` when no backend or the backend is advances-only. Font path: `getFontMetrics`/`getFontMetricsInto`, `getFontUnitScale` (`size/unitsPerEm`, sentinel `-1`), `getGlyphExtents`/`getGlyphExtentsInto`/`getGlyphExtentsBatch`. Font introspection: `getGlyphIndexForCodePoint`, `getCodePointForGlyph`, `getGlyphName` (sentinels `-1`/`-1`/`''`). All are thin null-guarded delegates to optional `TextShaperBackend` methods.

**Itemization** (`textShaperItemize.ts`). `itemizeText(text, format, options?) => readonly TextItem[]` is the one piece of real built-in compute: a code-point sweep over two private tables (`getCodePointBidiClass`, `getCodePointScript`) splitting a string into script+direction runs (Latn, Grek, Cyrl, Hebr, Arab, Syrc, Deva, Thai, Hira, Kana, Hans, Hang; RTL detection for Arabic/Hebrew/ Thaana/N'Ko/Samaritan/Syriac/Mandaic). `shapeTextRuns(...)` itemizes then shapes each sub-run. The implementation is honestly documented as a first-pass Unicode-property fallback, not the full UBA.

**Cluster/caret navigation** (`textShaperCluster.ts`). `getCaretPositionsForRun(run) => number[]` (`glyphCount+1` x-positions accumulating `xAdvance`), `getClusterForIndex(run, stringIndex) => number` (last glyph whose cluster ≤ index, `-1` sentinel), `getIndexRangeForCluster(run, cluster, stringLength?) => readonly [number, number] | null`.

**Cache** (`textShaperCache.ts`). `createTextShaperCache()` / `clearTextShaperCache` / `disposeTextShaperCache` / `shapeTextRunCached(...)`. Caller-owned (no global), keyed by a stable string of (text, the six shaping-relevant `TextFormat` fields, options incl. sorted features/ variations). `null` results are deliberately not cached so a later backend registration can succeed.

**Pool** (`textShaperPool.ts`). `acquireShapedRun()` / `releaseShapedRun(run)` paired-bracket pool capped at 64.

**Signals** (`textShaperSignals.ts`). `enableTextShaperSignals() => TextShaperSignals` (idempotent, opt-in), `disposeTextShaperSignals()`, `getTextShaperSignals() => … | null`. The single `onBackendChanged` signal fires through the `_textShaperHooks.ts` slot — there is **no** `setTextShaperBackendWithSignals`; all callers use the base setter (the status's stated concern was fixed in-session).

**Types** (`@flighthq/types`, all one-concept-per-file and barrel-exported): `ShapedGlyph`, `ShapedRun`, `TextDirectionKind` (+ 3 constants), `TextShaperOptions`, `TextFeature` (+ 12 tag constants), `FontVariation` (+ 5 axis constants), `FontVariationAxis`, `FontMetrics`, `GlyphExtents`, `TextItem`, `TextShaperSignals`. `TextShaperBackend` (`TextShaper.ts`) keeps `measureText` required and adds 10 optional methods (`shapeRun`, metrics, extents, the three glyph-lookup methods, and four font-enumeration methods).

## Gaps (vs the AAA HarfBuzz/rustybuzz target; charter silent, so the text-stack design applies)

- **No backend produces glyphs.** The single highest-value step — `@flighthq/textshaper-harfbuzz` (harfbuzz-wasm, `createHarfBuzzTextShaperBackend(wasm)`) — is deferred. Until it lands, every glyph-producing function returns its sentinel against any registered measure-only backend, so the whole `shapeRun` surface is structurally complete but functionally inert and unexercised by a real GSUB/GPOS implementation. This blocks all non-Canvas (GPU/software) text rendering, exactly the thing the seam exists to unblock.
- **Itemization is a simplified fallback, not the UBA.** `itemizeText` handles single-level LTR/RTL alternation and a coarse script table; it does not implement the Unicode Bidirectional Algorithm (embedding levels, directional overrides, neutral resolution at boundaries) and will mis-order mixed-direction paragraphs. No `unicode-bidi`-equivalent. Honest by-design, but a real gap toward authoritative.
- **Four backend introspection methods have no package wrapper.** `TextShaperBackend` declares `getFontFeatures`, `getFontScripts`, `getFontLanguages`, `getFontVariationAxes`, but `textshaper/src` exposes **no** free function for any of them — a caller cannot reach them without going around the package to the backend object. The Gold roadmap names these as public APIs; the seam was widened but the package surface was not.
- **No font fallback.** No `FontFallbackBackend` seam, no `.notdef`/`isNotdefGlyph` resolution, no fallback-chain configuration. `ShapedRun.font` can be `null` but nothing resolves it.
- **No incremental reshape.** No `reshapeTextRun(prevRun, edit, out)` for the typing-into-a-paragraph case (Gold).
- **No vertical-text pipeline.** `yAdvance` exists on `ShapedGlyph` and `'TopToBottom'` on `TextDirectionKind`, but `getCaretPositionsForRun` accumulates only `xAdvance` and itemization never emits `TopToBottom`; vertical metrics are not on `FontMetrics`.
- **No cross-backend conformance fixtures.** No shared spec proving `textshaper-canvas`, `textshaper-harfbuzz`, and the Rust crate produce structurally-matching `ShapedRun`s — the Silver conformance item. (No functional text scene either.)
- **Rust crate not yet built to the new seam.** `flighthq-textshaper` needs `shape_text_run`, `ShapedRun`/`ShapedGlyph`, metrics, options, and the rustybuzz sibling to mirror this surface 1:1.

## Charter contradictions

None — the charter is an empty stub (What it is / North star / Boundaries / Decisions / Open directions are all `TODO`), so there is no blessed rule for the code to contradict. This is itself the most important charter finding: a package this far along (33 exports, a 10-method backend seam, a clear place in the four-layer text stack) has **no captured direction**, so every shape/scope question below is open. Fork F (thin-by-design vs. under-built) names `textshaper` specifically as "under-built-needs-a-push" — but the push has substantially happened at the seam level, so the live question is now scope/sequencing (when does the harfbuzz backend land, does `itemizeText` stay here), not "is this a stub by intent."

## Contract & docs fit

**Lives up to the contract.** Full unabbreviated names (`getTextShaperBackend`, `getCaretPositionsForRun`, `shapeTextRunCached` — no abbreviations); `out`-params with documented alias-safety (`shapeTextRunInto` reads all inputs into locals before writing); sentinels not throws throughout (`null`/`-1`/`''`/`false`/`0`); types-first in `@flighthq/types`, all one-concept-per-file and barrel-exported; single `.` export, `sideEffects: false`, deps limited to `@flighthq/types`; opt-in `enableTextShaperSignals` (no top-level registration); `dispose*` used correctly (GC-release, not resource-free); pool `acquire*/release*` brackets; `crate: flighthq-textshaper` in the charter front matter. The string-kind model is honored (`TextDirectionKind` is a string union with named constants, not a `Symbol()`). Strong contract hygiene overall.

**Defects / candidate revisions:**

- **Dead branch in `getIndexRangeForCluster` (`67dc46d64:textShaperCluster.ts:61,82`).** `let found = false` is set to `true` and _immediately returned_ inside the match (`return [cluster, end]`), so the only way to reach the trailing `return found ? null : null` is with `found` still `false` — the ternary is dead and always yields `null`. Either the `found` flag is vestigial (delete it, return a bare `null`) or the intended behavior (distinguish "cluster present but zero-width" from "cluster absent") was lost. A real bug-shaped artifact, sweep-safe to fix within the file.

- **Seam/wrapper asymmetry (the four enumeration methods).** `getFontFeatures`/`getFontScripts`/ `getFontLanguages`/`getFontVariationAxes` exist on `TextShaperBackend` but have no free-function wrapper in the package, while their siblings (`getGlyphName`, `getCodePointForGlyph`, etc.) do. The package's public surface is narrower than the seam it defines — inconsistent, and it means the charter/Package-Map cannot describe "what a caller can do" from the package alone. Either add the four wrappers (sweep-safe, same thin-delegate shape as the others) or drop the unused backend methods until a backend needs them.

- **Hand-rolled signal bypasses `@flighthq/signals`.** `enableTextShaperSignals` builds `onBackendChanged` as a literal `{ data: null, emit: (backend) => { for … listeners[i](backend) } }` with its own `_listeners` array, rather than constructing a real `Signal` via the signals package (the `Signal<T>` type carries `SignalData` with priorities/repeat/enabled/cancellation/depth — all `null` here). It satisfies the `TextShaperSignals` interface structurally but provides none of the priority/cancellation/connection semantics the codebase-map says signals are _for_, and there is no `addLogSink`-style connection handle. Candidate revision: use the signals package's constructor so the one signal group this package owns behaves like every other.

- **`TextShaperCache._entries` is public-by-interface.** Underscore-convention "internal" but typed `readonly _entries: Map<…>` on the exported interface so tests can inspect it. Acceptable for an opaque cache, flagged in status; a branded-opaque type is the cleaner long-term shape.

- **Package Map is stale (admin-doc revision).** `tools/agents/docs/index.md` (and the head copy in the bundle) still lists the shaper seam as **`@flighthq/text-shaping` _(designed, not yet built — 2026-06-22)_** with a `registerTextShaper`/`TextShaper` vocabulary — but the built package is `@flighthq/textshaper` with `setTextShaperBackend`/`TextShaperBackend`, and it is no longer "designed, not yet built." The Package Map entry needs to be rewritten to the realized package name, function names, and status. (The Rust `rust/index.md` text section already uses the correct `textshaper` name.) This is a candidate revision for the Package-Map owner, not a package change.

- **Status doc per-file test counts are stale.** The status claims `textShaperRun.test.ts` 18 / cache 12 / cluster 12 / itemize 12 / signals 9 and omits `textShaper.test.ts`; the actual files are 24 / 14 / 11 / 11 / 11 + 5, totalling the same **80** by coincidence. The status's long "concern" about `setTextShaperBackendWithSignals` describes a design that was _superseded in the same session_ (the hook slot shipped). Not a code defect — a note that the status is as-claimed and now partly stale-by-success.

## Candidate open directions (charter is an empty stub — these are the questions it should settle)

1. **North star.** Likely: the canonical home of the **shape** layer (itemize/bidi → shape → layout → rasterize); turn a run into positioned glyphs + the metrics layout/rasterization need; heavy full-glyph backend stays an opt-in neighbor per the bundle rule. Confirm so future work is judged against it.
2. **`shapeText` vs `shapeTextRun` naming/role.** The depth review flagged `shapeText`-returning-a- `number` as a naming overreach ("shape" implies glyphs; it only measures). Keep it as the advances-only fast path beside `shapeTextRun`, or rename it `measureText`? A blessed ruling.
3. **harfbuzz backend timing + asset strategy.** Approve `@flighthq/textshaper-harfbuzz` and settle the wasm load strategy (inject the module like `host-electron`'s `electron`; ~1MB stays opt-in) and the ttf-parser-equivalent font access. This is the gate that turns the inert seam into a real pipeline.
4. **Does `itemizeText`/`TextItem` live here?** Shaping is its only consumer today; recommend here — but textlayout may also want it. Decide ownership, and whether full UBA arrives via the backend, a `unicode-bidi` dep, or a `textshaper-icu` neighbor.
5. **Font fallback ownership.** Where is the `FontFallbackBackend` chain configured, and can a web backend resolve to system fonts at all? Cross-package (device/platform may enumerate system fonts).
6. **textlayout measure-provider migration (cross-package).** When a full-glyph backend exists, migrate `textlayout` from `TextMeasureFunction` to consuming `ShapedRun` (width = Σ `xAdvance`), and move `richTextQuery` selection from per-character advances to real clusters. The status flags both as "do not perform autonomously."
7. **Enumeration-wrapper scope.** Decide whether the package exposes the four font-enumeration methods as free functions now (matching the seam) or trims the backend methods until a backend implements them — i.e. does the seam lead the wrappers or track them.
