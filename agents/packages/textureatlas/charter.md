---
package: '@flighthq/textureatlas'
role: package
crate: flighthq-textureatlas
draft: false
lastDirection: 2026-07-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# textureatlas — Charter

## What it is

`@flighthq/textureatlas` is the **texture atlas entity layer** — creating `TextureAtlas` entities (an `ImageResource` plus an array of `TextureAtlasRegion` entries), loading atlas images from various DOM sources, and querying/manipulating regions by id, name, prefix sequence, and UV computation. 19 exports across 3 source files. Dependencies: `entity`, `geometry`, `image`, `types`.

This package describes the atlas — what image it wraps and where the regions are. It does not produce atlases. Packing, bin-layout, and atlas generation are image/surface/render concerns that belong in a separate package (a future `textureatlas-packer` or similar), not here.

## North star

1. **Atlas description, not atlas production.** This package answers "what regions exist in this image and where are they?" It does not answer "how do I pack sprites into an atlas?" That is a tool/pipeline concern.
2. **Entity lifecycle consistency.** Follow the same patterns as image, font, video, audio: `create*`, `load*FromBytes` (async, honest), query helpers.
3. **Uint8Array for byte inputs.** SDK-wide convention.

## Boundaries

**In scope:**

- TextureAtlas entity creation from various image sources (canvas, element, bitmap, ImageResource, bytes, URL, blob, base64).
- TextureAtlasRegion creation, querying (by id, name, prefix sequence), and UV computation.
- Region metadata: trimming, rotation, pivot, source offset.
- Byte-size reporting.

**Non-goals:**

- Atlas packing / bin-layout / sprite sheet generation — separate package.
- Atlas metadata parsing (TexturePacker, Aseprite, Starling, libgdx, Cocos) — `@flighthq/textureatlas-formats`.
- Tile placement semantics — `@flighthq/tilemap`; this package owns only uniform grid slicing into atlas regions.

## Decisions

- **[2026-07-02] Rename `loadTextureAtlasFromArrayBuffer` → `loadTextureAtlasFromBytes`, accept `Uint8Array`.** Same SDK-wide byte-input convention as image, font.

  **Why:** Consistency across the resource packages. `Uint8Array` matches Rust `&[u8]` and is the standard byte-view type.

- **[2026-07-02] Scope ceiling: atlas entity + region queries.** Texture packing is an image/surface/render concern that _produces_ a TextureAtlas. This package _describes_ an atlas — image + properties. Packing belongs in a future neighbor.

  **Why:** A TextureAtlas is a data description. The process of producing one (bin-packing, layout optimization, multi-page strategies) is a distinct domain with different dependencies and complexity. Mixing them would violate the decomposition principle.

- **[2026-07-02] Remove `@flighthq/xml` re-exports from `textureatlas-formats` barrel.** `parseXmlAttributes`, `parseXmlDocument`, and `XmlElement` are implementation details of the Starling parser, not part of the atlas format API.

  **Why:** Re-exporting internal dependencies couples the barrel to xml internals and adds public surface that users don't need.

- **[2026-07-02] Add `detectTextureAtlasFormat` to `textureatlas-formats`.** Auto-detection dispatcher matching the `detectParticleFormat` pattern in `particles-formats`. Takes raw content (string or bytes) and returns a `TextureAtlasFormatKind` or null.

  **Why:** Users loading atlas metadata from unknown sources need format detection. The kind constants already exist; detection is the missing link.

- **[2026-07-02] Cocos plist parser is backlog for AAA completeness.** `TextureAtlasFormatKindCocosPlist` is declared but unimplemented. This is a gap.

  **Why:** The kind constant exists, promising support that doesn't exist. Either implement it or remove the constant. Implementing is the AAA path.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

- **[2026-07-30] Region ids are allocated past a high-water mark, never from the region count.** `addTextureAtlasRegion` used `id = regions.length`, which is only the right answer while ids happen to be a dense `0..n-1` run — an atlas built from parsed data (format parsers assign their own ids) breaks it immediately. Measured: regions at ids 5 and 2 give a count-derived id of 2, so `getTextureAtlasRegionById(atlas, 2)` returns the older region and the new one is unreachable by id. Scanning for the highest live id is still not enough on its own, because removing the highest-id region walks the next allocation back onto an id that was just retired — the ABA hazard, and precisely the failure `removeTextureAtlasRegion` would otherwise have introduced. The mark lives in a package-private `WeakMap` keyed by atlas (like the existing region-texture cache) so `TextureAtlas` stays plain data, and an atlas the map has not seen is seeded from its highest live id. User-directed.

