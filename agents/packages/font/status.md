---
package: '@flighthq/font'
updated: 2026-08-08
by: principal
---

# font — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/font/src/` on 2026-08-08. A file:line here is a
claim about this tree, not about a session.

- **The `GlyphOutlineSource` seam is live and now has a real producer.**
  `createGlyphRasterizerBackendFromGlyphOutlineSource` (`glyphOutlineSource.ts:16`) adapts an
  index-keyed vector font into the codepoint-keyed rasterizer `glyphatlas` consumes, with a portable
  4x4 coverage scan over flattened contours and no DOM/canvas dependency. Its counterpart producer is
  `createGlyphOutlineSourceFromOpenTypeFont` in `@flighthq/font-formats`; the type itself lives in
  `@flighthq/types` (`types/src/GlyphOutlineSource.ts:23`).
- **Nothing in the SDK wires that adapter into a `GlyphAtlas`.** Outside its own test, the only caller
  is `packages/swf/src/swfDocument.test.ts:119` — a test. No production path installs it through
  `GlyphAtlasOptions.rasterizerBackend`, so the seam is reachable but unused.
- **Every loader is browser-only.** `_fontFaceLoad.ts` constructs `new FontFace` (`:30`) and mutates
  `document.fonts` (`:26`, `:32`), so `loadFontFrom*` and `loadFontResourceFrom*` cannot run in a
  worker without `FontFace`, in a native host, or headless. The outline path above is the deliberate
  DOM-free alternative; the loaders have no such alternative.
- **`Font` and `FontResource` are near-empty entities.** `createFont` wraps a single `name`
  (`font.ts:4`) and `createFontResource` a single `family` (`fontResource.ts:3`). No metrics, no axes,
  no variation or feature state is carried on either — a consumer wanting them reads the outline
  source instead.
- **Format detection is by magic bytes and URL extension only** (`fontFormat.ts:1`, `:26`), returning
  a plain `string | null`. There is no parse-level validation here; that belongs to `font-formats`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Re-verified against source and converted to the Open + Log contract. One claim
  checked out stale rather than false: the 2026-08-01 entry framed a general TTF/OTF parser as a
  *later* consumer of the seam, and it has since landed as `@flighthq/font-formats`
  (`openTypeGlyphOutlineSource.ts:58`). The 2026-06-25 dependency list is also outdated — the manifest
  now carries `@flighthq/path` alongside `entity` and `types`. No code changed.
- **2026-08-01** — Added the format-neutral, glyph-index-keyed `GlyphOutlineSource` seam and
  `createGlyphRasterizerBackendFromGlyphOutlineSource`, so a vector font can feed `glyphatlas` without
  widening its raster `GlyphSource`.
- **2026-06-25** — Extracted from `@flighthq/resources` (which was eliminated): `font`/`fontFrom` and
  `fontResource`/`fontResourceFrom`, with types staying in `@flighthq/types`.
- **2026-06-25** — Rust crate `flighthq-font` created when `flighthq-resources` was split to mirror
  this refactor; layering preserved as image ← textureatlas ← tileset.
