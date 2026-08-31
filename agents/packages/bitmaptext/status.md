---
package: "@flighthq/bitmaptext"
updated: 2026-08-31
by: builder2
---

# bitmaptext — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## Open

- **A dynamic glyph source needs `refreshBitmapTextGlyphLayout` per frame.** `updateBitmapText` bakes
  each page's `TextureAtlas` regions from the glyph rects as they stand at that moment. A
  `@flighthq/glyphatlas` source repacks when it fills, which relocates those rects and re-uses the
  space of the glyphs it drops — so a node laid out before a repack samples other glyphs afterwards.
  The rects stay well-formed, the entry objects and the atlas image are the same objects they were,
  and nothing throws: the only witness is the atlas pixels. `isBitmapTextGlyphLayoutStale` compares
  the stamped `GlyphSource.getGlyphLayoutVersion` and `refreshBitmapTextGlyphLayout` re-lays-out when
  it moved. A node bound to a static `@flighthq/bitmapfont` source never re-lays-out.

- **What the headless coverage for that does and does not prove.** Proven in
  `updateBitmapText.test.ts`, against a rasterizer whose red channel IS the codepoint — an oracle
  independent of the code under test: a repack leaves a baked region covering the wrong glyph's
  pixels; `isBitmapTextGlyphLayoutStale` reports it; `refreshBitmapTextGlyphLayout` restores it; and
  every node sharing the atlas is repaired, not only the one that forced the repack. Not proven, and
  not provable by any capture this repo can run:
  - **That a backend samples the rect it is handed.** These tests read CPU-side
    `TextureAtlas.regions` values and CPU atlas-bitmap pixels. Nothing uploads the atlas or reads a
    rendered frame back, so a renderer that ignored `regions`, or that drew from a texture uploaded
    before the repack, would pass all of it. The four BitmapText renderers are covered for submission,
    not for region fidelity.
  - **That a screenshot could witness this at all.** The `bitmapfont-generate` capture path installs
    `createStubGlyphRasterizerBackend`, which returns the same block of pixels for every codepoint,
    because headless Chromium cannot share document fonts with the OffscreenCanvas rasterizer. Every
    glyph is therefore identical on screen, and a stale region is pixel-for-pixel indistinguishable
    from a correct one. The screenshot cannot show the defect and cannot show the fix — in either
    direction. Believing otherwise is the trap this note exists to close.
  - **Real-font glyph size variation.** Uniform stub glyphs mean the shelf packer never fragments, so
    the repack path that DROPS a survivor it can no longer place is reached only through a seam stub
    (`createMidLayoutRelocatingGlyphSource`), never through a real atlas. That drop is what the
    layout retry inside `updateBitmapText` exists for, and what `enableBitmapTextGuards` reports when
    it runs out of passes.
