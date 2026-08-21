---
package: '@flighthq/physics3d-abi'
updated: 2026-08-21
by: auditor
---

# physics3d-abi — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

The public TypeScript contract and executable reference backend are complete. A Rust/Wasm shadow and its
native differential/performance qualification remain deliberately downstream and were not started.

## Log

- **2026-08-21** — Persistent lifecycle, packed commands/readback, all built-in shapes and joints, queries,
  synchronous hooks, reentrancy guards, shared-memory views, and standard-solver parity completed with 70
  focused tests.
- **2026-08-21** — Language-neutral little-endian wire layout, stable discriminants, partial execution,
  capacity reporting, and handle/view lifetime rules documented and locked by byte-level tests.
- **2026-08-21** — Public package boundary and paired `physics3d-abi-rs` shadow contract established.
