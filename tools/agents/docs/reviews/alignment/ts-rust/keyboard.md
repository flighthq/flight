# TS↔Rust Alignment: @flighthq/keyboard

**Verdict:** Near-perfect alignment — all 11 TS exports accounted for (10 ported 1:1, `createWebSoftKeyboardBackend` correctly web-relocated), but the Rust crate adds one undocumented extra function (`is_soft_keyboard_visible`) that should be recorded in the divergence map or removed.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `attachSoftKeyboard` (keyboard.ts) | `attach_soft_keyboard` (keyboard.rs) | OK |
| `createSoftKeyboard` (keyboard.ts) | `create_soft_keyboard` (keyboard.rs) | OK |
| `createSoftKeyboardInfo` (keyboard.ts) | `create_soft_keyboard_info` (keyboard.rs) | OK |
| `createWebSoftKeyboardBackend` (keyboard.ts) | _(absent)_ | Intentional, documented. Browser-API-bound (`window.visualViewport`); conformance.md "Web-relocated functions" (line 119) explicitly lists `keyboard` — its web backend belongs in `host-web`. Rust supplies a native `SentinelSoftKeyboardBackend` default instead. No action. |
| `detachSoftKeyboard` (keyboard.ts) | `detach_soft_keyboard` (keyboard.rs) | OK |
| `disposeSoftKeyboard` (keyboard.ts) | `dispose_soft_keyboard` (keyboard.rs) | OK — `dispose_*` teardown verb preserved; both detach the subscription and leave signals as GC/drop-managed memory. |
| `getSoftKeyboardBackend` (keyboard.ts) | `get_soft_keyboard_backend` (keyboard.rs) | OK |
| `getSoftKeyboardInfo` (keyboard.ts) | `get_soft_keyboard_info` (keyboard.rs) | OK — `out` param → `&mut SoftKeyboardInfo`, returns the same ref. Convention carried. |
| `hideSoftKeyboard` (keyboard.ts) | `hide_soft_keyboard` (keyboard.rs) | OK |
| `setSoftKeyboardBackend` (keyboard.ts) | `set_soft_keyboard_backend` (keyboard.rs) | OK — `SoftKeyboardBackend \| null` → `Option<Arc<dyn SoftKeyboardBackend>>`. Sentinel/null convention carried. |
| `showSoftKeyboard` (keyboard.ts) | `show_soft_keyboard` (keyboard.rs) | OK |
| _(absent)_ | `is_soft_keyboard_visible` (keyboard.rs) | **Drift.** Extra Rust function with no TS counterpart and no divergence-map entry. It is a thin convenience over `get_soft_keyboard_info().visible`. Either add it to TS (`isSoftKeyboardVisible`, matching the `is*` boolean convention) so the pair stays symmetric, drop it from Rust, or record it as an intentional Rust-only addition. |

## In sync

- **Crate name:** identity (`@flighthq/keyboard` → `flighthq-keyboard`); not in any rename map, correctly so.
- **Filenames:** `index.ts`/`keyboard.ts` ↔ `lib.rs`/`keyboard.rs`; same `keyboard` domain basename. `index.ts` → `lib.rs` is the standard barrel mapping.
- **`package.json` ↔ `Cargo.toml`:** identical descriptions; deps match (`@flighthq/signals` + `@flighthq/types` → `flighthq-signals` + `flighthq-types`), both within the `FOLDABLE_DEPS` set.
- **Conformance script:** reports keyboard 11/10 (1 "missing" = the web-relocated `createWebSoftKeyboardBackend`), so the gate is green for the documented reasons.
- **Conventions carried:** `out` → `&mut`, `null` → `Option`, `dispose_*` teardown verb, `create_*` allocators, `get_*`/`set_*` backend seam, sentinel-backend (no-op show/hide, hidden+height-0 info) all preserved. The attach/detach/dispose lifecycle and signal-emission semantics (onResize every change; onShow/onHide on visibility transition) match the TS implementation exactly.

## Divergence map note

`is_soft_keyboard_visible` is the one item that should be reconciled. The conformance script's name-match counts it under "extra" but the divergence map (`conformance.md`) has no Rust-only-function mechanism for platform-suite crates (the "Rust-only" table is crate-level only). Recommend: prefer adding `isSoftKeyboardVisible` upstream to TS — it is a natural, convention-clean (`is*`) accessor — restoring 1:1 symmetry rather than codifying a divergence.
