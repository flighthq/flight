---
package: '@flighthq/bitmapfont'
updated: 2026-07-13
basedOn: ./review.md
---

# bitmapfont — Assessment

## Recommended

Sweep-safe, within-package:

1. **Supplementary-plane-safe kerning key** — replace the `(left << 16) | right` BMP-only pack with a collision-free key (e.g. `left * 0x110000 + right` stays within safe-integer range, or a string key), removing the silent aliasing cliff. Internal representation only; API unchanged.
2. **`hasBitmapFontGlyph(font, codepoint)`** — the `has*` predicate beside the null-sentinel lookup, per the accessor conventions.
3. **Guards + `explain*`** — `enableBitmapFontGuards` warning on the out-of-range page clamp in `createBitmapFont` (a source-data defect worth surfacing, with the fixing context), and `explainBitmapFontGlyph(font, codepoint)` plain-data for the null path. Straight diagnostics-convention application.
4. **Byte-size/summary reporting** — `getBitmapFontByteSize`/glyph-count style queries mirroring the `textureatlas` neighbor's reporting, for cache budgeting by consumers.

## Backlog

- **Distance-field parameters on the model** (`range`/spread beside `encoding`) — parked: a `@flighthq/types` model decision that should land together with `bitmapfont-formats` preserving `distanceField.range` and the eventual `render-*` shader — needs the design settled first (review's open direction; raise to charter).
- **Fallback-chain `GlyphSource` composition** — parked: charter Open direction 2; also a placement question (here vs. the seam-owning `glyphatlas` vs. a neutral home) — a design fork, not sweep work.
- **`.notdef`/replacement-glyph convention** — parked: model/policy decision (review open direction).
- **`bakeBitmapFont` producer** — parked: lives in `@flighthq/glyphatlas` (tracked in that cell's assessment); this cell is only the target type.

## Approved

_Empty — awaiting the user's verbal approval gate._
