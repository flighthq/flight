---
package: '@flighthq/bitmapfont'
status: solid
score: 76
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# bitmapfont — Review

## Verdict

solid — 76/100. Small on purpose and close to its bedrock: an immutable multi-page `BitmapFont` value with pure lookups satisfying the shared `GlyphSource` seam, exactly as the charter decisions specify. The remaining distance is completeness at the edges (SDF parameters, fallback composition, supplementary-plane kerning) rather than missing structure.

## Present capabilities

- **`createBitmapFont(data)`** (`packages/bitmapfont/src/bitmapFont.ts`) — builds the immutable value from plain `BitmapFontData`: glyph list → `Map<codepoint, GlyphEntry>` with per-glyph `page` (default 0, out-of-range clamped to 0 with the survive-don't-drop rationale documented), kerning pairs → `(left << 16) | right` keyed map, `pages: TextureAtlas[]` (defensively sliced), metrics copied, `encoding` defaulting `'raster'` with `'sdf' | 'msdf'` carried.
- **Pure lookups** — `getBitmapFontGlyph` (null sentinel), `getBitmapFontKerning` (0 sentinel), `getBitmapFontMetrics`, `getBitmapFontPage(font, page = 0)` (null out of range), `getBitmapFontPages`. All match the charter's "static counterpart to rasterize-on-miss" framing.
- **`createGlyphSourceFromBitmapFont`** (`glyphSource.ts`) — the seam adapter: `getGlyphAtlasImage(page)` returns `pages[page]?.image ?? null`, pairing geometry with pixels per the page-aware decision; entry/kerning/metrics bind the pure lookups.
- Tests cover map building, encoding defaulting, page clamping, lookup sentinels, immutability-by-reuse, and multi-page image resolution — aligned with source order.
- The multi-page decision ([2026-07-10]) is fully realized here: `pages[]`, per-glyph `page`, both accessors, and `bitmaptext` + `bitmapfont-formats` already consume it (verified in their sources).

## Gaps

- **SDF/MSDF is only an enum.** `encoding` distinguishes the field types but carries no field parameters — a distance-field renderer needs at least the field range/spread (BMFont JSON `distanceField.range`, which `bitmapfont-formats` currently reads for the *encoding* and discards the range). The shader is out of scope (charter), the *data* is this cell's.
- **No fallback composition** — charter Open direction 2: `createGlyphSourceFromGlyphSources(...)` / a fallback-chain `GlyphSource` (bitmap font first, dynamic atlas for misses) does not exist anywhere; as seam-owner-adjacent work it would naturally live where the static source does.
- **Kerning key is BMP-only** (`packBitmapFontKerningKey` documents `< 0x10000`); supplementary-plane pairs silently alias. Rare in bitmap fonts, but silent aliasing contradicts the "sentinel or correct" posture — a string key or split-map would remove the cliff.
- **No `explain*`/guards** — a missing glyph and a clamped bad page index are silent; the clamp especially is a source-data defect a guard should surface.
- No convenience queries a mature bitmap-font model tends to grow: `hasBitmapFontGlyph`, glyph-count/byte-size reporting (the `textureatlas` neighbor exposes byte sizes), or a documented `.notdef`/replacement-glyph convention for missing codepoints.

## Charter contradictions

None. Boundaries hold: no parsing (formats neighbor), no rendering, no rasterization; deps exactly `textureatlas` + `types`; immutable after construction. `bakeBitmapFont` — named in this charter as the cell's *target* role — is missing on the `glyphatlas` side (tracked in that cell's review), not here.

## Contract & docs fit

- Types (`BitmapFont`, `BitmapFontData`, `BitmapFontGlyphData`, `BitmapFontKerningData`, `BitmapFontEncoding`) in `@flighthq/types`; full unabbreviated names; sentinels not throws; single barrel; `sideEffects: false`. `crate: flighthq-bitmapfont` declared, no crate yet (repo-wide posture).
- `agents/index.md` Package Map line ("static bitmap-font cell… static implementation of the `GlyphSource` seam… home for SDF/MSDF fonts") matches reality, except "home for SDF/MSDF fonts" is aspirational while encoding is data-free — fair as a target statement.

## Candidate open directions

- Where do distance-field parameters live: fields on `BitmapFont` (range/spread per font), or per-glyph? The formats neighbor already sees `distanceField.range` and drops it — the model should decide before the parser preserves it.
- Missing-glyph policy: is fallback purely the composition chain (Open direction 2), or should `BitmapFont` also model an explicit replacement glyph (`.notdef`) the way real font formats do?
- Should the kerning table widen beyond BMP pairs now (string/split key) or is the documented limitation blessed?
