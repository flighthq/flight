---
package: '@flighthq/glyphatlas'
updated: 2026-07-30
by: builder2
---

## 2026-07-30 -- bold and italic atlases were unreachable (builder)

Item 6 read like a cosmetic threading job and was not. `GlyphRasterizeOptions` already carried `fontStyle`/`fontWeight`, and the web rasterizer already used both to build its `context.font` string -- but `GlyphAtlasOptions` had no such fields, and `createGlyphAtlas` is the only thing that constructs a `GlyphRasterizeOptions`. So the rasterizer's support was live code no caller could reach: there was no way to ask for a bold or italic atlas at all.

Both are now optional on `GlyphAtlasOptions` and forwarded only when supplied, so an omitted field stays absent rather than becoming an explicit `undefined` the rasterizer would have defaulted anyway -- that keeps "unset" distinguishable from "deliberately normal" for a future backend. Tests assert on what the backend actually receives rather than on the options object, since the options object was never the thing that was broken.

Documented the model on the type while there: the cache is keyed by codepoint alone, so one atlas holds one rendering of each character and bold text needs its own atlas rather than a draw-time flag -- one atlas per (family, size, style, weight) the app actually uses.

31 -> 33 tests. Two mutations, each confirmed applied and failing only its own test: dropping the forwarding fails the forwarding test, and forwarding unconditionally fails the absent-when-omitted test.

## 2026-07-30 -- O(1) LRU recency; the rest of the cell is genuinely open (builder)

Unlike most cells swept this session, this one is real work rather than stale bookkeeping: items 1, 2, 3, 5 and 6 are all still unbuilt in live source. I took item 4 and left the rest, rather than starting several and landing none.

`GlyphAtlasRuntime.lru` was a `number[]` maintained with `indexOf` + `splice`. Every cache *hit* paid that scan -- `getGlyphAtlasEntry` touches recency on the hit path, so the cost was per glyph per frame during text rendering and grew with the cache. It is now an insertion-ordered `Map<number, true>`: touch is delete-then-set, eviction reads the first key, and the repack drop path deletes directly. The value is unused; only key order matters.

Checked before changing anything, and recorded as a negative: **the `lru`/`entries` pair was not desynced.** Every mutation site keeps them in step -- hit touches, insert sets, evict deletes both, the repack drop path removes from both, and reset clears both -- and `lru` has no consumer outside the package. A parallel index next to a map is the usual place a desync hides, so it was worth confirming rather than assuming.

The subtlety worth pinning is that `Map.set` on an *existing* key does **not** move it to the end, so the `delete` before it is the entire mechanism -- drop it and recency silently degenerates to insertion order, evicting the wrong glyph while every existing test still passes on the happy path. Two tests now cover it: strict oldest-first eviction across three live entries with interleaved touches, and a re-rasterized glyph landing at the most-recently-used end rather than inheriting its old position. Mutations confirm both: removing the delete fails two tests, and evicting from the newest end instead of the oldest fails three.

29 -> 31 tests. Still open in this cell: `bakeBitmapFont` (1), the byte/area budget (2), real canvas line metrics replacing the documented placeholder (3), guards + `explain*` (5), and threading style/weight into the atlas config (6).

# glyphatlas — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-07-17 — builder2 (SDK-blocking issue #8: BitmapText/glyphatlas blank in headless Chromium)

**Outcome: added a deterministic stub rasterizer backend + documented the web-backend font-readiness contract. No rasterizer-logic change (the blank output is a readiness/environment gap, not a bug).**

New API (`packages/glyphatlas/src/glyphRasterizerBackend.ts`):
- `createStubGlyphRasterizerBackend()` — a font- and canvas-independent `GlyphRasterizerBackend`. Every codepoint rasterizes to a solid opaque-white box sized from the requested `fontSize` (width ≈ 0.6·size, height ≈ 0.7·size, advance = width + ≈0.1·size). Install via `setGlyphRasterizerBackend(createStubGlyphRasterizerBackend())`. This is the test/CI sibling of the web backend over the same swappable seam a native host replaces — it gives BitmapText/glyphatlas deterministic **non-blank** output in jsdom/headless with no `FontFace` loaded. It is not a production text renderer (every glyph is the same box, no real outlines).

Tests: colocated backend tests (`glyphRasterizerBackend.test.ts`), a stub→atlas integration test proving a non-blank atlas bitmap (`glyphAtlasEntry.test.ts`), and an end-to-end glyphatlas→GlyphSource→bitmaptext test asserting non-empty glyph quads (`packages/bitmaptext/src/updateBitmapText.test.ts`; glyphatlas added as a bitmaptext **devDependency** + tsconfig reference — test-only, no published-graph or bundle impact).

### Web-backend font-readiness contract (authoring requirement)

`GlyphRasterizerBackend.rasterize` is **synchronous** (`GlyphSource.rasterize` seam), so font readiness cannot be awaited inside the seam. The web backend (`createWebGlyphRasterizerBackend`) sets `context.font` and immediately `fillText`s. In headless Chromium the glyph renders **blank** if the web font has not finished loading when `getGlyphAtlasEntry`/`updateBitmapText` runs (in jsdom there is no canvas at all, so it sentinels to `null`).

Therefore, when using the **web** backend, the caller/harness must, before the first `getGlyphAtlasEntry`/`updateBitmapText`:
1. Register the `FontFace` (e.g. `document.fonts.add(...)`), and
2. `await whenFontsReady()` (from `@flighthq/font`, which awaits `document.fonts.ready`) — or `isFontLoaded(family)` to check a specific face.

glyphatlas deliberately does **not** import `@flighthq/font` or make `rasterize` async — that would be a larger seam change (surfaced, not taken). Readiness is the caller's responsibility on web; headless tests should install `createStubGlyphRasterizerBackend` instead of depending on font loading. (`basic-generate-fnt` and similar CI paths: prefer the stub.)

**Deferred / surfaced (not acted on):** an async font-readiness seam for the web backend (`rasterize` stays sync by design). Optional: letting the web backend prefer the DOM `<canvas>` over `OffscreenCanvas` when a headless config doesn't share the document's FontFace set with `OffscreenCanvas` — left out as it was not trivially isolatable and the stub covers the CI need.
