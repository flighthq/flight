---
package: '@flighthq/bitmapfont'
crate: flighthq-bitmapfont
draft: true
lastDirection: null
review: null
assessment: null
status: ./status.md
---

# bitmapfont — Charter (DRAFT — UNBLESSED)

> **This charter is a first-pass DRAFT authored by a builder, not blessed direction.**
> It records what was built and — more importantly — the design **forks** left open for the
> user to decide in a direction session. Do not treat "proposed" sections as settled. `Decisions`
> is intentionally empty until the user rules on the Open directions.

## What it is

`@flighthq/bitmapfont` is the **bitmap-font resource layer**: a `BitmapFont` is a
`@flighthq/textureatlas` of glyph pixel rectangles composed with per-glyph placement metrics
(`xoffset`/`yoffset`/`xadvance`), kerning pairs, and line metrics (`lineHeight`/`base`). It is the
raster-glyph counterpart to `@flighthq/font` (which manages vector/system `FontResource`s): where a
`FontResource` names an outline font the platform rasterizes, a `BitmapFont` carries its own baked
glyph pixels in an atlas and the metrics needed to lay them out.

It composes existing primitives rather than reinventing them:

- **Atlas** — glyph pixel rectangles are `TextureAtlasRegion`s in a `TextureAtlas`, keyed by code
  point. `@flighthq/bitmapfont` does not own pixel packing or region storage; it borrows the atlas.
- **Layout** — the intended path reuses `@flighthq/textlayout` through the `@flighthq/textshaper`
  swappable `TextShaperBackend` seam: a bitmap-font backend reports advances (and kerning, via the
  per-adjacent-pair `measureText` contract) from the `.fnt` metrics, so the existing layout engine
  runs unchanged. (See Open direction 2 — whether this seam is the primary path or a standalone
  bitmap-text layout is a fork.)

A sibling package, `@flighthq/bitmapfont-formats`, parses authoring formats (AngelCode BMFont text
`.fnt` first) into a `BitmapFont`, mirroring `@flighthq/spritesheet-formats` /
`@flighthq/textureatlas-formats`.

## Proposed North star

1. **Composition, not reinvention.** A `BitmapFont` is `atlas + glyph metrics + kerning + line
   metrics`. Pixel storage stays in `@flighthq/textureatlas`; layout stays in
   `@flighthq/textlayout`. This package is the thin connective tissue plus the resource lifecycle.
2. **Format-agnostic core; parsers are neighbors.** `@flighthq/bitmapfont` knows nothing about
   `.fnt`/XML/Starling syntax. It exposes `createBitmapFont` + builder + query/measure functions;
   `@flighthq/bitmapfont-formats` owns every wire format and depends on this package (the
   `spritesheet` ↔ `spritesheet-formats` direction).
