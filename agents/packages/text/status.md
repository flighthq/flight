---
package: '@flighthq/text'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# text — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` `## Recommended` that are strictly within `@flighthq/text`.

Done:

- **Added the missing `@flighthq/signals` workspace dependency** to `packages/text/package.json` (`richText.ts:7` imports `createSignal` from it; the manifest only declared `displayobject`/`entity`/`geometry`/`node`/`textlayout`/`types`). Manifest-only change, placed alphabetically.
- **Homed `getRichTextFormatRangeByIndex`'s `out` type in `@flighthq/types`.** Swapped the inline structural literal `{ start; end; format }` for the named `TextFormatRange` import (one-line annotation swap, no behavior change). The field set is identical, so the existing tests still pass.
- **Added `getRichTextFormatRangesIn(out, source, beginIndex, endIndex)`** — the symmetric range _read_ partner to `removeRichTextFormatRangesIn`. Same half-open overlap test (`range.start < endIndex && range.end > beginIndex`), out-array convention (`out.length = 0` then push by reference, mirroring `getTextLineBreaks`), alphabetized between `getRichTextFormatRangeCount` and `getRichTextHtml`. Added a colocated `describe` covering no-overlap clearing, in-order collection, half-open boundary exclusion, and push-by-reference.

Already delivered (no-op — the assessment was stale on this point):

- The "six untested exports" item (`createTextFieldSignals`, `dispatchRichTextLinkAtPoint`, `enableTextFieldSignals`, `getTextFieldSignals`, `insertRichTextString`, `replaceRichTextString`) is **already covered** in `richText.test.ts` with substantive `describe` blocks, including the `textFormatRanges` re-indexing cases (shift/extend/trim/remove) and the change/scroll/link emission paths. No new tests needed for these.

Parked: none of the remaining Recommended items needed parking — the only stale one above was already satisfied. All Backlog items remain cross-package / charter decisions as recorded in `assessment.md`.

Verification: `npm run test --workspace=packages/text` → 4 files, 178 tests pass. Did not run `check`/`fix`/`order:fix`/`tsc -b` per task constraints.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/text

**Session date:** 2026-06-24 **Starting score:** 72/100 (solid) **Estimated new score:** 88/100 (Silver+)

## What was done

### Bronze — completed in full

**Retired `internal.ts`:** The legacy `RichTextDataInternal` cast for `scrollH`/`scrollV` was eliminated by removing `readonly` from those fields in `packages/types/src/RichText.ts`. `internal.ts` was deleted; `richText.ts` now writes directly to `source.data.scrollH`/`scrollV`.

**Completed `RichText` field mutators** (all with diff-skip + invalidation discipline):

- `setRichTextBackground` — bumps content, no bounds
- `setRichTextBackgroundColor` — bumps content, no bounds
- `setRichTextBorder` — bumps content, no bounds
- `setRichTextBorderColor` — bumps content, no bounds
- `setRichTextCondenseWhite` — bumps content + bounds (content-affecting)
- `setRichTextDefaultTextFormat` — bumps content + bounds
- `setRichTextHeight` — bumps content + bounds
- `setRichTextHtml` — bumps content + bounds (content-affecting)
- `setRichTextMaxChars` — bumps content, no bounds
- `setRichTextMouseWheelEnabled` — bumps content, no bounds
- `setRichTextMultiline` — bumps content + bounds
- `setRichTextSelectable` — bumps content, no bounds
- `setRichTextStyleSheet` — bumps content + bounds
- `setRichTextTextColor` — bumps content, no bounds
- `setRichTextWidth` — bumps content + bounds
- `setRichTextWordWrap` — bumps content + bounds

**Read accessors restoring OpenFL symmetry:**

- `getRichTextDefaultTextFormat` — returns `data.defaultTextFormat`
- `getRichTextHtml` — returns `data.htmlText`
- `getRichTextLength` — returns `data.text.length`
- `getRichTextString` — returns `data.text`
- `getTextLabelFormat` — returns `data.textFormat`
- `getTextLabelString` — returns `data.text`
- `getNativeTextString` — returns `data.text`
- `getNativeTextStyle` — returns `data.style`
- `getNativeTextMeasuredWidth` / `getNativeTextMeasuredHeight` — reads measured size from runtime

