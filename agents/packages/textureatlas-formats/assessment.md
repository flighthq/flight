---
package: '@flighthq/textureatlas-formats'
updated: 2026-07-03
basedOn: ./review.md
---

# textureatlas-formats — Assessment

Sorted from the 2026-07-03 review (partial 50). The parsing quality is already there; the package is the reading half of a formats library. The charter is a scaffold stub — direction session pending; anything shape-changing is surfaced there, not recommended here.

## Recommended

Sweep-safe: within-package, no open design decision.

1. **Adopt the registry pattern from `spritesheet-formats`.** `registerTextureAtlasFormat(kind, { detect, parse })`, `getTextureAtlasFormat`, `parseTextureAtlas(content, atlas, kind?)`, with `detectTextureAtlasFormat` iterating the registry — restores what `resource-formats` had (fork B: registry by default).
2. **Add serializers** — `serializeTextureAtlas*` for TexturePacker JSON, Starling XML, and libGDX text at minimum, so the package round-trips instead of being read-only.
3. **Surface page/meta data** — expose parsed page image names, sizes, and scale, so multipack has somewhere to land when `TextureAtlas` grows pages.

## Approved

None.

## Backlog

- **Move Cocos plist geometry here** and make `spritesheet-formats` delegate — closes the inverted format and the duplicated schemas/detectors, and backs the already-declared kind constant. _Parked — cross-package (`spritesheet-formats`)._
- **Accept libGDX `split`/`pad`** once the region type can hold them. _Parked — blocked on `textureatlas` nine-slice fields (`@flighthq/types`)._
- **Charter authoring** — the cell was scaffolded 2026-07-03; needs a direction session.
