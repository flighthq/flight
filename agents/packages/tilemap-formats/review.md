---
package: '@flighthq/tilemap-formats'
status: solid
score: 72
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# tilemap-formats — Review

**Verdict:** solid — 72/100. The chartered core is built, clean, and well-tested: faithful `TiledMap` document from TMX/TMJ + TSX/TSJ, GID flag decoding, CSV/base64(+inflate seam) layer data, lossless-for-modeled-fields TMX re-emit, per-tileset `TilemapData[]` projection, and (new since the prior review) structured import diagnostics on the projection path. The score rises from the prior 68 on the strength of the `@flighthq/importdiagnostics` integration, proper type migration to `@flighthq/types`, and contract-lane conformance. What holds it under solid-high: document fidelity still silently drops rotation, tint, parallax, stagger/hex fields, and tileOffset; `format*` serialization remains TMX-only; and parse-path diagnostics (inflate failures, malformed input sentinels) are still absent.

The `status.md` cell exists but contains no entries.

## Present capabilities

- **Both front-ends over one DTO.** `parseTiledTmx`/`parseTiledTileset` (`tiledXmlParse.ts`, via `@flighthq/xml`) and `parseTiledTmj`/`parseTiledTilesetJson` (`tiledJsonParse.ts`) build the same `TiledMap`/`TiledTileset` document. A cross-format equivalence test asserts TMX and TMJ parse to identical documents (`tiledXmlParse.test.ts`, "parses to a document equivalent to the TMJ form").
- **Faithful document in `@flighthq/types`** (`TiledMap.ts`, `TiledLayer.ts`, `TiledObject.ts`, `TiledProperty.ts`, `TiledTileset.ts`, `TiledGid.ts`): map metadata (orientation, render order, infinite flag, background color), the four-variant `TiledLayer` closed union (`tilelayer`/`objectgroup`/`imagelayer`/`group` with recursive groups), embedded-or-external `TiledTilesetRef` (`source` xor `tileset`), typed `TiledProperty[]` on map/layer/object/tileset/tile, and per-tile tileset metadata (animation frames, collision `objects`, per-tile `image`, class/type).
- **Raw GIDs, flip bits intact.** Tile layers store `Uint32Array` raw GIDs; `decodeTiledGid` (`tiledGid.ts`) splits the three flip bits + 29-bit tile id; `getTiledTilesetRefForGid` finds the owning ref by largest `firstGid` not exceeding the tile id.
- **Layer-data encodings** (`tiledLayerData.ts`): CSV and base64 little-endian u32 (portable decoder, no `atob`), plus the XML `<tile gid>` element form and TMJ array form inline in each parser. Gzip/zlib/zstd decoded through the caller-supplied `TiledInflate` seam — no bundled zlib. Compressed-without-inflate yields an all-zero grid (layer preserved in document, not dropped).
- **Color convention seam** (`tiledColor.ts`): `parseTiledColor` / `formatTiledColor` convert Tiled `#RRGGBB`/`#AARRGGBB` to/from Flight packed RGBA (`0xRRGGBBAA`); round-trip tested.
- **TMX serialization** (`tiledTmxFormat.ts`): `formatTiledTmx` re-emits the `TiledMap` document as TMX XML (CSV data encoding, embedded + external tileset refs, objects with point/ellipse/polygon/polyline, per-tile animation/collision, properties). Parse-format-parse round-trip tested against a rich fixture.
- **Projection with diagnostics** (`tiledProject.ts`): `buildTilemapLayersFromTiled(map, layerIndex, resolveTileset, diagnostics?)` projects one tile layer, splitting by tileset into single-tileset `TilemapData[]` via `createTilemapData`. New since the prior review: the function integrates `@flighthq/importdiagnostics` — reporting `tiled.tileset-unresolved` (with cell count, tileset count) when a referenced tileset does not resolve, and `tiled.tile-outside-every-tileset` when a GID falls below every declared firstGid range. Both report once per layer (batched count) rather than per cell, with `ImportDiagnosticSeverity.Drop`. Tests cover the silent-success path (no diagnostic on a well-formed layer), the single-report path, and the cell-count accuracy.
- **Contract-lane conformance**: `index.ts` is the public barrel (12 exports), `contract.ts` re-exports the full surface; both present, two-lane shape matching the codebase standard.
- **`sideEffects: false`**, no DOM, no I/O; resolvers/inflate are caller-supplied seams.
- **Tests**: 7 colocated test files, 50 tests, all passing. Coverage includes inflate-seam failure paths, flip-bit preservation, multi-tileset splitting, malformed-input sentinels, diagnostic assertion, group-layer recursion, and TMX-TMJ equivalence.

## Gaps

Versus the charter's "Complete Tiled coverage" North star and a textbook Tiled codec:

