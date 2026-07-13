---
package: '@flighthq/textsegment'
status: solid
score: 78
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# textsegment — Review

## Verdict

solid — 78/100. The charter's North star is implemented end to end: all three UAX #29 granularities over the swappable backend seam with a zero-table `Intl.Segmenter` default, plus every named caret-navigation helper. Judged as a *seam + default-backend* package (the heavy table backend is rust-designated), what's missing is hot-path shape, diagnostics for the silent `[]` sentinel, and conformance-grade tests.

## Present capabilities

- **Segmentation** (`packages/textsegment/src/textSegment.ts`) — `segmentGraphemes` / `segmentWords` / `segmentSentences`, each threading `locale` to the active backend; word segments carry `isWordLike` (normalized to `false` when the engine omits it), grapheme/sentence segments omit it — exactly the charter's record shape `{ start, end, text, isWordLike? }`.
- **Backend seam** (`textSegmenterBackend.ts`) — `getTextSegmenterBackend` / `setTextSegmenterBackend(null → lazy web default)` / `createWebTextSegmenterBackend`, the Platform-Suite command shape. The web backend caches `Intl.Segmenter` instances by `locale|granularity` with FIFO eviction at 64 (constructing a segmenter is the expensive step), and degrades to an empty-array sentinel when `Intl.Segmenter` is absent — sentinel, not throw, per house rules.
- **Caret navigation** (`textSegmentBoundary.ts`) — `getNextGraphemeBoundary` / `getPreviousGraphemeBoundary`, `getNextWordBoundary` / `getPreviousWordBoundary`, and `getWordRangeAt` (double-click word select; null on whitespace/punctuation; end-of-text resolves against the last character). All indices clamp rather than throw.
- Tests (~230 lines) cover emoji/ZWJ clusters, combining sequences, `isWordLike` filtering, locale threading, boundary clamping, the null-word cases, and backend install/restore — running against Node's real `Intl.Segmenter`.
- Zero dependencies beyond `@flighthq/types`; `sideEffects: false`; nothing installs at import (the default backend is lazily built on first query).

## Gaps

- **Hot-path shape.** The charter North star promises "plain offset arrays / `out`-fillable index results in the hot path", but every boundary helper re-segments the *entire string* and allocates a full `TextSegment[]` (with `text` slices) to answer one index. A caret stepping through a long document is O(n) allocations per keypress. A boundary-offset query form (or backend-level `nextBoundary(text, index, granularity)`) is the textbook shape (`ICU BreakIterator::following/preceding`).
- **No `explain*` for the missing-`Intl.Segmenter` sentinel.** `segment()` silently returns `[]` on engines without the API; the diagnostics rule says a silent sentinel gets a shakeable `explainTextSegmenterBackend()`-style query (and/or an `enable*Guards` warning).
- **No sentence navigation helpers** — the grapheme/word pairs exist but there is no `getNextSentenceBoundary`/`getPreviousSentenceBoundary`; a caret model doing paragraph/sentence motion re-derives it. (Charter names only grapheme/word helpers, so this is a completeness note, not a contradiction.)
- **Conformance coverage** is representative, not exhaustive — no GraphemeBreakTest/WordBreakTest-derived cases. Fidelity currently *is* the engine's `Intl.Segmenter` (deliberately), so this matters most for the future from-scratch backend; a small conformance harness would let any backend be validated against the same expectations.

## Charter contradictions

None. Line breaking (UAX #14) is correctly absent (decision [2026-07-11]); no Unicode tables ship; the seam matches the decided shape. The one North-star promise not yet honored is the hot-path/out-param form noted above — unfinished, not contradicted.

## Contract & docs fit

- Types (`TextSegment`, `TextSegmentRange`, `TextSegmentGranularity`, `TextSegmenterBackend`) live in `@flighthq/types`; names are full and self-identifying; sentinels not throws; single root barrel; deps exactly `types`. `crate: null` is right for the Intl-wrapper package (the table backend is the rust candidate, behind this seam).
- Package Map line in `agents/index.md` matches reality ("seam… grapheme/word/sentence boundaries; the itemize layer").
- Consumers have not adopted the seam yet: `textinput`/`textlayout` do not import `textsegment` (charter Open direction 2) — flagged for the cross-package ledger, not this cell.

## Candidate open directions

- Should the backend interface itself grow an index-query method (`nextBoundary`/`previousBoundary`) so backends can answer caret queries without materializing all segments, or do the helpers stay a convenience over `segment()` with the allocation cost accepted?
- Is a conformance-test harness (UCD break-test files as fixtures) wanted in-repo now, ahead of the from-scratch/rust backend it would validate?
