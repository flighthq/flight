---
package: '@flighthq/textsegment'
status: solid
score: 72
updated: 2026-09-02
ingested:
  - status.md
  - source
  - charter.md
  - assessment.md
  - types/TextSegment.ts
  - Host.ts (HasTextSegmenter trait)
  - explicit-dependency-model.md
---

# textsegment — Review

## Verdict

solid -- 72/100. The charter's North star is implemented end to end: all three UAX #29 granularities over a swappable backend with the zero-table `Intl.Segmenter` default, plus every named caret-navigation helper. Score drops from the prior 78 because the explicit dependency model (ratified 2026-08-29) now makes the module-scoped `_backend` singleton a concrete gap, not a future direction: `HasTextSegmenter` and `HostTextCapabilities.segmenter` already exist in `@flighthq/types`, but this package still uses `get/setTextSegmenterBackend` reaching for module-level mutable state -- the exact pattern the ratified model replaces. Hot-path allocation, missing diagnostics, and missing sentence navigation helpers carry forward from the prior review unchanged.

## Present capabilities

- **Segmentation** (`textSegment.ts`, 24 lines) -- `segmentGraphemes` / `segmentWords` / `segmentSentences`, each threading `locale` to the active backend. Word segments carry `isWordLike` (normalized to `false` when the engine omits it); grapheme and sentence segments omit it. Returns `readonly TextSegment[]` -- the charter's `{ start, end, text, isWordLike? }` record shape.
- **Backend seam** (`textSegmenterBackend.ts`, 69 lines) -- `getTextSegmenterBackend` / `setTextSegmenterBackend` (null restores the lazy web default) / `createWebTextSegmenterBackend`. The web backend caches `Intl.Segmenter` instances by `locale|granularity` key with FIFO eviction at 64 entries. When `Intl.Segmenter` is absent, `segment()` returns `[]` (sentinel, not throw).
- **Caret navigation** (`textSegmentBoundary.ts`, 78 lines) -- `getNextGraphemeBoundary` / `getPreviousGraphemeBoundary`, `getNextWordBoundary` / `getPreviousWordBoundary`, and `getWordRangeAt` (double-click word select; null on whitespace/punctuation; trailing boundary resolves against the last character). All indices clamp rather than throw.
- **Export lanes** -- public lane (`index.ts`) surfaces the eight user-facing functions; contract lane (`contract.ts`) adds the three backend-seam functions. Correct split: end-user apps segment and navigate; intra-SDK packages wire the backend.
- **Types** -- `TextSegment`, `TextSegmentRange`, `TextSegmentGranularity`, and `TextSegmenterBackend` all live in `@flighthq/types` (`TextSegment.ts`), exported through both `.` and `./contract`. No inline type definitions in this package.
- **Tests** (~229 lines across three files) cover emoji/ZWJ clusters, combining sequences, `isWordLike` filtering, locale threading, boundary clamping, null-word cases, gap-free offset coverage, backend install/restore, and the recording-backend pattern. All run against Node's real `Intl.Segmenter`.
- **Package hygiene** -- zero dependencies beyond `@flighthq/types`; `sideEffects: false`; nothing installs at import; the default backend is lazily built on first query.

## Gaps