- **Serialization is TMX-only.** No `formatTiledTmj` and no standalone tileset formatters (`formatTiledTileset` TSX, `formatTiledTilesetJson` TSJ). The internal `writeTileset` in `tiledTmxFormat.ts` is the kernel of a TSX formatter but is not exposed. Three of the four format pairs lack re-emit.
- **Document fidelity holes** — parsed input silently drops: `TiledObject.rotation` and `TiledObject.visible`; text objects; object `template` references; `TiledLayerBase.tintColor`, `parallaxX`/`parallaxY`, `class`; image-layer `repeatX`/`repeatY`, `transparentColor`, image dimensions; `TiledMap.staggerAxis`/`staggerIndex`/`hexSideLength` (so staggered/hex maps, in the charter North star, cannot round-trip even as documents), map `class`, parallax origin; `TiledTileset.tileOffset` (render-relevant for correct tile placement), `objectAlignment`, `grid`, `transparentColor`, `transformations`.
- **Infinite/chunked maps**: the `infinite` flag is parsed but `<chunk>`/`chunks[]` layer data is not decoded — a chunked layer comes back as an all-zero grid. Charter Open direction 4.
- **Wang sets / terrain metadata** not modeled. Charter Open direction 5.
- **Class-typed custom properties** (Tiled 1.8+ nested `class` properties, `propertytype` enums): `asPropertyType` in both parsers coerces unknown types to `'string'`, flattening structured values.
- **Parse-path diagnostics absent.** The projection path now reports via `@flighthq/importdiagnostics`, but the **parsing** path has no diagnostics: compressed-without-inflate silently zeros the grid with no `@flighthq/log` warning; a parse returning `null` on malformed input has no `explain*` query to describe what failed. No `enableTilemapFormatsGuards` module exists.
- **Projection limits** (mostly chartered): flip flags are not carried into `TilemapData` (documented in `tiledProject.ts` — `Int16Array` with no flip slot; also caps local tile ids at 32,767); only orthogonal projection exists ("orthogonal first" per charter); object/image/group projections and `buildTiledScene` are unbuilt Open directions 1-2.
- **LDtk importer** unbuilt. Charter Open direction 3.

## Charter contradictions

One, mild and unchanged from the prior review: Decision [2026-07-10] says a compressed layer without an `inflate` seam is "dropped-with-warning." The code (better) preserves it as an all-zero grid, but the **parsing path still emits no warning at all** — there is no guard module to carry one. The projection path now has `@flighthq/importdiagnostics` integration, so projection-time diagnostics work, but the inflate-failure diagnostic that Decision [2026-07-10] specifically calls out is still absent. The behavior half of the decision drifted (arguably an improvement worth recording), and the warning half remains unimplemented at the parse seam.

Everything else matches the charter Decisions: the faithful-document/projection split, the two entry points, per-tileset splitting, caller-driven non-tile layers, no mega-type, sentinel `null` on failure.

## Contract & docs fit

- **Types-first**: all Tiled DTOs live in `@flighthq/types`, each concept in its own file, with durable semantic comments. The `TiledLayer` closed union is justified inline (Tiled defines exactly four layer kinds; users do not extend the format) — a legitimate exception to the open-registry default.
- **Sentinels-not-throws**: `null` on malformed input throughout, no exceptions thrown.
- **Two-lane exports**: `index.ts` (public) / `contract.ts` (intra-SDK) both present and correct.
- **`sideEffects: false`**: declared and accurate — no module-level side effects.
- **Naming**: `parseTiledTmx`, `decodeTiledGid`, `buildTilemapLayersFromTiled`, `formatTiledTmx` — full unabbreviated type names, domain-specific without collision. Format acronyms (Tmx/Tmj/Gid) are proper nouns of the Tiled ecosystem, consistent with the SDK's treatment of format names (cf. `parseSvgPathData`).
- **`Readonly<T>` usage**: present on function parameters (`Readonly<TiledMap>`, `Readonly<TiledParseOptions>`, `Readonly<XmlElement>`, `Readonly<TiledTilesetRef>`) consistently.
- **Dependency discipline**: depends on `@flighthq/types`, `@flighthq/xml`, `@flighthq/tilemap` (for `createTilemapData` in projection), and `@flighthq/importdiagnostics` (for projection diagnostics). All explicit, no singletons, no module-scoped mutable state.

Candidate revisions:

- **Charter Boundaries**: the charter says projection depends on `@flighthq/tileset`, but the package depends on `@flighthq/tilemap` (not `tileset`), and the tileset arrives only through the caller-supplied `TiledTilesetResolver` type. The Boundaries sentence overstates the coupling.
- **Charter Decision [2026-07-10] "dropped-with-warning"**: should be restated as "preserved-as-zero-grid, with guard warning" to match the (better) built behavior, and should note that the warning is still pending a guard module.

## Candidate open directions

1. **The fidelity bar for "modeled fields."** The charter promises a faithful, losslessly re-emittable document but does not enumerate which Tiled fields are in scope. Is the bar "everything Tiled 1.10 writes" or a curated subset? Rotation, tint, parallax, stagger parameters, tile offsets, templates, and text objects all need an explicit ruling — they range from render-critical (tileOffset) to niche (text objects).
2. **`format*` symmetry.** Does "serializes back" mean all four pairs (TMX, TMJ, TSX, TSJ) or TMX as the canonical re-emit? The North star's plural and the Decision's use of `format*` suggest the former; only TMX has a blessed implementation.
3. **Diagnostics shape.** The projection path now reports via `@flighthq/importdiagnostics`. Should the parse path get the same treatment (inflate failures, malformed-input sentinels), or should it use `enableTilemapFormatsGuards` / `explain*` per the codebase inversion rule? A ruling settles the convention for this package's sentinel returns.
4. **Class-typed properties.** Modeling nested class property values changes `TiledProperty.value`'s type — a small but shared-type design call that affects `@flighthq/types`.
