---
package: '@flighthq/textlayout'
updated: 2026-08-08
by: principal
---

# textlayout — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/textlayout/src/` on 2026-08-08. A file:line here is a
claim about this tree, not about a session.

- **Layout is per-codepoint advances, not shaped runs.** `charAdvances` measures
  each codepoint and, when kerning is on, a second adjacent-pair call to recover the kern
  (`:121-126`) — two `measureText` calls per character on the hot path. Ligatures, mark attachment,
  and cluster boundaries cannot be represented, and `@flighthq/textshaper`'s `ShapedRun` tier is not
  consumed: the only import is `measureText` (`textLayoutMeasure.ts:1`).
- **Font metrics are size-relative estimates.** `getTextFormatAscent` returns `size` and
  `getTextFormatDescent` returns `size * 0.185` (`textFormat.ts:6`, `:10`). `getFontMetrics` exists on
  the shaper seam and is never called from this package.
- **Wrapping breaks only at U+0020 and explicit line breaks** (`textLayout.ts:214`, `:518`, `:522`).
  No UAX #14 break classes, so CJK never wraps, hyphens do not break, and no-break space does not
  suppress a break.
- **No grapheme clustering.** Iteration is codepoint-level (`textLayout.ts:104-106`); extended
  grapheme clusters — ZWJ emoji, combining marks, regional indicators, Hangul — are not honored, so
  caret boundaries and `breakLongWord` can split a cluster.
- **`direction` only flips alignment; there is no visual reordering.** It resolves the `start`/`end`
  aliases in `applyAlignment` (`textLayout.ts:602-612`) and nothing else. `package.json` does not
  depend on `@flighthq/textbidi`, and `TextLayoutGroup` carries no bidi level, so a mixed-direction
  paragraph lays out in logical order.
- **Tab stops are positions only** (`textLayout.ts:147-158`); there is no center/right/decimal tab
  alignment, and no hyphenation seam of any kind.
- **`computeTextLayout` keeps paragraph-boundary state in a module-level `Set`**
  (`textLayout.ts:24`, cleared at `:57`), so the function is not re-entrant.
- **No guard module and no `explain*` query.** `getTextLayoutMeasureProvider` returns `null` when
  neither an explicit provider nor a shaper backend is registered (`textLayoutMeasure.ts:14`); the
  layout then silently stays stale, which is the single most likely caller mistake in this package.
- **Three exports are contract-only**: `TEXT_LAYOUT_GUTTER`, `TEXT_BOUNDS_GUTTER`, and
  `createTextMetrics` are in `contract.ts` but absent from `index.ts`, so no app-lane consumer can
  reach the gutter constant a renderer overlay needs to align with.
- **Structural divider comments** at `textLayout.ts:86`, `:162`, `:584`, `:730`, `:771` violate the
  Source Style rule against them.
- Vertical writing modes, inline objects in layout groups, and Knuth-Plass line breaking are all
  absent — each is a coordinate-model or strategy decision rather than an increment.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Three carried claims checked out
  **false**: the `justifyLines` last-line heuristic ("`li === lineCount - 1` is correct only for
  single-paragraph text") is gone — paragraph-final lines are tracked in `_paragraphLastLines` and
  skipped at `textLayout.ts:509-510`, `:581`, `:664`, and `interCharacter` justification exists at
  `:677`; the vestigial `_text` parameters and the undefined-`text` reference reported against
  `richTextQuery.ts` are gone with the rename to `computeRichTextCharIndexAtPoint`
  (`richTextQuery.ts:11`), which takes no text at all; and `TEXT_BOUNDS_GUTTER` is **not** exported
  from the package root, as claimed — it is contract-only, recorded above.
- **2026-07-30** — Justification walks the source by codepoint during space counting and expansion,
  fixing astral-glyph index drift on justified wrapped text.
- **2026-06-25** — Gutter literal unified onto `TEXT_LAYOUT_GUTTER`; wrap×truncation and
  explicit-indent-beats-bullet cases pinned by test.
- **2026-06-24** — Direction, justification, `maxLines` truncation, bullet emission, codepoint-aware
  iteration, the `kerning` flag, and binary-search line-break lookup landed.
