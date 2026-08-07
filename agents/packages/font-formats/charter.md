---
package: '@flighthq/font-formats'
role: package
crate: flighthq-font-formats
draft: false
lastDirection: 2026-08-07
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# font-formats — Charter

## What it is

`@flighthq/font-formats` is the **codec neighbor of `@flighthq/font`** — it turns OpenType/TrueType bytes into a `GlyphOutlineSource`. A `-formats` subpackage so an app that consumes `GlyphOutlineSource` for SWF's own edge-record outlines never links a font-file parser it does not use, matching `bitmapfont`/`bitmapfont-formats` in the same domain.

## ★ How big this is, and why — read this before estimating it

**This is not "add font parsing to Flight." It is "produce an existing interface from OpenType/CFF bytes."**

`GlyphOutlineSource` was declared in `@flighthq/types` before this package existed, and it already fixes the whole output contract: four methods, design-unit coordinates, baseline-relative paths with y increasing downward, `unitsPerEm` as the scale denominator, `-1` for an unmapped codepoint, `false` for an unknown glyph index, and empty-but-present glyphs returning `true` so their advance stays observable. **The producer's output shape is therefore determined rather than a design question**, and `@flighthq/font` already ships `createGlyphRasterizerBackendFromGlyphOutlineSource`, so everything downstream of one already works.

What remains is byte reading against a published format. That is the entire job. An estimate that prices a font subsystem — shaping, layout, hinting, a glyph cache, a fallback chain — is pricing four other packages that already exist or are deliberately out of scope.

## ★ Licence line — settled before the first line of code, because this is the most encumbered domain in the tree

FreeType, HarfBuzz, and opentype.js all solve this and are all one search away. The repository rule already decides it, and the distinction is fine but real:

- **Interface facts are what a published format is _for_.** Table tags, offsets, field names, enum values, the magic number `0x00010000`, the fact that `loca` is indexed by glyph id. Stating these is stating facts about the format and carries no obligation to anyone.
- **Charstring and outline interpretation is an _algorithm_.** It is built **from the specification, in Flight's own architecture, never transcribed from a reference implementation.** Reading someone's parser to learn the shape of the answer is how a transcription happens without anyone deciding to make one.
- **Record how to obtain and verify anything tested against — never whose terms it carries.** URL, and a hash. No licence named, no `NOTICE`, nothing inferred from a file's provenance.
- **No vendored fixtures, ever.** Test fonts are fetched on demand into the gitignored asset cache, the way every other real-file test in this repo already works, and committed nowhere. Synthetic fonts this package builds byte by byte in a test are not third-party material and are the preferred fixture.
- **If third-party material seems necessary for anything, stop and ask.** That outranks any feature in this package.

## North star

Given the bytes of a font file, produce a `GlyphOutlineSource`: outlines, advances, and a codepoint→glyph mapping, in design units. `createGlyphOutlineSourceFromOpenTypeFont(bytes)` with a `null` sentinel, and `explainOpenTypeFont(bytes)` as the shakeable pull-style query saying why a rejection happened, since one sentinel cannot distinguish "this is a compressed WOFF" from "this font's outlines are charstrings" from "this table is truncated".

## Boundaries

Three of these are already drawn by the package map and are **not this package's to redraw**:

- **Shaping is `@flighthq/textshaper`.** No `GSUB`/`GPOS`, no bidi, no cluster logic.
- **Layout is `@flighthq/textlayout`.** No line breaking, no justification.
- **Static bitmap fonts are `@flighthq/bitmapfont`.** No `EBDT`/`CBDT` raster strikes.
- **No hinting.** Outlines are produced in design units, unhinted; grid fitting is a rasterizer concern and `@flighthq/font` owns the rasterizer seam.
- **Depends on `@flighthq/types` and `@flighthq/font`** (for `detectFontFormat`, which already exists and is not duplicated here). No DOM, no renderer, no resource loading — a caller hands over bytes.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-08-07] The package exists, beside `font` rather than inside it.** Two independent consumers earned the subject: the Rive `fontAssetId` path, whose `FontAsset` already carries embedded `bytes`, and SWF `DefineFont4`, which is Open direction 3 on the `swf` charter. Placement is by same-domain precedent — `bitmapfont`/`bitmapfont-formats` is a font-ish package with its format parser already split out and shipped — plus the bundle invariant: an assembly never inflates the bundle cost of a primitive, and SWF's outline path must not link an OpenType parser it never reaches.
- **[2026-08-07] It produces the existing `GlyphOutlineSource`; it does not define a new seam.** The type, its owner, and at least two consumers all predate this package. What was missing was only the producer.
- **[2026-08-07] First cut reads quadratic `glyf` outlines only.** The sfnt container and the tables every source needs (`head`, `hhea`, `maxp`, `hmtx`, `cmap`) are flavor-independent and land first. PostScript charstrings (`CFF `/`CFF2`) are a **stated, reported absence** rather than a silent one: such a font is rejected with reason `unsupported-outlines` naming the table found. Rationale — charstring interpretation is the largest algorithm here and the one carrying the sharpest transcription hazard, so it is worth its own deliberate pass rather than being hurried alongside the container work.

- **[2026-08-07] `CFF ` charstrings land; the first cut's stated absence is retired.** A dedicated pass, which is what the deferral above asked for — the deferral is honoured by being executed rather than discarded. The `CFF ` table is read through its INDEX/DICT containers and its Type 2 charstrings are interpreted into cubic segments, so an `.otf` now produces a `GlyphOutlineSource` where it previously rejected. Built from the specification in Flight's own architecture; operator numbers and table layout are interface facts, the interpreter is ours. **Two deliberate refusals remain, each reported rather than silent:** `CFF2` is a different charstring dialect and keeps `unsupported-outlines`; a **CID-keyed** font is refused because its FDSelect/FDArray indirection gives each glyph its own subroutine pool, so the single-private-DICT read is not reading what it assumes. The refusal is justified by the outcome being **unpredictable per font**, not by it being silent — measured rather than assumed, a missing subroutine pool makes a glyph return `false`, which is visible.

- **[2026-08-07] CID-keyed `CFF ` lands; the refusal becomes support.** A CID font is several fonts in one table — an `FDArray` of font DICTs, each owning a private DICT and therefore its own local subroutine pool, with `FDSelect` mapping glyph to FD. Each glyph now resolves against **its own** pool. The reason this had to be built rather than approximated: subroutine indices are biased by pool size, so an index valid in one pool selects a **different real entry** in another, and a real entry draws something — binding every glyph to one pool would produce plausible geometry rather than an error. Both partial-answer paths refuse instead of falling back: an `FDSelect` leaving a tail unmapped, and one naming an FD the `FDArray` lacks. `CFF2` remains refused and reported.

- **[2026-08-07] WOFF lands as a container, not a format.** WOFF wraps the same sfnt tables, each optionally deflated, so it is unwrapped into a plain sfnt once and every existing reader — the directory, `glyf`, `CFF `, CID — works through it unchanged. No new outline code and no new seam. The DEFLATE codec is **not bundled**: it comes from `@flighthq/compression`'s registry, which a caller opts into with `registerDeflateDecompressor()`, because importing it directly would drag DEFLATE into every bundle that reads a `.ttf`. The cost of that choice is reported rather than hidden — an unregistered decompressor gets its own reason, `missing-decompressor`, since the remedy is one line of registration rather than a different producer. **WOFF2 stays out**: Brotli plus a table-transform reversal is a separate slab.

## Open directions

1. **WOFF2** — Brotli plus the table transforms. Brotli is **not** in `@flighthq/compression`; whether it goes there is that package's decision rather than this one's, so it is a question to ask before it is work to do.
2. **`CFF2`** — a different charstring dialect, adding variation support.
3. **Which consumer's format is actually first.** SWF `DefineFont4` is CFF by the format's own definition. What Rive embeds is **not yet established from a real file** and should be measured rather than assumed.
4. **Structured import diagnostics.** Every other `*-formats` package reports through `@flighthq/importdiagnostics`. This one offers only the `explain*` pull query, deliberately, because that seam was under active change when this package was written. Adopting it is a follow-up, not an omission.
