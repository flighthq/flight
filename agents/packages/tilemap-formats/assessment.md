---
package: '@flighthq/tilemap-formats'
updated: 2026-07-13
basedOn: ./review.md
---

# tilemap-formats — Assessment

## Recommended

Sweep-safe: within the package (plus additive fields on the package-owned `Tiled*` DTOs in `@flighthq/types`, their sanctioned header home), no breaking change, no open design fork.

1. **Model object `rotation` and `visible`** — additive `TiledObject` fields, parsed in both front-ends (`tiledXmlParse.ts`/`tiledJsonParse.ts`) and emitted by `formatTiledTmx`. Rotated objects are common in real maps and currently silently lose their rotation; this is the single largest fidelity hole. (review.md › Gaps: document fidelity holes)
2. **Model layer `tintColor`, `parallaxX`/`parallaxY`, and `class`** on `TiledLayerBase`, plus image-layer `repeatX`/`repeatY` — additive fields, parse + format, defaults preserving current behavior. (review.md › Gaps)
3. **Model map stagger/hex parameters** (`staggerAxis`, `staggerIndex`, `hexSideLength`) — without them the North star's staggered/hexagonal maps cannot round-trip even as documents. Additive `TiledMap` fields, parse + format. (review.md › Gaps)
4. **Model tileset `tileOffset` and `objectAlignment`** — additive `TiledTileset` fields; `tileOffset` is render-relevant and consumers cannot place tiles correctly without it. (review.md › Gaps)
5. **`formatTiledTmj` + standalone tileset formatters** (`formatTiledTileset` TSX / `formatTiledTilesetJson` TSJ) — completes the chartered "`format*` re-emit" symmetry; the TSX writer already exists internally as `writeTileset` in `tiledTmxFormat.ts` and wants extraction to a public function. Round-trip tests mirror the existing TMX one. (review.md › Gaps: serialization is TMX-only)
6. **Diagnostics layer per the inversion rule** — `enableTilemapFormatsGuards` (via `@flighthq/log`, separately importable, costs non-importers nothing) warning on compressed-layer-without-inflate and failed inflate, implementing the warning half of Decision [2026-07-10] that the code currently drops; plus a shakeable `explain*` query for why a parse returned `null`. (review.md › Charter contradictions, Gaps: no diagnostics layer)

Note for the charter (not self-applied): the Boundaries sentence claiming a `@flighthq/tileset` projection dependency is stale (the resolver seam removed it), and Decision [2026-07-10]'s "dropped-with-warning" wants restating as "preserved-as-zero-grid, with guard warning" to match the (better) built behavior. The Package Map line should mention the faithful-document + projection split.

## Backlog

- **Infinite/chunked map data** (`<chunk>`/`chunks[]` decoding) — parked: charter Open direction 4; needs a ruling on how chunks land in the DTO (stitched into one grid vs. preserved as chunks for faithful re-emit — a fidelity-vs-convenience fork).
- **Wang sets / terrain metadata** — parked: charter Open direction 5.
- **LDtk importer** — parked: charter Open direction 3; likely its own format family within this package, sized as its own work.
- **`buildTiledScene` compose-down convenience** — parked: charter Open direction 1; cross-package (pulls in `@flighthq/displayobject`).
- **Non-tile-layer projections** (`buildCollidersFromTiledObjectGroup`, `buildBitmapFromTiledImageLayer`, `mergeTiledTilesetsToAtlas`) — parked: charter Open direction 2; cross-package (`collision`, `displayobject`, `binpack`+`textureatlas`).
- **Carry flip flags through projection** — parked: requires a per-tile flip slot on `TilemapData` in `@flighthq/sprite` (cross-package, fork-A adjacent); today flips survive only in the document, as `tiledProject.ts` documents.
- **Class-typed custom properties and `propertytype` enums** — parked: changes `TiledProperty.value`'s shared type (review.md › Candidate open direction 4); needs the design call first.
- **Text objects and object `template` references** — parked: text objects are a sizeable modeling addition (font/wrap/align field cluster) and templates need a caller-supplied resolver seam design, both wanting a fidelity-bar ruling (review.md › Candidate open direction 1).
- **Isometric/staggered/hexagonal projection** — parked: charter North star sequences it after orthogonal; depends on how the runtime `Tilemap` addresses non-orthogonal placement.

## Approved

None.
