---
package: '@flighthq/textureatlas-formats'
updated: 2026-07-03
basedOn: ./review.md
---

# textureatlas-formats — Assessment

Sorted from the 2026-07-03 review (partial 50). The parsing quality is already there; the package is the reading half of a formats library. The charter is a scaffold stub — direction session pending; anything shape-changing is surfaced there, not recommended here.

## Closed 2026-07-30

*Adopt the registry pattern from spritesheet-formats* — **done**. `detectTextureAtlasFormat` was a
hardcoded if/else with no dispatcher at all; format selection now runs through a lazily seeded
registry, alongside `parseTextureAtlas` (auto-detecting, with an optional `formatKind` override and a
shared `TextureAtlasParseOptions` bag), `getTextureAtlasFormat`, and `registerTextureAtlasFormat`.

Two things carried over from the spritesheet-formats sweep that this adoption deliberately improves
on, both recorded at the seeding site:

- **Built-ins are seeded in `getRegistry()`, never self-registered on import.** A top-level
  `registerTextureAtlasFormat` per parser would be the import-time side effect the SDK bans under
  `"sideEffects": false`, and would drag every parser into any consumer importing one. This is the
  same trap the spritesheet-formats item was retired for prescribing.
- **The detectors are mutually exclusive, so insertion order is *not* load-bearing here.** Aseprite
  and TexturePacker share the `{frames, meta}` JSON shape; rather than making one a broad net the
  other must precede, each runs the full disambiguation and answers only for itself. A test asserts
  the exclusivity over a corpus directly — the property the sibling registry cannot claim.

**A defect fell out of it**, found because a test fixture was incomplete: both JSON parsers guarded
the `JSON.parse` failure and then dereferenced `entry.frame` / `entry.spriteSourceSize` /
`entry.sourceSize` blind one line later. A document that parsed but was not fully populated — a
truncated download, an older exporter, a hand-edited file — threw a raw `TypeError` out of the
importer, contradicting the never-throw policy the same file's comment states. Frames with no rect
are now skipped and the optional trim fields fall back, so a partial document yields the regions it
can. Verified against the unfixed parsers: 4 tests fail.

## Recommended

1. **Surface page/meta data — but it needs somewhere to go first.** TexturePacker and Aseprite carry a
   `meta` block (`image`, `size`, `scale`, `format`) that no parser reads; today only the detector
   touches it. `TextureAtlas` is `{regions, texture}` and has no field for a page name or page
   dimensions, so surfacing this is a `@flighthq/types` change, not a parser change. **A seam
   decision** — and note it also blocks item 2.
2. **Add serializers — blocked on item 1.** A round-trip serializer cannot emit `meta.image` or
   `meta.size` that the parse had nowhere to store, so writing serializers before the metadata has a
   home would bake in a lossy round trip. Sequence them after the type decision.

## Backlog

- **Move Cocos plist geometry here** and make `spritesheet-formats` delegate — closes the inverted format and the duplicated schemas/detectors, and backs the already-declared kind constant. _Parked — cross-package (`spritesheet-formats`)._
- **Accept libGDX `split`/`pad`** once the region type can hold them. _Parked — blocked on `textureatlas` nine-slice fields (`@flighthq/types`)._
- **Charter authoring** — the cell was scaffolded 2026-07-03; needs a direction session.
