---
package: '@flighthq/textureatlas'
crate: flighthq-textureatlas
draft: false
lastDirection: 2026-07-02
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
- Tileset semantics — `@flighthq/tileset`.

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

## Open directions

1. **Region rotation/padding metadata.** The Silver roadmap mentions rotation and padding. Are the current `rotated`/`trimmed`/`sourceX`/`sourceY` fields sufficient, or does the region type need expansion?

2. **Multi-page atlas support.** Gold roadmap item. A multi-page atlas would be multiple `TextureAtlas` instances sharing region namespacing, or a new composite type. Needs design if pursued.

3. **Package Map update.** The current map entry is just `@flighthq/textureatlas`. Should be expanded with a description.
