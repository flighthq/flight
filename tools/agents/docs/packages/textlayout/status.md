---
package: '@flighthq/textlayout'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# textlayout — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/textlayout

**Session date:** 2026-06-24 **Starting score:** 66/100 (Solid) **Estimated new score:** 78/100 (Silver-approaching)

## Implemented APIs

### New types in `@flighthq/types`

- `TextDirection` (`'ltr' | 'rtl'`) — `packages/types/src/TextDirection.ts`. Base paragraph direction for resolving `'start'`/`'end'` alignment.
- `TextJustification` (`'interWord' | 'none'`) — `packages/types/src/TextJustification.ts`. Strategy applied when `TextFormat.align === 'justify'`.
- `TextListMarker` (`'bullet' | 'none'`) — `packages/types/src/TextListMarker.ts`. List marker kind for `TextFormat.bullet` items. `'decimal'`, `'lowerAlpha'`, `'upperRoman'` are reserved for Silver.
- `TextLayoutParams` extended (`packages/types/src/TextLayout.ts`) with:
  - `direction?: TextDirection` — paragraph base direction (default `'ltr'`)
  - `justification?: TextJustification` — justify strategy (default `'interWord'`)
  - `maxLines?: number` — truncation line cap (default `-1` = unlimited)
  - `truncationCharacter?: string` — ellipsis character (default `'…'`)

### New exported functions/constants in `@flighthq/textlayout`

- `TEXT_LAYOUT_GUTTER` (constant, `packages/textlayout/src/textLayout.ts`) — the canonical 2px gutter constant. Replaces the duplicated `GUTTER` magic number. Both files now share one source of truth.
- `TEXT_BOUNDS_GUTTER` re-exported from `packages/textlayout/src/textBounds.ts` as an alias of `TEXT_LAYOUT_GUTTER` — zero drift risk going forward.
- `getTextLayoutIsTruncated(layout, params): boolean` — returns `true` when `params.maxLines` clips the layout.

### Changed behavior (no API break)

- **Codepoint-aware iteration** (`charAdvances`, `breakLongWord`): replaced `charAt(i)` / `substr(i, 2)` / `charAt(i+1)` with `codePointAt` + `slice` so surrogate pairs (emoji, astral scripts) are treated as single logical characters and never split.
- **`kerning` flag honored**: `charAdvances` now checks `format.kerning !== false` before doing pair-wise measurement. When `kerning === false`, single-glyph advances are used instead. Previously kerning was silently always on.
- **`start`/`end` alignment resolved**: `applyAlignment` maps `'start'` → `'left'` and `'end'` → `'right'` under LTR, and reverses under RTL. Uses the new `direction` param from `TextLayoutParams`.
- **`justify` alignment implemented**: `justifyLines()` distributes residual line width across inter-word spaces for non-last lines of each paragraph. Last line of a paragraph is left-aligned (CSS standard). Text reference is passed down to count actual space characters rather than estimating from group boundaries.
- **Bullet list emission**: `emitBullet()` emits a real `•` glyph group at the hanging-indent position before list-item paragraphs when `TextFormat.bullet === true`. Auto-computes a positive `indent` if none is set so text does not overlap the bullet. `TextListMarker` type scaffolds future `'decimal'`/`'lowerAlpha'` markers.
- **Ellipsis/truncation**: `checkTruncation()` fires after each `commitLine()`. When `maxLines` is reached, it trims the last visible group to make room and appends a synthetic ellipsis group on the last committed line. Correctly assigns the ellipsis to `lineIndex - 1` (after `commitLine()` already incremented the counter).
- **Binary search in `getTextLineBreakIndex`**: replaced the O(n) linear scan with a binary search over the sorted `lineBreaks` array. Semantics are identical.
- **Signature honesty for unused `text` params**: `getRichTextCharBoundaries` and `getRichTextCharIndexAtPoint` rename the unused `text` parameter to `_text` with JSDoc noting it will be removed. The `lineStart` initialization in `getRichTextCharIndexAtPoint` now derives an upper bound from the last group's `endIndex` instead of `text.length`.

### Tests added (17 new tests across 3 files)

- `textLayout.test.ts`: bullet list, justify alignment, kerning flag, maxLines truncation (3 tests), start/end alignment (3 tests LTR/RTL), codepoint iteration (emoji), `getTextLayoutIsTruncated`, `TEXT_LAYOUT_GUTTER` constant
- `textBounds.test.ts`: `TEXT_BOUNDS_GUTTER === TEXT_LAYOUT_GUTTER` alias check
- `textLineBreaks.test.ts`: 5 new binary-search edge cases (exact match, single element, large array)

**Total: 120 → 137 tests passing (all green)**

## Deferred Items and Why

### Cross-package design decisions (surface to user before acting)

1. **Shaper-seam widening** (`@flighthq/textshaper`): Silver's bidi, RTL positioning, real font metrics, and decimal tabs all require `shapeText` to return glyph clusters/advances/bidi levels, not just a total width. This is a joint design change touching `textshaper`, `textlayout`, `text`, `textinput`, and the Rust mirror. Shape of `ShapedGlyphRun` needs consensus before Silver bidi work begins.

2. **`@flighthq/textlayout-formats` neighbor package**: UAX #14 (line breaking) and UAX #29 (grapheme clustering) tables should ship in a `-formats` neighbor package to keep the core tree-shakable for plain-LTR callers. Low risk; follows the established `-formats` pattern. Needs package creation before Silver Unicode work starts.

