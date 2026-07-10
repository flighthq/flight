---
package: '@flighthq/bitmaptext'
crate: null
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# bitmaptext — Charter

## What it is

`@flighthq/bitmaptext` is the **QuadBatch-backed bitmap text display node** — it lays out a string's glyphs using a `GlyphSource` (per-glyph atlas region, advance, bearing, kerning, line metrics) and emits the result as a `@flighthq/sprite` **QuadBatch** of glyph quads. It is the composition-layer sibling of `@flighthq/movieclip` (over `timeline`) and `@flighthq/particleemitter` (over `particles`): a display node assembled from lower primitives, owning the `BitmapText` type and its update glue.

It is deliberately **separate from `@flighthq/text`**. That package is *renderer-drawn* text — `TextLabel`/`RichText`/`NativeText` measured and painted by a per-backend renderer over the `textlayout` spine. `BitmapText` is a different substrate: pre-rasterized glyph quads in one batched draw, sourced from an atlas. Keeping it its own cell means `@flighthq/text` never pulls `sprite`/atlas weight, and a user who wants only bitmap text imports only this.

## North star

`createBitmapText(glyphSource, options)` / `reserveBitmapText(...)` build the node; `updateBitmapText(bitmapText)` (re)lays out the current string and rewrites the backing QuadBatch — one glyph quad per visible glyph, positioned by the `GlyphSource`'s advances + kerning, wrapped and aligned across lines. The node **holds a `GlyphSource`**, so it renders identically whether that source is a static `@flighthq/bitmapfont` or a dynamic `@flighthq/glyphatlas` — the seam is the whole point. Coverage to reach for: left/center/right + justify alignment, word-wrap to a width, explicit newlines, multi-line line-advance from `getGlyphMetrics`, per-node tint/color, letter-spacing and line-height overrides, and bounds. The renderer is `sprite`'s existing QuadBatch renderer — `bitmaptext` registers nothing new on the GPU; it only produces quads.

## Boundaries

- **A composition-layer display package.** Deps: `@flighthq/types` (the `GlyphSource` seam + the `BitmapText`/`BitmapTextData` type) + `@flighthq/sprite` (`QuadBatch` construction/append) + `@flighthq/node` + `@flighthq/geometry` (+ `@flighthq/displayobject` if the node tier requires it, matching `sprite`). It does **not** depend on `@flighthq/bitmapfont` or `@flighthq/glyphatlas` — the caller constructs a `GlyphSource` from either and passes it in. That non-dependency is the seam paying off.
- **Layout drives off the `GlyphSource`, not a `TextFormat`.** `textlayout` is font-metric/`TextFormat`-oriented; bitmap glyph metrics come per-glyph from the source. Prefer a compact, self-contained advance-driven layout (walk codepoints → advance + kerning → break on width/newline → align → stack by line-advance) over bending `textlayout` to a shape it wasn't built for. Only take a `@flighthq/textlayout` dependency if it exposes a genuinely substrate-agnostic advance-measured line-breaking seam that fits without a `TextFormat`; if it doesn't, the shared line-breaker is an extraction candidate (see Open directions), not a forced reuse.
- **Node + update split, like the siblings.** The `BitmapText` entity/data lives in `@flighthq/types`; this package owns `create*`/`reserve*`/`update*` and the layout, mirroring `movieclip`/`particleemitter`. No new renderer, no new kind on the GPU — it composes the QuadBatch renderer.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Its own package, not a node in `@flighthq/text`.** Blessed by the user. Matches the `movieclip`/`particleemitter` composition-layer precedent and keeps `sprite`/atlas weight out of `@flighthq/text`, whose identity stays renderer-drawn text.
- **[2026-07-10] Consumes the `GlyphSource` seam, hard-depends on neither producer.** `BitmapText` holds a `GlyphSource`; `bitmapfont` (static) and `glyphatlas` (dynamic) are both valid backings, supplied by the caller. The package depends on neither — only on the seam in `@flighthq/types`.
- **[2026-07-10] QuadBatch substrate; separate from `TextLabel`.** Glyphs are emitted as batched `sprite` QuadBatches (one draw per glyph-atlas page), not per-glyph display objects and not renderer-painted text. `TextLabel` stays the renderer-drawn path; `BitmapText` is the atlas-quad path. The two do not share a base beyond both being display objects — no config-branch bridging them.
- **[2026-07-10] Page-aware `GlyphSource`; one QuadBatch per page — the `image` param is gone.** The seam now pairs its geometry (`getGlyphEntry`, whose `GlyphEntry.page` names the atlas page) with the pixels (`getGlyphAtlasImage(page)`), so `createBitmapText(glyphSource, options)` no longer takes a separate `image` — the node holds a single `GlyphSource` handle and nothing else, meeting the north star (the prior "layout drives off `GlyphSource`, image supplied separately" deviation is **resolved**). `updateBitmapText` partitions glyph quads by `entry.page` into one backing QuadBatch per page (`BitmapTextRuntime.quadBatches`, page-indexed children; a page whose image is null is skipped), mirroring `tilemap`'s per-tileset batch split. Producers are single-page for now — everything on page 0, exactly one batch, behavior identical to the old single-batch path.

## Open directions

1. **Shared advance-driven line-breaker.** If BitmapText's word-wrap/justify logic is genuinely reusable, extract a substrate-agnostic "break lines over abstract advances + kerning" primitive (that `textlayout` could also sit on), rather than duplicating breaking rules. The missing primitive under both text substrates.
2. **Per-run styling / rich bitmap text.** Multiple `GlyphSource`s or per-run tint/scale within one `BitmapText` (the bitmap analogue of `RichText`), once the single-source path is solid.
3. **SDF/MSDF rendering.** When the `GlyphSource` is an SDF atlas (the `distanceField` encoding `bitmapfont-formats` already parses), pair with an SDF material for crisp scaling — a material choice on the QuadBatch, not a layout change.
4. **Textinput binding.** An editable `BitmapText` over `@flighthq/textinput`'s caret/selection model, for bitmap-font UI fields.
5. **Multi-page producers (shared with `bitmapfont`).** The per-page batching path is built and covered; what remains is a *producer* that actually spans pages — `@flighthq/bitmapfont` holding N page images and `@flighthq/bitmapfont-formats` populating each glyph's page from a multi-page `.fnt`. `BitmapText` already renders one QuadBatch per page, so this deepening lands producer-side without further layout work here.
