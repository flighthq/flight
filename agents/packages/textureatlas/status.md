---
package: '@flighthq/textureatlas'
updated: 2026-06-25
by: builder-phase2
---

# textureatlas — Status Log

## 2026-06-25 — extracted from @flighthq/resources (builder Phase 2)

New package `@flighthq/textureatlas`, extracted from `@flighthq/resources`. Holds the texture-atlas and tileset runtime: `textureAtlas` (`createTextureAtlas`, `getTextureAtlasByteSize`), `textureAtlasFrom` (`createTextureAtlasFromCanvas`/`ImageBitmap`/`ImageElement`/`ImageResource`), `textureAtlasRegion` (region add/get/uv/sequence ops), `tileset` (`createTileset`, `createTilesetFromAtlas`/`FromImageResource`, `buildTilesetRegions`), and `tilesetFrom`. The `TextureAtlas`/`TextureAtlasRegion`/`Tileset` **types** remain in `@flighthq/types` (header layer).

**Why tileset moved too:** atlas-only extraction would have created a `resources ↔ textureatlas` dependency cycle — `textureatlas` builds on `imageResource` (resources), and `tileset` (which would have stayed in resources) builds on `textureAtlas`. The clean layering is `imageResource → textureAtlas → tileset`, so tileset belongs here. Flagged for review in `_QUESTIONS.md` (tileset's public import path moved `resources` → `textureatlas`; SDK barrel unaffected).

**Deps:** `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/resources`, `@flighthq/types`. Repointed consumers (test files in `scene2d-canvas`, `spritesheet`); examples/functional use the SDK barrel and needed no change. 84 tests pass; `npm run check` green; 89 packages valid.

**Deferred:** `textureatlas-formats` sibling — content undecided (see `_QUESTIONS.md`); not created.

## Bronze/Silver/Gold (initial)

- **Bronze (here):** atlas + region + tileset runtime cleanly separated, types in the header, no cycle.
- **Silver:** `textureatlas-formats` neighbor (TexturePacker/Starling/plist atlas descriptors), atlas trimming/packing helpers, region rotation/padding metadata.
- **Gold:** runtime atlas packer (bin-packing), multi-page atlases, mipmap-aware region UVs.

## 2026-06-25 — tileset split out; repointed onto @flighthq/image

Following the `resources` elimination, `textureatlas` now depends on `@flighthq/image` (not the deleted `resources`). Per user direction, `tileset`/`tilesetFrom` were moved OUT of `textureatlas` into the new `@flighthq/tileset` package; `textureatlas` now scopes to atlas + region only. Layering: `image → textureatlas → tileset`. 63 tests pass.

## 2026-06-25 — Rust crate mirror (builder Phase 5)

Rust crate `flighthq-textureatlas` created as part of splitting the Rust `flighthq-resources` crate to mirror this TS refactor. Layering preserved (image ← textureatlas ← tileset). cargo build/test/fmt green; clippy `-D warnings` clean for the new crates. The broader Rust port still has a large pre-existing function-level parity gap (68.8% native-core) tracked separately — see `_QUESTIONS.md` Phase 5.

## 2026-08-01 — sequence frame ordering, the ordinal primitive, and the shared-texture contract

Took assessment Recommended items 2 and 3. Item 1 (whether `TextureAtlasRegion.id` should be an
opaque handle) stays open — it is a data-model call entangled with the parked multi-page work, not
something to answer from inside a sweep.

**The sequence was handing back scrambled animations.** `getTextureAtlasRegionSequence` returned
prefix matches in insertion order while its own doc named the `baseName_NNN` convention it serves.
Insertion order is the packer's packing order, and the obvious alternative — name order — sorts
`walk_10` ahead of `walk_2` whenever the packer did not zero-pad. Both free orders can therefore hand
back an animation whose frames play out of sequence, and neither fails loudly: a scrambled animation
still runs. It now orders by the parsed trailing ordinal.

**Extracted `getTextureAtlasRegionOrdinal` rather than inlining the parse.** The review's
"libGDX-style index queries" gap says the ordinal is *unrecoverable as data* because the parser bakes
it into the name. That is the missing primitive underneath both the sort and the canonical
`findRegion(name, index)` lookup, so it became an export, and `getTextureAtlasRegionByOrdinal`
composes over it. Deriving the ordinal from the name is a query over data the atlas already holds —
it deliberately does **not** pre-empt the parked decision about whether the ordinal should become a
stored field on the region. If that field ever lands, this stays the answer for parsers that do not
set one.

**`getTextureAtlasRegionSequence` now takes `out`.** The package already split allocation by verb —
`get*` writes into `out` (`getTextureAtlasRegionFrame`, `getTextureAtlasRegionUvQuad`) and `build*`
allocates and says so (`buildTextureAtlasRegionIndex`). The sequence query was the one `get*` that
allocated, so this is the package's own convention applied to the one place that escaped it, not a
new rule. Contained: the only callers were its own tests.

**Sorted with an in-place insertion sort over a reused key array**, not `Array.sort`. Insertion sort
is stable by construction, so equal ordinals and unnumbered regions keep insertion order without
depending on the host sort being stable — which a C port's `qsort` is not — and it needs neither a
comparator closure nor a scratch allocation. Regions with no ordinal sort *after* the numbered run
(key mapped past every real frame number) so the numbered run stays contiguous from `out[0]`.

**The region-texture cache was correct by accident.** It is keyed by region object, so it cannot
notice a field changing inside one; what actually keeps it right is that every call re-derives the
window from the page and region. That was load-bearing behavior with nothing pinning it — an obvious
"only compute on first mint" optimization would have turned it into a stale UV. Now stated as the
contract in the doc comment and pinned by two tests, including the cost of sharing: the returned
Texture is mutated in place, so a reference held from an earlier call is rewritten by the next call
for the same region rather than being a snapshot.

Six mutations, each failing only the tests that should catch it: dropping the sort (4), mapping
"no ordinal" to -1 (1), losing stability via `>=` (2), accepting an interior digit run (1), deriving
the texture window only on first mint (3), and dropping the prefix test in `byOrdinal` (1).
textureatlas 105 -> 122 tests; all package check gates green.
