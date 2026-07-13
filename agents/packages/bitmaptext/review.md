---
package: '@flighthq/bitmaptext'
status: solid
score: 78
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# bitmaptext — Review

## Verdict

solid — 78/100. The North star's coverage list is essentially delivered: a `GlyphSource`-driven display node emitting per-page QuadBatches with wrap, all four alignments (justify included), kerning, letter-spacing, line-height, tint, and cached bounds — and the page-aware seam decision is realized (no separate `image` param, one batch per page). What's left is text-stack maturity: whitespace beyond U+0020, truncation/ellipsis, and the deferred styling/SDF/editing directions.

## Present capabilities

- **Node layer** (`packages/bitmaptext/src/bitmapText.ts`) — `createBitmapText(glyphSource, options)` (eager page-0 QuadBatch child), `reserveBitmapText` (per-page `reserveQuadBatch`), `createBitmapTextData`/`createBitmapTextRuntime`, `getBitmapTextQuadBatches`, seven `set*` field mutators (explicit update model — mutate then call `updateBitmapText`, per house anti-magic rules), `getBitmapTextBounds` (allocating) + `computeBitmapTextLocalBoundsRectangle` (`out`-param, alias-safe, tested aliased), and the runtime `computeLocalBoundsRectangle` method binding.
- **Layout** (`updateBitmapText.ts`) — paragraphs split on `\n` (CR skipped), words measured with intra-word kerning + letter-spacing (`buildBitmapTextWords`; kerning correctly not crossing spaces; zero-ink glyphs advance without quads), greedy wrap at word boundaries with over-wide words overflowing on their own line, left/center/right against `wrapWidth ?? maxLineWidth`, justify distributing gap slack on non-final lines only, baseline stacking by `(ascent + descent + lineGap) × lineHeight`.
- **Per-page batching** — quads partition by `entry.page` into page-indexed QuadBatch children (`ensureBitmapTextPageBatch` grows and parents on demand, binds `getGlyphAtlasImage(page)`, skips null-image pages); regions dedupe per codepoint per layout; bounds span all pages. The [2026-07-10] page-aware decision is fully realized and tested (single-page ≡ one batch; multi-page partition test).
- **Tint** — packed-RGBA `color` folds to a single whole-batch color-transform adjustment (`applyBitmapTextColor`), white clearing it — the adjustments-tier fold, not a per-glyph cost.
- Tests (~460 lines) are strong: kerning placement, region reuse, wrap/align/justify, lineHeight scaling, missing-glyph omission, empty text, bounds, tint on/off, multi-page partition and bounds.

## Gaps

- **Whitespace = U+0020 only.** Tab, NBSP (which should glue, not break), ideographic space, and thin/em spaces are treated as ordinary glyphs (breaking nothing) or missing; no CJK break opportunities — Latin-space-separated text is the only wrapping model. A `textsegment`-informed or class-based break layer is the textbook next step (charter Open direction 1 gestures at the shared line-breaker).
- **No truncation** — `maxLines`/max-height and ellipsis (`…` with re-fit) are standard bitmap-text-node features (games HUDs, UI labels) and absent.
- **Missing glyphs vanish silently** (no quad, no advance — documented) with no guard/`explain*`; a wrong-font string quietly renders shorter. Fallback via a replacement glyph is also unmodeled (paired with the `bitmapfont` `.notdef` question).
- **No per-run styling, SDF material hookup, or textinput binding** — charter Open directions 2–4, correctly deferred.
- Justify interacts with `letterSpacing` only through gap widths (space advance + spacing baked into `gap`); no inter-glyph justification — acceptable, but undocumented.
- `setBitmapTextGlyphSource` does not reset existing page batches' atlas images until the next update binds them — consistent with the explicit-update model, fine.

## Charter contradictions

None. The decisions hold: own package (not in `text`), consumes the seam and depends on neither producer (verified: deps are `types`/`sprite`/`node`/`geometry`/`displayobject`/`textureatlas` + `adjustments`/`materials`), QuadBatch substrate with no new renderer kind, self-contained advance-driven layout with **no `textlayout` dependency** — exactly the boundary's preference. The `adjustments` + `materials` deps for the tint fold go beyond the charter's enumerated dep list; justified in-code, worth a charter footnote.

## Contract & docs fit

- `BitmapText`/`BitmapTextData`/`BitmapTextRuntime`/`BitmapTextOptions`/`BitmapTextKind` in `@flighthq/types` per the node-tier convention; `out`-param bounds with aliasing test; full names; `sideEffects: false`; single barrel; entity/runtime split with runtime slots (`quadBatches`, `localBoundsRectangle`).
- `agents/index.md` Package Map line matches ("lays out glyphs via a `GlyphSource` and emits a QuadBatch"), modulo now being *QuadBatches per page* — cosmetic.
- `crate: null` in the charter front matter is consistent with the display-node tier.

## Candidate open directions

- Break-class model: should wrapping learn whitespace/break classes locally (a small character-class table), or route through `@flighthq/textsegment` (adding the dep) — or await the extracted shared line-breaker of Open direction 1? Three shapes, one decision.
- Truncation semantics: is ellipsis/`maxLines` in-scope for this node, or a caller-side measure-and-cut convention?
- Missing-glyph policy: silent omission (today), replacement glyph from the source, or guard-only? Interlocks with `bitmapfont`'s `.notdef` open direction.
