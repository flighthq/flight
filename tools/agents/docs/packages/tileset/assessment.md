---
package: '@flighthq/tileset'
updated: 2026-07-02
basedOn: status.md
---

# tileset — Assessment

Verified against the live tree (2 source files, 2 test files, 21 tests, 8 exports) and the direction session (2026-07-02). Four charter decisions blessed. No depth review exists.

## Recommended

Sweep-safe: within `@flighthq/tileset`, no open design decision beyond what the charter has blessed.

1. **Rename `loadTilesetFromArrayBuffer` → `loadTilesetFromBytes`, accept `Uint8Array`.** Per charter Decision #1. Change parameter type, rename function, update barrel, tests, describe blocks.

2. **Package Map descriptions for tileset.** Per charter Open direction #3. Update the codebase map entry.

## Backlog

- **`tileset-formats` package.** _Parked — new package, needs direction session._ Charter Decision #3 blesses the neighbor; TSX is the primary target.
- **Rust `flighthq-tileset` crate.** _Parked — global posture._ Already exists.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: Uint8Array rename, Package Map description
