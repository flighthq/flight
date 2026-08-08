---
package: '@flighthq/textureatlas'
updated: 2026-08-08
by: principal
---

# textureatlas — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/textureatlas/src/` and `packages/types/src/` on 2026-08-08. This cell is
in good shape — most of what the old log carried as deferred has landed. What remains:

- **An atlas is one page.** `TextureAtlas.texture` is a single `Texture2D | null`
  (`packages/types/src/TextureAtlas.ts:6`) with no `pages` array and no per-region page index
  (`packages/types/src/TextureAtlasRegion.ts`), so every multi-page atlas format collapses to page 0.
  The parked `TextureAtlasRegion.id`-as-opaque-handle question is entangled with this and stays open.
- **`createTextureAtlasFromImageResource` names a type that no longer exists**
  (`textureAtlasFrom.ts:33`) — its parameter is an `Image`, `ImageResource` having been split into
  `Image` + `ExternalTexture`. The four `loadTextureAtlasFrom*` functions (`:37-63`) all route through
  it, so the name is load-bearing in the wrong direction.
- **A region's ordinal is derived, never stored.** `getTextureAtlasRegionOrdinal`
  (`textureAtlasRegion.ts:227`) parses the trailing digits of the region name each call, and the
  sequence sort (`:258`) and `getTextureAtlasRegionByOrdinal` (`:177`) both compose over it. Correct
  for parsers that set no index; a stored field is still the undecided alternative.
- **The region-texture cache hands out a shared, in-place-mutated `Texture2D`**
  (`textureAtlasRegion.ts:304-325`). A reference kept from an earlier call is rewritten by the next
  call for the same region, including one made by unrelated code. Documented at `:290-303` and pinned
  by tests, but nothing in the type stops a caller from holding one.
- **No packing.** Regions are added by the caller or sliced from a uniform grid
  (`createTextureAtlasFromGrid`, `textureAtlasGrid.ts:9`); nothing here packs rectangles. That is
  `binpack`'s cell, and the two are not wired together.
- **Regions carry trim, pivot, and rotation but no padding/extrude** (`TextureAtlasRegion.ts:4-16`),
  so bleed-margin metadata from packers has nowhere to land.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The most significant false claim was the
  deferred `textureatlas-formats` sibling ("content undecided; not created") — the package exists and
  carries libGDX, TexturePacker, Starling, and Aseprite parsers plus a detector
  (`packages/textureatlas-formats/src/`). Also dropped: the `@flighthq/resources` dependency (the
  package's deps are `entity`, `geometry`, `image`, `log`, `texture`, `types`), the
  `flighthq-textureatlas` Rust mirror (no `crates/` directory in this repo), and the move of tileset
  into `@flighthq/tileset` (no such package; tile grids live in `tilemap`).
- **2026-08-01** — Region sequences order by parsed trailing ordinal, with
  `getTextureAtlasRegionOrdinal` extracted as the primitive underneath the sort and the by-ordinal
  lookup; `getTextureAtlasRegionSequence` took an `out` param; the shared-texture recompute contract
  was stated and pinned.
- **2026-06-25** — Tileset moved out; the package repointed onto `@flighthq/image` after `resources`
  was eliminated, scoping this cell to atlas + regions.
- **2026-06-25** — Package extracted from `@flighthq/resources`, with the types staying in
  `@flighthq/types`.
