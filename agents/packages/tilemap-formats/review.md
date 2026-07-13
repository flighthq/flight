---
package: '@flighthq/tilemap-formats'
status: solid
score: 68
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# tilemap-formats — Review

**Verdict:** solid — 68/100. The chartered core — faithful `TiledMap` document from TMX/TMJ + TSX/TSJ, GID flag decoding, CSV/base64(+inflate seam) layer data, lossless-for-modeled-fields TMX re-emit, and the per-tileset `TilemapData[]` projection — is built, clean, and well-tested. What holds it under solid-high is document fidelity: a real Tiled map's rotation, tint, parallax, stagger/hex parameters, tile offsets, and chunked layers all silently vanish, so "faithful document" is currently true only for a well-behaved subset; and the `format*` side is TMX-only.

No `status.md` exists in the cell; evidence is the live source and tests.

## Present capabilities

- **Both front-ends over one DTO.** `parseTiledTmx`/`parseTiledTileset` (`tiledXmlParse.ts`, over `@flighthq/xml`) and `parseTiledTmj`/`parseTiledTilesetJson` (`tiledJsonParse.ts`) build the same `TiledMap`/`TiledTileset` document; a test asserts TMX≡TMJ equivalence (`tiledXmlParse.test.ts` "parses to a document equivalent to the TMJ form").
- **Faithful document in `@flighthq/types`** (`TiledMap.ts`, `TiledLayer.ts`, `TiledObject.ts`, `TiledProperty.ts`, `TiledTileset.ts`, `TiledGid.ts`): map metadata (orientation, render order, infinite flag, background color), the four-variant `TiledLayer` closed union (`tilelayer`/`objectgroup`/`imagelayer`/`group`, recursive groups), embedded-or-external `TiledTilesetRef` (`source` xor `tileset`), typed `TiledProperty[]` on map/layer/object/tileset/tile, and per-tile tileset metadata (animation frames, collision `objects`, per-tile `image`, class).
- **Raw GIDs, flip bits intact.** Tile layers store `Uint32Array` raw GIDs; `decodeTiledGid` splits the three flip bits + 29-bit id, `getTiledTilesetRefForGid` finds the owning ref by largest `firstGid` (`tiledGid.ts`).
- **Layer-data encodings** (`tiledLayerData.ts`): CSV, base64 little-endian u32 (portable decoder, no `atob`), and XML `<tile gid>` / TMJ array forms inline in the parsers; gzip/zlib/zstd via the caller-supplied `TiledInflate` seam (`tiledOptions.ts`) — no bundled zlib, per the charter. Compressed-without-inflate yields an all-zero grid, layer preserved.
- **Color convention seam** (`tiledColor.ts`): `#RRGGBB`/`#AARRGGBB` ↔ Flight packed RGBA (`0xRRGGBBAA`), round-trip tested.
- **TMX serialization** (`tiledTmxFormat.ts`): `formatTiledTmx` re-emits the document (CSV data, embedded + external tileset refs, objects with point/ellipse/polygon/polyline, per-tile animation/collision, properties); parse→format→parse round-trip tested.
- **Projection** (`tiledProject.ts`): `buildTilemapLayersFromTiled(map, layerIndex, resolveTileset)` splits one tile layer per tileset into single-tileset `TilemapData` via `createTilemapData` — exactly the batching-correct decomposition Decision [2026-07-10] specifies, with partial-resolution tolerance (unresolved refs leave `-1` cells) and `null` only on wholesale failure.
- **Tests**: one colocated file per source file, all exports covered, including inflate-seam failure paths, flip-bit preservation, multi-tileset splitting, and malformed-input sentinels.

## Gaps

Versus the charter's "Complete Tiled coverage" North star and a textbook Tiled codec:

- **Serialization is TMX-only.** No `formatTiledTmj` and no standalone TSX/TSJ tileset formatter (`writeTileset` exists only as an internal of `formatTiledTmx`). The North star says "`format*` re-emit"; today one of four format pairs re-emits.
- **Document fidelity holes** — parsed input silently loses: object `rotation` and `visible`; text objects; object `template` references; layer `tintcolor`, `parallaxx`/`parallaxy`, `class`; image-layer `repeatx`/`repeaty`, `transparentcolor`, image dimensions; map `staggeraxis`/`staggerindex`/`hexsidelength` (so a staggered/hex map — explicitly in the North star — does not round-trip), `class`, parallax origin; tileset `tileoffset` (render-relevant), `objectalignment`, `grid`, `transparentcolor`, `transformations`. A grep for `rotation|template|tintcolor|parallax|staggeraxis|hexsidelength|chunk|wang|tileoffset` across src + the Tiled types finds only a comment.
- **Infinite/chunked maps**: the `infinite` flag is parsed but `<chunk>`/`chunks[]` layer data is not decoded — a chunked layer comes back as an all-zero grid (charter Open direction 4).
- **Wang sets / terrain** not modeled (Open direction 5).
- **Class-typed custom properties** (Tiled 1.8+ nested `class` properties, `propertytype` enums): `asPropertyType` coerces them to `'string'`, flattening structured values.
- **No diagnostics layer**: no `enable*Guards`, no `explain*`, no `@flighthq/log` usage. Every silent sentinel (malformed input → `null`, compressed-without-inflate → zero grid, unresolved tileset → empty tiles) is unexplainable, against the diagnostics inversion rule.
- **Projection limits** (mostly chartered): flip flags are not carried into `TilemapData` (documented in `tiledProject.ts` — `Tilemap.tiles` is `Int16Array` with no flip slot; also caps local ids at 32767); only orthogonal projection ("orthogonal first" per charter); object/image/group projections and `buildTiledScene` are unbuilt Open directions 1–2.
- **LDtk** unbuilt (Open direction 3). The charter is right that it matters — it is the main modern alternative — and it is correctly parked as its own direction.

## Charter contradictions

One, mild: Decision [2026-07-10] says a compressed layer without an `inflate` seam is "dropped-with-warning". The code (better) preserves it as an all-zero grid — but emits **no warning at all**; there is no guard module to carry one. The behavior half of the decision drifted (arguably an improvement worth recording), and the warning half is unimplemented. Everything else — the faithful-document/projection split, the two entry points, per-tileset splitting, caller-driven non-tile layers, no mega-type, sentinel `null` — matches the Decisions precisely.

## Contract & docs fit

- **Types-first** ✓ — all Tiled DTOs live in `@flighthq/types`, each concept its own file, docs on the types themselves. The `TiledLayer` closed union is justified inline (Tiled defines exactly four layer kinds; users do not extend the format) — a legitimate fork-B exception.
- **Sentinels-not-throws** ✓ (`null` on malformed input throughout), **single root export** ✓ (8-line barrel), **`sideEffects: false`** ✓, no DOM, no I/O; resolvers/inflate are caller-supplied seams as chartered.
- **Naming** ✓ — `parseTiledTmx`/`decodeTiledGid` etc. carry the Tiled domain; format acronyms (Tmx/Tmj/Gid) are proper nouns, consistent with `parseSvgPathData`.
- **Candidate revision (charter Boundaries):** the charter says projection depends on `@flighthq/tileset` ("tileset build/resolve"), but the code is more decoupled — `Tileset` arrives only through the caller-supplied `TiledTilesetResolver` type; `@flighthq/tileset` is a devDependency for tests only. The Boundaries sentence overstates the dependency.
- **Candidate revision (Package Map):** "Tiled TMX/TMJ + TSX/TSJ sidecars into Flight's tilemap/tileset data" undersells the shape — it misses the faithful-`TiledMap`-document + projection split and the `formatTiledTmx` export, which are the package's defining design. (The package.json description already says it right.)
- **Missing cell file:** no `status.md` exists; the charter front matter links one.

## Candidate open directions

1. **The fidelity bar for "modeled fields".** The charter promises a faithful, losslessly re-emittable document but never enumerates which of Tiled's long-tail fields are in scope. Is the bar "everything Tiled 1.10 writes" or a curated subset? Rotation/tint/parallax/stagger/tileoffset sit on the wrong side of any reasonable bar today; templates and text objects need an explicit ruling.
2. **`format*` symmetry.** Does "serializes back" mean all four pairs (TMX, TMJ, TSX, TSJ) or TMX as the canonical re-emit? The North star's plural suggests the former; only Decision-level blessing exists for TMX.
3. **Diagnostics shape.** Which convention applies here — `enableTilemapFormatsGuards` warnings for the inflate/resolver sentinels, an `explain*` query over a failed parse, or both — and does the "dropped-with-warning" decision get restated to match the preserved-as-zero behavior?
4. **Class-typed properties.** Modeling nested class property values changes `TiledProperty.value`'s type — a small but shared-type design call.