- **Explicit dependency model migration.** The ratified model (2026-08-29) replaces `set*Backend` singletons with host-threaded values. `HostTextCapabilities.segmenter` and the `HasTextSegmenter` trait constraint already exist in `@flighthq/types/Host.ts`. But the package still holds a module-scoped `let _backend: TextSegmenterBackend | null` and exposes `get/setTextSegmenterBackend` -- the exact ambient-state pattern the model eliminates. The migration also calls for a `webTextSegmenterBackend` const object (importable directly, no factory), which does not exist; only `createWebTextSegmenterBackend()` is provided. Peer packages `textshaper` and `textbidi` share this gap, so the migration is systemic, but the host slot is already declared and waiting.
- **Hot-path allocation.** The charter North star names "plain offset arrays / `out`-fillable index results in the hot path," but every boundary helper re-segments the entire string and allocates a full `TextSegment[]` (with `text` slices) to answer a single index query. A caret stepping through a long document is O(n) allocations per keystroke. The textbook shape is a stateful iterator (`ICU BreakIterator::following`/`preceding`), or at minimum a backend-level `nextBoundary(text, index, granularity)` that avoids materializing all segments.
- **No diagnostics.** `segment()` silently returns `[]` on engines without `Intl.Segmenter` -- the diagnostics inversion rule requires a shakeable `explainTextSegmenterBackend()` query (plain data: which backend is active, whether `Intl.Segmenter` is available) and an `enableTextSegmentGuards()` guard warning (via `@flighthq/log`) when the caller hits the empty sentinel.
- **No sentence navigation helpers.** `getNextSentenceBoundary` / `getPreviousSentenceBoundary` are absent, leaving the granularity-times-direction matrix incomplete. The charter names only grapheme and word helpers explicitly, so this is a completeness note.
- **No `Readonly<T>` on the `backend` parameter** of `setTextSegmenterBackend`. The parameter is `TextSegmenterBackend | null`; the convention calls for `Readonly<TextSegmenterBackend> | null` since the function stores -- not mutates -- the reference. Minor, since the interface itself has a single method.
- **Conformance coverage is representative, not exhaustive.** No GraphemeBreakTest/WordBreakTest-derived cases. Fidelity currently is the engine's `Intl.Segmenter` (deliberately), so this matters most for the future from-scratch backend; a small conformance harness would let any backend validate against the same expectations.

## Charter contradictions

None. Line breaking (UAX #14) is correctly absent per the 2026-07-11 decision. No Unicode tables ship. The seam matches the decided shape. The charter names the `set/get` pattern as the backend seam shape, which was correct at the time; the explicit dependency model supersedes it but does not contradict the charter's intent -- it changes the mechanism, not the capability.

## Contract & docs fit

- Types are in `@flighthq/types`; names are full and self-identifying; sentinels not throws; dual-lane exports; deps exactly `types`. `crate: null` is correct (the table backend is the Rust candidate).
- The SDK barrel re-exports all public-lane functions from `@flighthq/textsegment` through `sdk/src/text.ts`.
- `HostTextCapabilities.segmenter` in `Host.ts` already declares the slot; `HasTextSegmenter` exists as the trait constraint. The package does not yet consume them.
- `textinput` and `textlayout` still do not import from `textsegment` (charter Open direction 2, unchanged since 2026-07-13).
- The `createWebTextSegmenterBackend` factory has no corresponding const-object `webTextSegmenterBackend`, which the explicit dependency model's naming convention expects.

## Candidate open directions

- **Explicit dependency model migration** -- replace `get/setTextSegmenterBackend` and the module-level `_backend` with host-threaded access via `HasTextSegmenter`. Expose a `webTextSegmenterBackend` const. The segmentation functions (`segmentGraphemes`, etc.) and boundary helpers gain a `host: HasTextSegmenter` first argument, and the backend seam functions (`get/set`) are removed. This is a cross-cutting change shared with `textshaper` and `textbidi`; coordinate timing and approach across the text subsystem.
- **Backend-level `nextBoundary`/`previousBoundary` index queries** -- should the `TextSegmenterBackend` interface grow a positional query so backends can answer caret queries without materializing all segments? This changes the seam in `@flighthq/types` and all backend implementations.
- **Conformance-test harness** -- a small table of UAX #29 edge cases (regional-indicator pairs, ZWJ emoji families, CR/LF, Hangul jamo) validated against the default backend, giving any future backend a shared expectation set. Worth building ahead of the from-scratch/Rust backend.
- **Sentence navigation helpers** -- `getNextSentenceBoundary` / `getPreviousSentenceBoundary`, completing the granularity matrix. Pure additions over `segmentSentences`.
- **`explain*` and `enableTextSegmentGuards`** -- the diagnostics layer for the silent `[]` sentinel and missing-engine case. A shakeable guard that names `setTextSegmenterBackend` (or the host-model equivalent) in its message.
