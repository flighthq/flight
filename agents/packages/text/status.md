---
package: '@flighthq/text'
updated: 2026-08-08
by: principal
---

# text — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/text/src/` (and its `textlayout` neighbor) on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

- **Six object/range setters invalidate unconditionally while every scalar setter diff-skips.**
  `setRichTextContent` (`richText.ts:440`), `setRichTextDefaultTextFormat` (`:448`),
  `setRichTextFormatRange` (`:453`), `setTextLabelFormat` (`textLabel.ts:121`), `setNativeTextStyle`
  (`nativeText.ts:117`), and `patchNativeTextStyle` (`nativeText.ts:85`) bump the revision on every
  call. Two of them say so in a comment ("field-level equality is not tracked"), which is a stated
  behavior, not a rule: the invalidation doctrine holds that identities are *compared*, and no
  decision is recorded on whether these should compare the reference, compare structurally, or keep
  bumping. Setting the same format object twice re-lays-out the field.
- **`setRichTextFormatRange` appends rather than applies.** It pushes onto `textFormatRanges`
  (`richText.ts:459`) with no merge, split, or replacement of an overlapping range, so repeatedly
  formatting the same span grows the list without bound and the effective format is decided by array
  order in `getRichTextFormatRangeAt` (`:212`). A range *editor* — the counterpart to the reader —
  does not exist.
- **Every layout-derived reader returns a sentinel that cannot be distinguished from a real value.**
  When no measure provider is registered, `ensureTextLayout` returns early (`textLabelLayout.ts:26`)
  and the eight readers fall to their sentinels — `-1` from `getRichTextCharIndexAtPoint`
  (`richText.ts:201`), `0` from `getRichTextLineCount` (`:262`), `1` from `getRichTextMaxScrollV`
  (`:287`), `null` from `getRichTextLineMetrics` (`:272`), and so on. There is no `enableTextGuards`
  module and no `explain*` query anywhere in the package, so "you never installed a shaper backend"
  and "the field is empty" are the same answer.
- **No inline objects.** Nothing carries an embedded image or object run; that needs a
  `RichTextInlineObject` type in `@flighthq/types` and a matching layout-group change in
  `@flighthq/textlayout`, so it is a two-cell design decision rather than an increment here.
- **Functional coverage stops short of the stateful paths.** `functional/scenes/` carries
  `text-basic`, `text-wrap`, `text-multiformat`, `text-vertical-align`, the alignment and style
  scenes, and `textlabel-basic` — but nothing exercises autoSize anchors, scrolling, or link
  dispatch, which are the paths where invalidation and layout staleness actually show.
- **`package.json` dependencies are not alphabetized** — `@flighthq/scene2d` sits ahead of
  `@flighthq/entity`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The carried headline claim — an
  undefined-variable bug at `packages/textlayout/src/richTextQuery.ts:68`, said to make
  `getRichTextCharIndexAtPointValue` throw or return wrong values in the common hit-test case, with a
  test deliberately steered to `y = 9999` to avoid it — is **false**: the function is now
  `computeRichTextCharIndexAtPoint(layout, x, y)` (`richTextQuery.ts:11`) and takes no text
  parameter at all, so neither the `_text` rename nor the stray reference exists. Also dropped: the
  `*Value` suffix concern (those wrappers were renamed away — `getRichTextLineCount` and friends now
  carry the plain name), the HTML-seam design question (markup parsing moved out to
  `@flighthq/text-markup`, and `htmlText`/`styleSheet` are gone from this package), the
  `condenseWhite` wiring gap (honored at `packages/textlayout/src/richTextContent.ts:59`), and the
  claim that `insertRichTextString` / `replaceRichTextString` / `enableTextFieldSignals` are deferred
  (all three are implemented and tested).
- **2026-08-05** — Post-review reconciliation: vertical alignment, TextLabel auto-size bounds
  invalidation, markup moved to the text-markup seam, exports routed through the contract lanes.
- **2026-06-25** — `getRichTextFormatRangesIn` added as the read partner to
  `removeRichTextFormatRangesIn`; `@flighthq/signals` added to the manifest.
- **2026-06-24** — `internal.ts` retired, the RichText setter/getter surface completed, and the
  entity-level metric conveniences landed.