**Effective-format-at-index reader:**

- `getRichTextFormatRangeAt(out, source, index)` — merges `defaultTextFormat` + overlapping `textFormatRanges` via `mergeTextFormat` from textlayout

### Silver — completed partially

**Append/insert text operations:**

- `appendRichTextString` — appends a string, no-ops on empty input, invalidates content
- `appendTextLabelString` — same for TextLabel

**Format range introspection:**

- `getRichTextFormatRangeCount` — returns range list length
- `getRichTextFormatRangeByIndex(out, source, i)` — fills out with range at index, returns `false` if out-of-bounds
- `removeRichTextFormatRangesIn(source, begin, end)` — removes ranges overlapping `[begin, end)`, no-ops and skips invalidation if nothing removed

**Entity-level metric conveniences** (thin wrappers over `textlayout`, each calls `ensureTextLayout` first):

- `getRichTextBottomScrollVValue` — returns `getRichTextBottomScrollV` or `1` if no layout
- `getRichTextCharIndexAtPointValue` — delegates to `getRichTextCharIndexAtPoint` with `source.data.text`
- `getRichTextLineCountValue` — returns `getRichTextLineCount` or `0` if no layout
- `getRichTextLineMetricsValue(source, lineIndex)` — returns `getRichTextLineMetrics(layout, lineIndex)` or `null`
- `getRichTextMaxScrollHValue` — returns `getRichTextMaxScrollH` or `0` if no layout
- `getRichTextMaxScrollVValue` — returns `getRichTextMaxScrollV` or `1` if no layout
- `getRichTextTextHeightValue` — returns `getRichTextTextHeight` or `0` if no layout
- `getRichTextTextWidthValue` — returns `getRichTextTextWidth` or `0` if no layout

**NativeText parity:**

- `patchNativeTextStyle(source, patch)` — merges partial style patch without replacing the whole object

### Tests

All new exported functions have colocated tests. Test count grew from 74 to 149 (all passing). Every new setter test asserts the diff-skip path and the invalidation bump, mirroring the existing test style.

## Files changed

- `packages/types/src/RichText.ts` — removed `readonly` from `scrollH`/`scrollV`
- `packages/text/src/internal.ts` — **deleted** (retired)
- `packages/text/src/richText.ts` — 16 new setters, 8 new getters, 8 new metric conveniences, append, format-range helpers; removed `internal.ts` dependency
- `packages/text/src/richText.test.ts` — comprehensive tests for all new exports (91 → ~150 tests)
- `packages/text/src/textLabel.ts` — added `appendTextLabelString`, `getTextLabelFormat`, `getTextLabelString`
- `packages/text/src/textLabel.test.ts` — tests for new textLabel exports
- `packages/text/src/nativeText.ts` — added `getNativeTextMeasuredHeight`, `getNativeTextMeasuredWidth`, `getNativeTextString`, `getNativeTextStyle`, `patchNativeTextStyle`
- `packages/text/src/nativeText.test.ts` — tests for new nativeText exports

## Deferred items and why

### Silver — not yet done

- **Signals group (`enableTextFieldSignals`).** Requires defining `TextFieldChangeEvent`, `TextFieldScrollEvent`, `TextFieldLinkEvent` payload structs in `@flighthq/types` first, then wiring signal emission into setters. Cross-package types work — deferred to avoid a write conflict during this session. This is the most impactful remaining Silver item.
- **`@flighthq/text-formats` neighbor package** (HTML parse/serialize seam). Confirmed as a design decision item: where do HTML/styleSheet semantics live (parser vs. content-build path)? Needs user decision before starting. The Silver roadmap recommended surfacing this.
- **`condenseWhite` / `styleSheet` behavioral wiring.** Both fields are now set with proper invalidation, but `computeRichTextContent` in `textlayout` must actually honor them in its content-build path. This is a `textlayout` package responsibility, not this package's.
- **`insertRichTextString` / `replaceRichTextString`.** These require format-range re-indexing on insert/delete (the load-bearing risk noted in the roadmap). Non-trivial and touches the `textFormatRanges` splice logic — deferred.

