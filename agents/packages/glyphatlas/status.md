---
package: '@flighthq/glyphatlas'
updated: 2026-07-17
by: builder2
---

# glyphatlas — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-07-17 — builder2 (SDK-blocking issue #8: BitmapText/glyphatlas blank in headless Chromium)

**Outcome: added a deterministic stub rasterizer backend + documented the web-backend font-readiness contract. No rasterizer-logic change (the blank output is a readiness/environment gap, not a bug).**

New API (`packages/glyphatlas/src/glyphRasterizerBackend.ts`):
- `createStubGlyphRasterizerBackend()` — a font- and canvas-independent `GlyphRasterizerBackend`. Every codepoint rasterizes to a solid opaque-white box sized from the requested `fontSize` (width ≈ 0.6·size, height ≈ 0.7·size, advance = width + ≈0.1·size). Install via `setGlyphRasterizerBackend(createStubGlyphRasterizerBackend())`. This is the test/CI sibling of the web backend over the same swappable seam a native host replaces — it gives BitmapText/glyphatlas deterministic **non-blank** output in jsdom/headless with no `FontFace` loaded. It is not a production text renderer (every glyph is the same box, no real outlines).

Tests: colocated backend tests (`glyphRasterizerBackend.test.ts`), a stub→atlas integration test proving a non-blank atlas surface (`glyphAtlasEntry.test.ts`), and an end-to-end glyphatlas→GlyphSource→bitmaptext test asserting non-empty glyph quads (`packages/bitmaptext/src/updateBitmapText.test.ts`; glyphatlas added as a bitmaptext **devDependency** + tsconfig reference — test-only, no published-graph or bundle impact).

### Web-backend font-readiness contract (authoring requirement)

`GlyphRasterizerBackend.rasterize` is **synchronous** (`GlyphSource.rasterize` seam), so font readiness cannot be awaited inside the seam. The web backend (`createWebGlyphRasterizerBackend`) sets `context.font` and immediately `fillText`s. In headless Chromium the glyph renders **blank** if the web font has not finished loading when `getGlyphAtlasEntry`/`updateBitmapText` runs (in jsdom there is no canvas at all, so it sentinels to `null`).

Therefore, when using the **web** backend, the caller/harness must, before the first `getGlyphAtlasEntry`/`updateBitmapText`:
1. Register the `FontFace` (e.g. `document.fonts.add(...)`), and
2. `await whenFontsReady()` (from `@flighthq/font`, which awaits `document.fonts.ready`) — or `isFontLoaded(family)` to check a specific face.

glyphatlas deliberately does **not** import `@flighthq/font` or make `rasterize` async — that would be a larger seam change (surfaced, not taken). Readiness is the caller's responsibility on web; headless tests should install `createStubGlyphRasterizerBackend` instead of depending on font loading. (`basic-generate-fnt` and similar CI paths: prefer the stub.)

**Deferred / surfaced (not acted on):** an async font-readiness seam for the web backend (`rasterize` stays sync by design). Optional: letting the web backend prefer the DOM `<canvas>` over `OffscreenCanvas` when a headless config doesn't share the document's FontFace set with `OffscreenCanvas` — left out as it was not trivially isolatable and the stub covers the CI need.
