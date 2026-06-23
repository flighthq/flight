# TS↔Rust Alignment: @flighthq/haptics

**Verdict:** Near-perfect alignment — 6 of 7 exports port 1:1; the single divergence is the backend factory renamed `createWebHapticsBackend` → `create_default_haptics_backend`, which is sensible but undocumented and inconsistent with sibling platform crates.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createWebHapticsBackend` (`haptics.ts`) | `create_default_haptics_backend` (`haptics.rs`) | **Undocumented + inconsistent rename.** Straight conformance port is `create_web_haptics_backend`. The rename (`Web`→`default`) is reasonable — Rust has no `navigator`, so the in-box backend is a no-op sentinel, not a web backend, and the doc comment explains this. But it is not recorded in the divergence map, and sibling crates that face the identical situation are split: `statusbar`/`share`/`webcam` keep `create_web_*_backend` (1:1), while `geolocation` and `haptics` rename to `create_default_*_backend`. Pick one convention suite-wide and record it. The conformance script cannot catch this: `classifyGap` excuses any `*Backend`-ending function as `web-relocated` (scripts/rust-conformance.ts:237), so the rename is invisible to `npm run rust:conformance`. |
| `getHapticsBackend` (`haptics.ts`) | `get_haptics_backend` (`haptics.rs`) | In sync. |
| `setHapticsBackend` (`haptics.ts`) | `set_haptics_backend` (`haptics.rs`) | In sync. `null` → `Option<Arc<dyn HapticsBackend>>`; sentinel/teardown semantics preserved. |
| `triggerHapticImpact` (`haptics.ts`) | `trigger_haptic_impact` (`haptics.rs`) | In sync. |
| `triggerHapticNotification` (`haptics.ts`) | `trigger_haptic_notification` (`haptics.rs`) | In sync. Param `type` → `notification_type` (reserved-word rename, expected). |
| `triggerHapticSelection` (`haptics.ts`) | `trigger_haptic_selection` (`haptics.rs`) | In sync. |
| `vibrateDevice` (`haptics.ts`) | `vibrate_device` (`haptics.rs`) | In sync. `durationMs: number` → `duration_ms: u32`. |

## In sync

- **Crate name is identity:** `@flighthq/haptics` → `flighthq-haptics`. No package→crate divergence.
- **File names track:** `haptics.ts` ↔ `haptics.rs`; `index.ts` (barrel) ↔ `lib.rs` (crate root re-export). Same domain basename.
- **Shared types in the header layer:** `HapticImpactStyle`, `HapticNotificationType`, `HapticsBackend` are defined once in `flighthq-types` (crates/flighthq-types/src/platform.rs:835-851) and imported by the crate — not redefined inline. Matches the TS rule that cross-package contracts live in `@flighthq/types`.
- **Sentinel convention preserved:** every TS method returns `false` when unavailable; the Rust default backend no-ops and returns `false` for all four methods. No panics on the expected-failure path.
- **"Always a backend" lazy-default invariant preserved:** TS lazily creates the web default in `getHapticsBackend`; Rust lazily creates the default in `get_haptics_backend` behind a `Mutex<Option<...>>`.
- **Tests mirror source:** all 7 TS `describe` blocks have a corresponding Rust `#[test]`/`describe` comment, including a `create_default_haptics_backend` block aligned to the renamed factory.

## Divergence map note

Add an entry for the platform-suite backend-factory naming. Either:

1. Rename `create_default_haptics_backend` → `create_web_haptics_backend` for straight 1:1 conformance with `createWebHapticsBackend` (matching `statusbar`/`share`/`webcam`); **or**
2. Standardize the whole suite on `create_default_*_backend` (rename `statusbar`/`share`/`webcam` to match) and record the `createWeb*Backend` → `create_default_*_backend` mapping in tools/agents/docs/rust/conformance.md as an intentional, suite-wide divergence with the "no `navigator` in the box" rationale.

The current state — two crates renamed, three not, none documented — is silent drift either way.