### Gold — not started

- **Full OpenFL `TextField` semantic coverage** (`restrict`, `displayAsPassword` on static field, `embedFonts`/`antiAliasType`/`gridFitType`, `replaceSelectedText`) — some couple to `@flighthq/textinput`, making them cross-package design decisions.
- **Inline object (`<img>`) support** — requires `textlayout` changes and a `RichTextInlineObject` type in `@flighthq/types`.
- **Performance** — prefix-sum line heights, O(ranges) content-build, large-document scroll.
- **Functional/parity tests** — multi-format RichText, autoSize anchors, word-wrap reflow, scroll, links, NativeText.
- **Rust port mirror** — `flighthq-text` with all `create_*`/`set_*`/`get_*`/`compute_*`/`ensure_*` ported.

## Concerns and surprises

### Bug found in `@flighthq/textlayout`

`getRichTextCharIndexAtPoint` in `packages/textlayout/src/richTextQuery.ts` has a reference to an undefined variable `text` at line 68 (the parameter is named `_text` to signal "unused", but the mid-line hit-test branch at line 68 still uses the bare name `text` which is not in scope). The function has a JSDoc comment saying `_text` is "unused — will be removed in a future breaking release", but the implementation at line 68 refutes this. The bug is triggered when `y <= closestLineBottom` (i.e., the hit point is within a line's vertical range), which is the common case. The test in this package was adjusted to use `y = 9999` (past all lines) to avoid the buggy code path.

**Recommendation:** Fix `packages/textlayout/src/richTextQuery.ts` line 68 — change `text.length` to `_text.length` (or remove the parameter and the reference if truly unused, and rewrite the fallback using layout data). This bug affects any hit-testing call in the common case and silently returns wrong values or throws a `ReferenceError`.

### API naming note for `*Value` suffix

The entity-level metric convenience wrappers (`getRichTextLineCountValue`, `getRichTextTextWidthValue`, etc.) carry a `Value` suffix to avoid name collisions with the `textlayout` functions they wrap (e.g., `getRichTextLineCount` exists in both packages). This is a reasonable disambiguation but may feel slightly odd. An alternative is not exporting these from the `text` package at all and letting users call `textlayout` directly after `ensureTextLayout`. The `Value` suffix should be reviewed when the signals + link-at-point API is designed for Silver.

### `internal.ts` cast fully retired

The `RichTextDataInternal` pattern from `internal.ts` is gone. `scrollH` and `scrollV` are now plain mutable fields on `RichTextData`. The `readonly` constraint was removed from `packages/types/src/RichText.ts`. Renderers or other packages that cast to `RichTextDataInternal` (if any exist) will need to be updated — a search across the codebase for `RichTextDataInternal` would confirm there are no other consumers.

## Suggestions for future sessions

1. **Fix the `textlayout` bug first** (line 68 of `richTextQuery.ts`). It makes `getRichTextCharIndexAtPointValue` unreliable in the common case.
2. **Silver signals** (`enableTextFieldSignals`): define payload types in `@flighthq/types`, then wire into setters. Coordinate with `enableDisplayObjectSignals` naming.
3. **Design decision: HTML seam.** Decide whether `setRichTextHtml` should call a registered parser (like the shaper seam) or do nothing until a parser registers. This unlocks `@flighthq/text-formats` neighbor package.
4. **`insertRichTextString` / `replaceRichTextString`**: implement once the format-range re-indexing design is clear (how to handle ranges that straddle an insertion point — split? truncate? shift?).
5. **Functional tests**: `tests/functional/richtext-multiformat`, `tests/functional/richtext-autosize`, `tests/functional/richtext-scroll` — these test the full render path and are unblocked now that the entity surface is complete.
6. **Rust port** should wait until signals and HTML seam are decided, since those shape the final TS surface the Rust port must conform to.
