---
package: '@flighthq/tileset'
updated: 2026-06-25
by: builder-phase2.9
---

# tileset — Status Log

## 2026-06-25 — extracted to its own package (user-confirmed)

Tilesets split out of `@flighthq/textureatlas` into their own package (user direction): `tileset` (`createTileset`, `createTilesetFromAtlas`, `createTilesetFromImageResource`, `buildTilesetRegions`) and `tilesetFrom` (`loadTilesetFromUrl`/etc.). Layering: `image → textureatlas → tileset`. Deps: entity, image, textureatlas, types. Consumers (displayobject-canvas, spritesheet tests; examples/functional via the SDK barrel) repointed. 21 tests pass.

**Deferred:** a `tileset-formats` neighbor — no tileset file-format parser exists yet; see `_QUESTIONS.md`.

## 2026-06-25 — Rust crate mirror (builder Phase 5)

Rust crate `flighthq-tileset` created as part of splitting the Rust `flighthq-resources` crate to mirror this TS refactor. Layering preserved (image ← textureatlas ← tileset). cargo build/test/fmt green; clippy `-D warnings` clean for the new crates. The broader Rust port still has a large pre-existing function-level parity gap (68.8% native-core) tracked separately — see `_QUESTIONS.md` Phase 5.
