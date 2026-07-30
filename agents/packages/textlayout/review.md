---
package: '@flighthq/textlayout'
status: solid
score: 79
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - types
  - prior review (2026-06-25 merge gate)
---

# textlayout — Review

## Verdict

**Solid — 79/100.** The prior partial-45 merge-gate review no longer describes the live package. Its
missing-header blocker is resolved, actual-space justification and direction-relative alignment landed,
and the package passes its compile, API, export, type-home, portability, and test gates. Textlayout now
forms a broad renderer-neutral spine for positioned rich-text runs, bounds, scroll metrics, and queries.
Remaining distance is mostly international typography, the size of the layout construction pass, and a
few metric/model consistency edges.

## Present capabilities

- Forty-four public free functions cover styled-content preparation, layout construction and caching,
  bounds, format metrics and merging, line-break discovery, per-line/scroll metrics, hit testing, character
  boundaries, selection rectangles, paragraph queries, and link lookup. Metric allocation remains
  contract-only.
- `computeTextLayout` handles format ranges, word wrapping and long-word breaking, explicit paragraphs,
  kerning-aware codepoint measurement, tab stops, margins/indents, bullets, horizontal and vertical
  alignment, inter-word/inter-character justification, maximum-line ellipsis, and paragraph-final-line
  behavior.
- Layout results remain renderer-neutral `TextLayoutGroup` runs with UTF-16 source ranges, codepoint-indexed
  advances, positioned offsets, and per-line ascent/descent/leading/width arrays.
- The package owns no font loading, shaping backend, DOM, renderer, or display node. Measurement arrives
  through the `TextMeasureFunction` seam and consumers decide how to draw the output.
- All exported types live in `@flighthq/types`; the package is import-side-effect-free and its twelve
  functional source files have colocated exported-function coverage.

## Stale-cell audit and live fix

Both July 2 assessment headlines had already advanced:

- `1ec31f7993` changed inter-word justification from group-boundary estimation to counting and expanding
  spaces inside groups, added inter-character mode, and added a single-format regression.
- The same text-stack pass expanded the Package Map entry to line breaking, alignment, both justification
  modes, leading, width constraints, positioned groups, advances, and the shaper measurement boundary.

The audit found a live indexing defect inside the first fix. Group source ranges use UTF-16 indices, while
`positions` contains one advance per codepoint. The justification loops used
`text.charCodeAt(group.startIndex + positionIndex)`, so an astral glyph shifted every later lookup: the
engine could count a space but add its residual width to a letter, or miss the space entirely.
`4fd3fc652` now advances the source index by each codepoint in both the count and expansion passes. A
wrapped single-format regression proves the space after an emoji expands while the emoji advance remains
unchanged.

## Remaining depth

- Line breaking recognizes explicit breaks and ordinary spaces, with character fallback for long words.
  It does not implement UAX #14 opportunities such as CJK boundaries, non-breaking-space suppression,
  soft hyphens, or language-aware hyphenation.
- Codepoint iteration avoids splitting surrogate pairs but is not grapheme-cluster-aware. Combining
  sequences, emoji ZWJ sequences, and regional-indicator pairs can still be split by wrapping and queried
  as separate caret positions.
- Direction currently resolves `start`/`end`; there is no UAX #9 bidi itemization or visual reordering.
  Complex-script glyph shaping and cluster maps remain the responsibility of a future widened shaper seam.
- `buildGroups` still combines measurement, wrapping, bullet emission, truncation, format-range movement,
  and line construction in one large stateful closure. The charter's blessed decomposition should be
  pursued as a measured pass extraction, not an unverified rewrite.
- Justification mutates group advances after line metrics are computed, while `lineWidths` and `textWidth`
  retain natural measured widths. That distinction can be useful, but it is not explicitly named in the
  result contract and deserves a conformance decision.
- Module-level scratch arrays and the paragraph-line set keep steady-state allocation low but make
  recursive/re-entrant layout through a measurement callback unsafe.

## Charter and boundary conclusion

The package matches its renderer-agnostic boundary and exposes a substantial, coherent text-layout
surface. The approved actual-space justification and Package Map work are complete, and the formerly
vestigial query `_text` parameters were separately removed in `8136a6aa3`. Future work should follow the
charter's typography and decomposition directions rather than repeat the stale partial-45 sweep.
