# bitmapfont — Status

Continuity log for `@flighthq/bitmapfont` and `@flighthq/bitmapfont-formats`.

## 2026-07-10 — foundation created (builder)

New packages created from scratch, foundation only:

- `@flighthq/types`: added `BitmapFont` (resource entity composing a `TextureAtlas`) and
  `BitmapGlyph` (per-glyph metrics keyed by code point). `BitmapFontKerning` is a satellite in
  `BitmapFont.ts`.
- `@flighthq/bitmapfont`: `createBitmapFont`, `addBitmapFontGlyph`, `addBitmapFontKerning`,
  `getBitmapFontGlyph`, `getBitmapFontKerning`, `getBitmapFontGlyphRegion`, `measureBitmapFontText`.
  Lookups are linear scans (mirrors textureatlas region scans); a runtime Map index is a deepening
  item, not built.
- `@flighthq/bitmapfont-formats`: `parseBitmapFontText` (AngelCode BMFont **text** `.fnt` →
  `BitmapFont`), `parseBitmapFontTextDocument` (pure parse → schema), schema types.

The charter is a **DRAFT (unblessed)**. Real design forks are surfaced there and NOT decided:
(1) primary authoring format (BMFont-text vs XML vs Starling), (2) layout via the `TextShaperBackend`
seam vs standalone, (3) package boundaries, (4) SDF/MSDF, (5) a render/display path. The
`TextShaperBackend` adapter was deliberately left unbuilt because it forces the `TextFormat`→font
resolution + size-scaling decision (fork 2/5).

Next concrete steps (pending user direction): a `review.md`/`assessment.md` pass, then decide the
forks in a direction session before building the shaper adapter or a second format.