- **[2026-07-30] `setTextureAtlasRegion` takes a whole source entity, not a positional rect.** It wrote 6 of 14 fields, so reusing a region left `rotated`/`trimmed`/`source*`/`original*`/`name`/`id` describing the *previous* frame while the geometry described the new one — a half-updated region whose trim and rotation metadata belong to something else, which any renderer doing trim math then draws wrong. It also defaulted every argument after `x` to `0` (a caller passing one argument silently got a 0×0 region) and coerced an unset pivot to `0` where the constructor leaves it `null`, so "no pivot" did not round-trip. **This deviates from the assessment's prescription**, which asked for a tightened positional list: a positional setter over fourteen fields fixes today's stale fields while leaving the next added field free to be forgotten, whereas a whole-entity setter has nowhere for a stale field to hide and is called exactly like `createTextureAtlasRegion`. Contained — the package had no external callers of either the old signature or the renamed `addTextureAtlasRegionCorners`. User-directed.

- **[2026-07-30] Trim placement and rotated UV corners are the package's arithmetic, not each renderer's.** `getTextureAtlasRegionFrame` reports where the packed rect sits inside the authored frame (falling back to the packed extent when untrimmed, so callers need no special case), and `getTextureAtlasRegionUvQuad` writes the four drawn corners with the 90° packer rotation already applied. Both were being re-derived at every call site, and both fail quietly when got wrong — a mis-stepped corner list mirrors the sprite rather than throwing. Within the charter's "UV computation" scope. User-directed.

- **[2026-07-30] The name index is built explicitly and owned by the caller.** `buildTextureAtlasRegionIndex` returns a `Map` rather than caching one on the atlas: the atlas is plain data that any code may append to, so an index hidden on the entity would go stale silently. Returning it makes both the cost and the staleness the caller's, which is the no-hidden-work rule applied to a lookup. `getTextureAtlasRegionByName`'s linear scan remains the default and remains correct. User-directed.

- **[2026-08-01] A region sequence is ordered by the frame number in the name, and written into `out`.** `getTextureAtlasRegionSequence` returned prefix matches in insertion order while its own doc named the `baseName_NNN` animation convention. Insertion order is the packer's packing order, and the other order available for free — by name — sorts `walk_10` ahead of `walk_2` for any packer that did not zero-pad, so both hand back an animation whose frames play out of sequence, silently, because a scrambled animation still runs. Ordering is now by the parsed trailing ordinal, with regions carrying no ordinal sorted after the numbered run so it stays contiguous from `out[0]`. The sort is an in-place insertion sort over a reused key array rather than `Array.sort`: stable by construction, so equal ordinals keep insertion order without depending on a host sort being stable (a C port's `qsort` is not), and no comparator closure or scratch allocation. It takes `out` for the same reason the rest of the package does — `get*` writes into `out` and `build*` allocates and says so, and this was the one `get*` that allocated.

  **Why:** The function existed for exactly one use, and did not deliver it. The failure is invisible at the call site, which is what makes ordering the package's job rather than each caller's.

- **[2026-08-01] The ordinal is a derived query, not a stored field.** `getTextureAtlasRegionOrdinal` reads the trailing decimal run from the region's name (-1 when there is none), and `getTextureAtlasRegionByOrdinal` composes over it to give the canonical name-plus-frame lookup — libGDX's `findRegion(name, index)` — over the convention this SDK's parsers actually emit. The review counted the ordinal as *unrecoverable as data*; it is recoverable, because the name already holds it.

  **Why:** Deriving it takes nothing away from Open direction 1 / the parked multi-page and index work, which is about whether the region *type* should carry an ordinal field. A derived query cannot disagree with the name it came from, and if a stored ordinal is ever added this remains the answer for the parsers that do not set one.

- **[2026-08-01] `getTextureAtlasRegionTexture` re-derives its window on every call; the cache holds identity, not contents.** The cache is keyed by region object and so cannot notice a field changing inside one — what keeps it correct is the unconditional recompute from the page and the region. That is the contract, not an optimization detail, and it is now stated and pinned: an "only compute on first mint" optimization is the exact change that would turn it into a stale UV. The cost of sharing is stated with it — the returned Texture is mutated in place, so a reference kept from an earlier call is rewritten by the next call for the same region and is not a snapshot.

  **Why:** Behavior that is load-bearing but undocumented and untested is correct by accident. It was one plausible optimization away from a wrong sprite, which fails as a slightly-off image rather than as an error.

## Open directions

1. **Region rotation/padding metadata.** The Silver roadmap mentions rotation and padding. Are the current `rotated`/`trimmed`/`sourceX`/`sourceY` fields sufficient, or does the region type need expansion?

2. **Multi-page atlas support.** Gold roadmap item. A multi-page atlas would be multiple `TextureAtlas` instances sharing region namespacing, or a new composite type. Needs design if pursued.

3. **Package Map update.** The current map entry is just `@flighthq/textureatlas`. Should be expanded with a description.
