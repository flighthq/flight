---
package: '@flighthq/glyphatlas'
updated: 2026-08-31
by: builder2
---

# glyphatlas — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Most of what this file used to list has landed. Re-checked against `packages/glyphatlas/src/` on
2026-08-08; three items survive, and one of them is a gotcha rather than a gap.

- **Pair kerning is always 0.** `getGlyphAtlasKerning` returns a flat `0`
  (`glyphAtlasMetrics.ts:6`) because the canvas rasterizer exposes no kerning table, so kerned text
  needs a shaping backend or the static `bitmapfont` path. `lineGap` is 0 for the same reason even
  when metrics are genuinely measured (`glyphRasterizerBackend.ts:63`) — the canvas has no line-gap
  field and a guess would be worse than none.
- **`rasterize` is synchronous by seam design, so font readiness is the caller's problem.** With the
  web backend a glyph rasterizes blank if its `FontFace` has not finished loading: register the face
  and `await whenFontsReady()` (from `@flighthq/font`) before the first `getGlyphAtlasEntry` or
  `updateBitmapText`. Headless and CI paths should install `createStubGlyphRasterizerBackend`
  (`glyphRasterizerBackend.ts:14`) instead of depending on font loading at all. An async readiness
  seam would be a `GlyphSource`-wide change and is deliberately not taken.
- **The cache is keyed by codepoint alone** (`glyphAtlas.ts:36`), so one atlas holds exactly one
  rendering of each character. Bold or italic is a separate atlas, not a draw-time flag: one atlas
  per (family, size, style, weight) the app actually uses. This is the model, not a defect — it is
  recorded here because callers keep rediscovering it.

- **A repack is a contract event, not just a cost.** `_repackGlyphAtlas` relocates survivors, drops
  the ones that no longer fit, and hands their space to other glyphs, so every rect the atlas gave out
  before it is suspect. `runtime.layoutVersion` (read via `getGlyphAtlasLayoutVersion`, forwarded by
  `GlyphSource.getGlyphLayoutVersion`) is the only signal of that: the entry objects are mutated in
  place and the atlas bitmap is the same object it always was. Eviction alone does NOT bump it —
  shelf cursors only advance, so an evicted glyph's pixels are untouched, and therefore still correct
  to draw, until a repack reclaims them. The dirty region answers a different question: which pixels
  to re-upload, not whether the rects still mean what they did.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-31** — `layoutVersion` added to the runtime and bumped by `_repackGlyphAtlas`
  (`glyphAtlasEntry.ts`) and `disposeGlyphAtlas` (`glyphAtlas.ts`), exposed as
  `getGlyphAtlasLayoutVersion` and through the new `GlyphSource.getGlyphLayoutVersion` seam member.
  Fixes stale baked regions in `@flighthq/bitmaptext`, which now stamps and compares it. The guard
  gained a `repack` reason, reported once repacks pass a settling threshold, because a thrashing atlas
  is not only slow — it invalidates every consumer's baked rects on every repack.

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Four of the five open items checked out
  **false**. The most significant: "real canvas line metrics replacing the documented placeholder"
  landed as `GlyphRasterizerBackend.measureMetrics` (`glyphRasterizerBackend.ts:48`), which reads
  `fontBoundingBoxAscent/Descent` and returns `null` only when the platform omits them, leaving
  `deriveGlyphMetricsFromFontSize` as a fallback rather than the source of truth. Also gone: the
  byte/area budget (`maxArea`/`maxBytes`/`maxGlyphs` at `glyphAtlas.ts:38-40`, enforced at
  `glyphAtlasEntry.ts:217`), guards plus `explain*` (`enableGlyphAtlasGuards.ts`,
  `explainGlyphAtlasEntry.ts`), and `bakeBitmapFont`, which shipped under a different name as
  `createBitmapFontFromGlyphAtlas` (`packages/bitmapfont/src/bitmapFontFromGlyphAtlas.ts:23`) in the
  sibling static cell.
- **2026-08-01** — `GlyphAtlasOptions.rasterizerBackend` binds a backend per atlas, with the global
  backend as the omission default, so two embedded fonts feed independent atlases.
- **2026-07-30** — `fontStyle`/`fontWeight` threaded onto `GlyphAtlasOptions`; before this the
  rasterizer's bold/italic support was live code no caller could reach.
- **2026-07-30** — LRU recency moved from an `indexOf`+`splice` array to an insertion-ordered `Map`,
  making the per-hit touch O(1); the `delete` before `set` is the whole mechanism.
- **2026-07-17** — `createStubGlyphRasterizerBackend` added as the deterministic CI sibling of the
  web backend, and the web-backend font-readiness contract written down.
