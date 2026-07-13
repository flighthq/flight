---
package: '@flighthq/textsegment'
updated: 2026-07-13
basedOn: ./review.md
---

# textsegment — Assessment

## Recommended

Sweep-safe, within-package:

1. **Sentence navigation helpers** — `getNextSentenceBoundary` / `getPreviousSentenceBoundary` in `textSegmentBoundary.ts`, completing the granularity × direction matrix the grapheme/word pairs already establish. Pure additions over `segmentSentences`.
2. **`explain*` for the missing-engine sentinel** — a shakeable `explainTextSegmenterBackend()` (plain data: which backend is active, whether `Intl.Segmenter` is available) so the silent `[]` return is queryable, per the diagnostics inversion rule.
3. **`enableTextSegmentGuards`** — separately importable guard warning (via `@flighthq/log`, `logOnce`) when segmentation is queried on a host without `Intl.Segmenter` and no replacement backend is installed — the exact fixing call (`setTextSegmenterBackend`) in the message.
4. **Boundary-helper allocation trim** — within the current backend interface, avoid materializing `text` slices for boundary-only queries where possible (e.g. an internal segment walk that stops at the answer), and document the cost on the helpers. The full index-query backend method is a seam change and stays parked below.
5. **Conformance fixtures (light)** — a small table of UAX #29 edge cases (regional-indicator pairs, ZWJ emoji families, CR/LF, Hangul jamo) asserted against the default backend, giving any future backend a shared expectation set.

## Backlog

- **Backend-level `nextBoundary`/`previousBoundary` index queries** — parked: changes the `TextSegmenterBackend` seam in `@flighthq/types` (all backends must implement it); a design fork for the charter's Open directions. The textbook (ICU BreakIterator) shape, and the real fix for hot-path caret stepping.
- **From-scratch UAX #29 table backend** — parked: charter Open direction 1, designated `flight-rs`.
- **Wiring `textinput`/`textlayout` onto this seam** — parked: cross-package (charter Open direction 2).
- **UAX #14 line-break reconciliation** — parked: charter decision keeps it in `textlayout`; consolidation is an explicit future call (Open direction 3).

## Approved

_Empty — awaiting the user's verbal approval gate._