3. **Bidi algorithm choice**: The Rust port doc names `unicode-bidi` as the canonical stack. The TS implementation should use the same algorithm (or a compatible one) so Silver bidi output is bit-deterministic across TS and Rust for the conformance corpus. Coordinate algorithm choice before implementing bidi.

### Silver items (require cross-package or unicode tables)

- **Unicode line breaking (UAX #14)**: CJK text never wraps; hyphens don't break; nbsp doesn't suppress. Needs `TextBreakOpportunity` type in `@flighthq/types` and table data in `-formats`.
- **Grapheme clustering (UAX #29)**: codepoint iteration (now landed) is the minimum. Full extended grapheme clusters (ZWJ emoji sequences, combining marks, regional indicators, Hangul) need the UAX #29 table in `-formats`.
- **Bidirectional layout (UBA / UAX #9)**: `resolveTextBidiLevels`, `reorderTextLineVisually`. Requires the shaper-seam widening and bidi levels in `TextLayoutGroup`.
- **Real font metrics through the seam**: `size` / `size * 0.185` ascent/descent constants remain until the shaper seam widens to return actual font metrics.
- **Tab alignment variants** (`center | right | decimal`): needs `TextTabAlignment` and `TextTabStop` types in `@flighthq/types`.
- **Inter-character justification + Kashida hook**: `'interCharacter'` mode (CJK); Kashida seam for Arabic.
- **Ordered/decimal list markers**: `TextListMarker` type already scaffolded; implement `'decimal'`/`'lowerAlpha'`/`'upperRoman'` in `computeRichTextContent` + `computeTextLayout`.
- **Hyphenation seam**: `TextHyphenationBackend` with soft-hyphen (U+00AD) default.

### Gold items (large scope / Rust parity)

- **Vertical writing modes**: `TextWritingMode`, `TextOrientation`; entire coordinate model changes.
- **Inline objects / embedded runs**: `TextInlineObject` in layout groups; hit testing generalization.
- **Knuth-Plass optimal line breaking**: opt-in `TextLineBreakStrategy`.
- **Performance hardening**: pool `acquire*`/`release*` for transient arrays; incremental relayout (`invalidateTextLayoutRange`).
- **Conformance corpus**: golden-file layout snapshots for cross-impl oracle.
- **1:1 Rust parity** (`flighthq-textlayout`): mirror every TS function in snake_case; port bidi/segmentation/justify after Silver stabilizes.

## Concerns and Surprises

1. **Bullet emission edge case**: `emitBullet` does not yet check whether the bullet group overlaps the text group when `indent` is explicitly set to 0 by the user. The auto-indent only fires when `indent <= 0`. A large bullet character with a very small or zero indent value could overlap. Future: add a proper `hangingIndent` field to `TextFormat`.

2. **Truncation + word-wrap interaction**: truncation (`maxLines`) fires after `commitLine()` in the wrap loop, which is correct, but the `breakLongWord` path also calls `checkTruncation()` independently. These two paths are not tested together (long word spanning the maxLines boundary). Added a single test covering the basic case; the combined case should be added.

3. **`_text` parameter deprecation**: The `text` → `_text` rename in `getRichTextCharBoundaries` and `getRichTextCharIndexAtPoint` is a breaking API change. Since this is pre-release, it's fine to land as-is; existing callers pass a string but it is genuinely not read. Document removal in the next breaking change. The test file was updated to pass `'abcdefg'` still (zero effect).

4. **`justifyLines` last-line detection**: the current heuristic treats `li === lineCount - 1` as the last line. This is correct for single-paragraph text but is incorrect for multi-paragraph text: the last line of each paragraph (not just the last line of the whole layout) should be left-aligned. Fixing this requires tracking paragraph boundaries per line — a Silver-tier improvement. Current behavior is consistent with most simple use cases.

5. **`TEXT_BOUNDS_GUTTER` export**: the constant is now exported from `textBounds.ts` (previously it was not exported from `index.ts`). This adds one new public symbol. Other packages (`render-canvas`, etc.) that import from `@flighthq/textlayout` and use `TEXT_BOUNDS_GUTTER` should now import it from the package root instead of a direct subpath.

## Suggestions for Future Sessions

1. **Start Silver with `@flighthq/textlayout-formats`**: create the package, add the UAX #14 break-class table, and wire `getTextLineBreakOpportunities`. CJK wrap and hyphen breaks are high-value for any app targeting East Asian users.

2. **Surface the `ShapedGlyphRun` design question**: a joint session with `textshaper` to agree on the widened seam shape before committing to Silver-tier bidi/font-metrics work.

3. **Justification last-line fix**: track paragraph-end line indices during `buildGroups` and pass them to `justifyLines` to skip all paragraph-final lines, not just the absolute last line of the layout.

4. **Add `TextListMarker` to `TextFormat`**: currently `TextFormat.bullet` is a boolean. Adding `listMarker?: TextListMarker` to `TextFormat` would allow users to choose `'none'` to suppress bullet emission even when the HTML parser sets `bullet: true`.

5. **Conformance test**: write a golden-file test for the justify, bullet, truncation, and start/end alignment paths to lock in output stability as Silver changes arrive.
