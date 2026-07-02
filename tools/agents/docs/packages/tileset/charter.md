---
package: '@flighthq/tileset'
crate: flighthq-tileset
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# tileset — Charter

## What it is

`@flighthq/tileset` is the **tileset entity layer** — creating uniform-grid `Tileset` entities over a `TextureAtlas`, building region arrays from grid parameters (tile width/height, spacing, margin), and loading tileset images from various sources. 8 exports across 2 source files. Dependencies: `entity`, `image`, `textureatlas`, `types`. Extracted from `@flighthq/textureatlas` (2026-06-25).

## North star

1. **Uniform-grid tile description.** A tileset describes a regular grid of equal-sized tiles in an atlas image. The entity is the description; rendering is `@flighthq/sprite`'s `Tilemap`.
2. **Near scope ceiling.** The core API (create, build regions, load from sources) is compact and complete. Growth is in formats, not core API.

## Boundaries

**In scope:**

- Tileset entity creation from TextureAtlas, ImageResource, or loaded sources (URL, bytes, blob, base64).
- Region-building from grid parameters (tile dimensions, spacing, margin).

**Non-goals:**

- Tileset format parsing (Tiled TSX, LDtk, etc.) — `@flighthq/tileset-formats`.
- Tilemap rendering / tile placement — `@flighthq/sprite` (Tilemap display object).
- Tile map format parsing (Tiled TMX, LDtk maps) — crosses into scene/map domain.

## Decisions

- **[2026-07-02] Rename `loadTilesetFromArrayBuffer` → `loadTilesetFromBytes`, accept `Uint8Array`.** SDK-wide byte-input convention.

  **Why:** Consistency with image, font, textureatlas. `Uint8Array` matches Rust `&[u8]`.

- **[2026-07-02] Near scope ceiling.** 8 exports is near the natural ceiling for a uniform-grid entity. Growth is in `tileset-formats`, not here.

  **Why:** The core API covers creation, grid-region building, and loading from all standard sources. Further API surface would be format parsing.

- **[2026-07-02] `tileset-formats` blessed as neighbor.** Primary target: Tiled TSX (the dominant open-source tilemap editor's tileset format, XML-based). Additional candidates: LDtk (JSON), Pyxel Edit. Note: Tiled TMX (map format — tile placement, layers, objects) is a different domain that crosses into tilemap/scene territory.

  **Why:** No Tiled/TMX support exists anywhere in the SDK. TSX describes tilesets (grids, spacing, properties) which is exactly what this package models. TMX describes maps which is a separate concern.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **`tileset-formats` package shape.** Per-format registry (`registerTilesetParser`) or per-format parse functions? How much of TSX to support (tile properties, terrain, Wang tiles, animations)?

2. **Tiled TMX / LDtk map format home.** TMX and LDtk map formats describe tile placement, layers, and objects — this crosses into tilemap/scene territory. Where does map-level parsing live?

3. **Package Map update.** Add description to the current bare entry.
