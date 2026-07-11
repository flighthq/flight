---
package: '@flighthq/bitmapfont-formats'
crate: flighthq-bitmapfont-formats
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# bitmapfont-formats — Charter

## What it is

`@flighthq/bitmapfont-formats` is the **codec neighbor of `@flighthq/bitmapfont`** — it parses the standard bitmap-font description formats (AngelCode/BMFont `.fnt` in text, XML, and JSON variants) into a `BitmapFont`, and serializes back. A `-formats` subpackage so the parsing weight stays tree-shakable off the core `bitmapfont` model, matching `path-formats`/`shape-formats`.

## North star

Complete AngelCode/BMFont coverage: parse the text `.fnt`, the XML `.fnt`, and the JSON export into a `BitmapFont` — `info`/`common`/`pages`/`char`/`kerning` blocks → atlas metadata + glyph table + kerning + line metrics — with the atlas page image(s) resolved via a caller-supplied resolver (the same reference-then-resolve pattern `shape-formats` uses for bitmap fills). `parseBitmapFontFnt`/`formatBitmapFontFnt` (+ the XML/JSON variants) over `@flighthq/bitmapfont`'s constructors.

## Boundaries

- **Depends on `@flighthq/bitmapfont` + `@flighthq/types`.** No DOM, no renderer. Atlas page images are resolved by the caller (a `resolvePage` callback returning a `TextureAtlas`/image), not loaded here — the codec owns text, not image I/O.
- **Codec only.** Turns a `.fnt`/XML/JSON into a `BitmapFont` and back; owns no glyph model, no rendering.
- **Formats are independently tree-shakable** — each `parse*`/`format*` pair its own module.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] AngelCode/BMFont first, three text encodings.** `parseBitmapFontFnt(text, options): BitmapFont | null` (the classic `key=value` text `.fnt`), plus XML and JSON variants (`parseBitmapFontXml`/`parseBitmapFontJson`), all producing a `BitmapFont` via `@flighthq/bitmapfont`. Sentinel `null` on malformed input. `format*` re-emit the text form losslessly.
- **[2026-07-10] Atlas pages resolve via a caller callback.** The `.fnt` names page image files; those are live resources, not codec data. `parseBitmapFont*(text, { resolvePage })` rehydrates each page to a `TextureAtlas`/image via the caller's resolver (dropped, documented, without one) — the same reference-then-resolve seam as `shape-formats`' bitmap fills.
- **[2026-07-10] Multi-page `.fnt` populated (was collapse-to-first).** `buildBitmapFontFromRecord` now resolves **every** page the record declares (`resolvePage` called once per page id), assembles the font's page-indexed `pages[]` (page id = index), and carries each `char`'s parsed `page` onto its glyph — the text/XML/JSON `char` readers now read the `page` field (default 0), and `formatBitmapFontFnt` emits one `page` line per font page with each `char page=` from the glyph. Resolution rule: a page a glyph actually samples must resolve (an unresolved referenced page, or an absent `resolvePage`, collapses the parse to `null`); a declared-but-unreferenced page that fails to resolve is tolerated and left absent. Single-page fonts are unchanged (`pages:[atlas]`, all glyphs page 0).

## Open directions

1. **`.ttf` → bitmap bake pipeline** — a build-time path that rasterizes a vector font (via `@flighthq/glyphatlas`) and emits a `.fnt` + atlas, closing the authoring loop.
2. **BMFont binary `.fnt`** — the packed binary variant alongside the text forms.
3. **Other ecosystems** — Hiero/Shoebox/`fontbm` quirks and the `.json` shapes emitted by common packers.
