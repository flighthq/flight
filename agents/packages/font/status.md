---
package: '@flighthq/font'
updated: 2026-06-25
by: builder-phase2.9
---

# font — Status Log

## 2026-06-25 — extracted from @flighthq/resources (resources eliminated)

New package: `font`/`fontFrom` and `fontResource`/`fontResourceFrom` (font + font-resource types and constructors). Types stay in `@flighthq/types`. Deps: entity, types. 6 tests pass.

## 2026-06-25 — Rust crate mirror (builder Phase 5)

Rust crate `flighthq-font` created as part of splitting the Rust `flighthq-resources` crate to mirror this TS refactor. Layering preserved (image ← textureatlas ← tileset). cargo build/test/fmt green; clippy `-D warnings` clean for the new crates. The broader Rust port still has a large pre-existing function-level parity gap (68.8% native-core) tracked separately — see `_QUESTIONS.md` Phase 5.
