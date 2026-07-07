---
package: '@flighthq/video'
updated: 2026-06-25
by: builder-phase2.9
---

# video — Status Log

## 2026-06-25 — extracted from @flighthq/resources (resources eliminated)

New package: `videoResource`/`videoResourceFrom` (create + URL constructors). Deps: types. Consumed by `@flighthq/media` (videoChannel). 9 tests pass.

## 2026-06-25 — Rust crate mirror (builder Phase 5)

Rust crate `flighthq-video` created as part of splitting the Rust `flighthq-resources` crate to mirror this TS refactor. Layering preserved (image ← textureatlas ← tileset). cargo build/test/fmt green; clippy `-D warnings` clean for the new crates. The broader Rust port still has a large pre-existing function-level parity gap (68.8% native-core) tracked separately — see `_QUESTIONS.md` Phase 5.
