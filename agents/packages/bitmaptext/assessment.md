---
package: '@flighthq/bitmaptext'
updated: 2026-07-13
basedOn: ./review.md
---

# bitmaptext — Assessment

## Recommended

Sweep-safe, within-package:

1. **Whitespace-class widening (local)** — treat tab (advance by a documented tab-advance or space multiple), NBSP (renders as space width but never breaks), and ideographic/thin/em spaces correctly inside `buildBitmapTextWords`, via a small local character-class helper. No new dependency; the full break-class/CJK question stays parked below.
2. **Truncation** — `maxLines` (or max-height) with optional ellipsis on `BitmapTextData`: stop layout at the limit and re-fit the final line with the `…` glyph when set. Standard node feature, contained to `updateBitmapText.ts` + the data/options types.
3. **Guards + `explain*` for missing glyphs** — `enableBitmapTextGuards` warning (once per codepoint, via `@flighthq/log`) when `getGlyphEntry` returns null or a page image is null during layout, and a shakeable `explainBitmapTextLayout(bitmapText)` returning plain data (missing codepoints, skipped pages, line count). Applies the diagnostics rule to two existing silent omissions.
4. **Document justify × letterSpacing** — a durable comment stating justification distributes inter-word gap slack only (no inter-glyph tracking), so the behavior is a stated rule.
5. **Baseline/line query helpers** — `getBitmapTextLineCount` / line-extent access from the cached layout (cheap to record during update), the groundwork consumers (and the future textinput binding) need without re-laying-out.

## Backlog

- **Break-class model / CJK wrapping / `textsegment` routing** — parked: three-way design fork (local table vs. `textsegment` dep vs. the extracted shared line-breaker of charter Open direction 1); needs a charter ruling.
- **Per-run styling / rich bitmap text** — parked: charter Open direction 2, explicitly gated on the single-source path being blessed solid.
- **SDF/MSDF material pairing** — parked: charter Open direction 3, cross-package (material on the QuadBatch, `render-*` shader).
- **Textinput binding (editable BitmapText)** — parked: charter Open direction 4, cross-package.
- **Replacement-glyph (`.notdef`) fallback** — parked: interlocks with `bitmapfont`'s missing-glyph model decision.
- **Charter dep-list footnote** (`adjustments` + `materials` for the tint fold) — parked: charter edit, user's gate.

## Approved

_Empty — awaiting the user's verbal approval gate._
