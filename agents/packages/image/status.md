---
package: '@flighthq/image'
updated: 2026-08-05
by: principal
---

# image — Status Log

## [2026-08-05 · principal] — the backing→source migration is done here

The 17 commits since the 2026-07-13 review complete this package's half of the texture-source
reshape. `ImageBacking` no longer exists anywhere in the tree; `TextureSource` is the model, carrying
`alphaType` and `gamut` lifted up onto it, with declared representation kinds and sibling sources
defined. The fused backing shape is retired. Anyone reading the texture-source-model record should
check it against this — the staged migration it describes is further along than the doc's status
implies, at least on the image side.

Ownership moved deliberately: the neutral image-resource-reference atoms are homed here rather than
in `scene3d`, and `createImageResourceFromBitmap` moved to its output package. Image readback is now
explicit rather than implicit.

On the render side, `bindGlImageResourceTexture` uploads source-or-data 2D textures, compressed-
container upload is wired into the GL bitmap draw path, and data-only Surfaces draw directly on
canvas/DOM through a version-keyed element cache. That cache keys on version, so a mutation that does
not bump version will not repaint — the invalidation doctrine's payload rule, and the failure mode to
suspect first if a Surface goes stale on screen.

URL loading gained abort support (aborted loads cancel) and its API was clarified; fixtures were made
node-safe and kept test-only.


## 2026-06-25 — extracted from @flighthq/resources (resources eliminated)

New package holding image resources: `imageResource` (create/clone/dispose/invalidate, byte-size, source/data predicates, same-origin, MIME detect) and `imageResourceFrom` (from canvas / ImageBitmap / ImageElement, load from URL/ArrayBuffer/Base64/Blob). Types stay in `@flighthq/types`. Deps: entity, types. This is the most-consumed shard of the old `resources` (surface, textureatlas, tileset, scene2d-canvas/dom, spritesheet, surface-rs all depend on it). 49 tests pass.

## 2026-06-25 — Rust crate mirror (builder Phase 5)

Rust crate `flighthq-image` created as part of splitting the Rust `flighthq-resources` crate to mirror this TS refactor. Layering preserved (image ← textureatlas ← tileset). cargo build/test/fmt green; clippy `-D warnings` clean for the new crates. The broader Rust port still has a large pre-existing function-level parity gap (68.8% native-core) tracked separately — see `_QUESTIONS.md` Phase 5.
