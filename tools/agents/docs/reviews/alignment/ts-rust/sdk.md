# TS↔Rust Alignment: @flighthq/sdk

**Verdict:** Fully aligned — the barrel is a pure re-export shell with no functions of its own, and every membership difference between the TS and Rust barrels is an already-recorded divergence-map entry (6 browser-substrate packages excluded, `displayobject-skia` Rust-only).

## Scope

`@flighthq/sdk` is a convenience barrel with no logic: `packages/sdk/src/index.ts` is 83 `export * from '@flighthq/<name>'` lines, and `crates/flighthq-sdk/src/lib.rs` is the matching set of `pub use flighthq_<name>::*` re-exports. There are no exported functions to map (the conformance script reports `sdk` as 0 TS exports / 0 Rust functions / 1 file / 0 issues), so alignment here is entirely about _which packages the barrel forwards_. The crate name itself is identity (`@flighthq/sdk` → `flighthq-sdk`), and there is a single source file on each side (`index.ts` ↔ `lib.rs`, the standard barrel-file pairing, not a tracked basename).

## Name map findings

Membership diff of the two barrels. Every difference is accounted for by the divergence map (`tools/agents/docs/rust/conformance.md`).

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `@flighthq/displayobject-canvas` | (absent) | None — documented exclude (no Canvas2D substrate in the box); covered by `displayobject-skia`. |
| `@flighthq/displayobject-dom` | (absent) | None — documented exclude (no DOM tree in the box). |
| `@flighthq/effects-canvas` | (absent) | None — documented exclude; CPU effects covered by `effects`/`filters-surface`. |
| `@flighthq/filters-canvas` | (absent) | None — documented exclude; CPU filters covered by `filters-surface`. |
| `@flighthq/filters-css` | (absent) | None — documented exclude (no CSS engine in the box). |
| `@flighthq/textshaper-canvas` | (absent) | None — documented exclude; shaper _seam_ (`textshaper`) is ported, Canvas `measureText` backend is browser-only. |
| (absent) | `flighthq_displayobject_skia::*` | None — documented Rust-only crate (`RUST_ONLY`); in-box software renderer, conformance reference + web no-GPU fallback. |

No undocumented drift, no abbreviated/renamed forwards, no missing non-excluded package. All 78 non-excluded TS packages are forwarded by the Rust barrel; the 6 TS-only entries are exactly the `TS_ONLY`/excluded set and the 1 Rust-only entry is exactly `displayobject-skia`.

## In sync

- **Crate name:** identity (`flighthq-sdk`), as required.
- **Barrel membership:** 78 shared packages forwarded on both sides; differences are the recorded divergences only.
- **Intent/contract:** both barrels document themselves as logic-free, globally-unique-name, tree-shaking-neutral convenience entry points (TS `CLAUDE.md` barrel rule; Rust `lib.rs` doc comment), with the same "depend on specific crates if size-sensitive" guidance.
- **Manifest scope:** `package.json` dependencies and `Cargo.toml` dependencies list the same package set modulo the documented exclude/skia divergences.
- **Divergence map currency:** the `conformance.md` excluded set, `RUST_ONLY`, and the script's `TS_ONLY`/`RUST_ONLY`/`RENAMES` sets all match the actual barrel contents observed here. No stale entries — `RENAMES` is correctly empty (every mapped package is identity post-reorg).

Nothing to add to the divergence map. The map already covers this crate's every difference.
