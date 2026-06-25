---
package: '@flighthq/textureatlas'
updated: 2026-06-25
by: builder-phase2
---

# textureatlas — Status Log

## 2026-06-25 — extracted from @flighthq/resources (builder Phase 2)

New package `@flighthq/textureatlas`, extracted from `@flighthq/resources`. Holds the texture-atlas and tileset runtime: `textureAtlas` (`createTextureAtlas`, `getTextureAtlasByteSize`), `textureAtlasFrom` (`createTextureAtlasFromCanvas`/`ImageBitmap`/`ImageElement`/`ImageResource`), `textureAtlasRegion` (region add/get/uv/sequence ops), `tileset` (`createTileset`, `createTilesetFromAtlas`/`FromImageResource`, `buildTilesetRegions`), and `tilesetFrom`. The `TextureAtlas`/`TextureAtlasRegion`/`Tileset` **types** remain in `@flighthq/types` (header layer).

**Why tileset moved too:** atlas-only extraction would have created a `resources ↔ textureatlas` dependency cycle — `textureatlas` builds on `imageResource` (resources), and `tileset` (which would have stayed in resources) builds on `textureAtlas`. The clean layering is `imageResource → textureAtlas → tileset`, so tileset belongs here. Flagged for review in `_QUESTIONS.md` (tileset's public import path moved `resources` → `textureatlas`; SDK barrel unaffected).

**Deps:** `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/resources`, `@flighthq/types`. Repointed consumers (test files in `displayobject-canvas`, `spritesheet`); examples/functional use the SDK barrel and needed no change. 84 tests pass; `npm run check` green; 89 packages valid.

**Deferred:** `textureatlas-formats` sibling — content undecided (see `_QUESTIONS.md`); not created.

## Bronze/Silver/Gold (initial)

- **Bronze (here):** atlas + region + tileset runtime cleanly separated, types in the header, no cycle.
- **Silver:** `textureatlas-formats` neighbor (TexturePacker/Starling/plist atlas descriptors), atlas trimming/packing helpers, region rotation/padding metadata.
- **Gold:** runtime atlas packer (bin-packing), multi-page atlases, mipmap-aware region UVs.

## 2026-06-25 — tileset split out; repointed onto @flighthq/image

Following the `resources` elimination, `textureatlas` now depends on `@flighthq/image` (not the deleted `resources`). Per user direction, `tileset`/`tilesetFrom` were moved OUT of `textureatlas` into the new `@flighthq/tileset` package; `textureatlas` now scopes to atlas + region only. Layering: `image → textureatlas → tileset`. 63 tests pass.

## 2026-06-25 — Rust crate mirror (builder Phase 5)

Rust crate `flighthq-textureatlas` created as part of splitting the Rust `flighthq-resources` crate to mirror this TS refactor. Layering preserved (image ← textureatlas ← tileset). cargo build/test/fmt green; clippy `-D warnings` clean for the new crates. The broader Rust port still has a large pre-existing function-level parity gap (68.8% native-core) tracked separately — see `_QUESTIONS.md` Phase 5.