3. **Plain data, explicit lookups.** Glyphs and kernings are flat arrays on the entity (grepable,
   C/C++-portable, serializable). Lookups are explicit free functions. A runtime Map index for
   O(1) glyph/kerning lookup is a deepening item, not a day-one requirement (mirrors
   `@flighthq/textureatlas`'s linear region scans).

## Proposed Boundaries

**In scope (proposed):**

- `BitmapFont` entity lifecycle: `createBitmapFont`, builder helpers (`addBitmapFontGlyph`,
  `addBitmapFontKerning`).
- Queries: `getBitmapFontGlyph` (by code point), `getBitmapFontKerning` (by adjacent pair),
  `getBitmapFontGlyphRegion` (the glyph's atlas rectangle).
- Native-size measurement: `measureBitmapFontText` (advance sum + kerning) — the building block a
  `TextShaperBackend` adapter would scale.

**Proposed non-goals:**

- Wire-format parsing (`.fnt`/XML/Starling) — `@flighthq/bitmapfont-formats`.
- Pixel packing / atlas region storage — `@flighthq/textureatlas`.
- Line breaking, alignment, wrapping — `@flighthq/textlayout`.
- Signed-distance-field (SDF/MSDF) fonts — a distinct rendering technique (shader-side); likely a
  neighbor (`@flighthq/bitmapfont-sdf`?) rather than in-scope here. **Fork — see Open direction 4.**
- A display object / renderer that draws bitmap text on screen — belongs with the displayobject or
  sprite render family, consuming this package. **Fork — see Open direction 5.**

## Decisions

_(empty — awaiting the user's direction session. The Open directions below are unresolved forks,
not decisions.)_

## Open directions (REAL FORKS — do not guess; surface to the user)

1. **First/primary authoring format: BMFont text vs BMFont XML vs Starling.** This session
   implements the **AngelCode BMFont text `.fnt`** format first (the most common, simplest to parse,
   no XML dependency). BMFont also ships an **XML** variant (same data, `<font><char .../></font>` —
   would pull in `@flighthq/xml` like the Starling/Packer parsers) and a **binary** variant. Starling
   uses its own XML `<font>` bitmap-font dialect. **Which is the canonical/primary format, and which
   others must ship?** Not decided — BMFont text was chosen as the pragmatic first parser, not as the
   blessed primary.

2. **Layout route: `TextShaperBackend` seam vs standalone bitmap-text layout.** The intended design
   routes bitmap-font layout through `@flighthq/textshaper`'s `TextShaperBackend` (a backend whose
   `measureText` returns advances from `.fnt` metrics, so `@flighthq/textlayout` runs unchanged).
   This is clean **but** raises the seam question below (5) — `TextFormat`→bitmap-font resolution and
   size scaling. The alternative is a small standalone bitmap-text layout that walks glyphs directly.
   This session builds the format-independent `measureBitmapFontText` primitive but does **not** wire
   the `TextShaperBackend` adapter, precisely because it forces the scaling/format-resolution
   decision. **Which route, and if the seam — how does a `TextFormat` name a `BitmapFont` and how is
   `format.size` reconciled with the font's authored `size`?**

3. **Package boundaries: `bitmapfont` vs `bitmapfont-formats`.** This session splits core (entity +
   queries + measure) from format parsers (BMFont text), mirroring `spritesheet`/`spritesheet-formats`.
   Confirm this is the intended cut — vs a single package, or a further split (e.g. a shared
   `bitmapfont-text` layout neighbor).

4. **SDF/MSDF fonts.** Signed-distance-field bitmap fonts are a major, industry-standard capability
   (crisp scaling). They share the atlas+metrics shape but need shader-side rendering and a different
   distance-field channel encoding. In-scope here, a neighbor package, or out of scope? Not decided.

5. **Render/display path.** Nothing in this session draws bitmap text to a screen. A `BitmapText`
   display object (or a sprite-batch consumer) that lays out via textlayout and blits atlas regions
   is the obvious next layer, but it crosses into the displayobject/sprite render family and needs
   its own charter discussion. Flagged, not built.

## Status of this session's work

Built (foundation, tested, committed):

- `@flighthq/types`: `BitmapFont` (resource entity: `atlas`, `glyphs`, `kernings`, `lineHeight`,
  `base`, `size`, `face`), `BitmapGlyph` (per-glyph metrics keyed by code point).
- `@flighthq/bitmapfont`: `createBitmapFont`, `addBitmapFontGlyph`, `addBitmapFontKerning`,
  `getBitmapFontGlyph`, `getBitmapFontKerning`, `getBitmapFontGlyphRegion`, `measureBitmapFontText`.
- `@flighthq/bitmapfont-formats`: `parseBitmapFontText` (BMFont text `.fnt` → `BitmapFont`) plus the
  raw-document parse (`parseBitmapFontTextDocument`) and its schema.

Deliberately NOT built this session (needs a decision above): the `TextShaperBackend` adapter (fork
2/5), any XML/Starling parser (fork 1), SDF support (fork 4), and any render/display object (fork 5).
