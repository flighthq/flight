---
package: '@flighthq/image'
updated: 2026-06-25
by: builder-phase2.9
---

# image — Status Log

## 2026-06-25 — extracted from @flighthq/resources (resources eliminated)

New package holding image resources: `imageResource` (create/clone/dispose/invalidate, byte-size, source/data predicates, same-origin, MIME detect) and `imageResourceFrom` (from canvas / ImageBitmap / ImageElement, load from URL/ArrayBuffer/Base64/Blob). Types stay in `@flighthq/types`. Deps: entity, types. This is the most-consumed shard of the old `resources` (surface, textureatlas, tileset, displayobject-canvas/dom, spritesheet, surface-rs all depend on it). 49 tests pass.

## 2026-06-25 — Rust crate mirror (builder Phase 5)

Rust crate `flighthq-image` created as part of splitting the Rust `flighthq-resources` crate to mirror this TS refactor. Layering preserved (image ← textureatlas ← tileset). cargo build/test/fmt green; clippy `-D warnings` clean for the new crates. The broader Rust port still has a large pre-existing function-level parity gap (68.8% native-core) tracked separately — see `_QUESTIONS.md` Phase 5.
