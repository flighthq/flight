---
package: '@flighthq/textlayout'
updated: 2026-07-30
basedOn: ./review.md
---

# textlayout — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

No open sweep-safe items. Actual-space justification and the Package Map update were already live. The
audit completed the justification path for astral text by preserving the UTF-16-source to
codepoint-advance mapping and adding a regression.

## Approved

1. **[2026-07-30 · completed] Distribute justification across actual word spaces.** The main model and
   single-format coverage landed in `1ec31f7993`; `4fd3fc652` fixes source/advance indexing after astral
   codepoints.
2. **[2026-07-30 · completed] Update the Package Map description.** The live map already documents line
   breaking, alignment, inter-word/inter-character justification, line metrics, positioned groups, and
   the shaper measurement boundary.

## Backlog

- Decompose `buildGroups` into measured layout passes without regressing allocation or throughput.
- Define whether justified `lineWidths`/`textWidth` report natural or expanded visual widths.
- UAX #14 line breaking, UAX #29 grapheme boundaries, UAX #9 bidi, and cluster-aware shaper integration.
- Replace approximate format metrics when a full shaping backend supplies font-table metrics.
- Decide whether module scratch storage should remain non-reentrant or move behind caller/runtime-owned
  workspace.
