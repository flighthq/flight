# TS↔Rust Alignment: @flighthq/dialog

**Verdict:** In sync — every TS verb and the backend seam map 1:1 to `flighthq-dialog`; the only gap (`createWebDialogBackend` absent in Rust) is the documented native-default / `host-web` seam pattern, not drift.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `getDialogBackend` / `dialog.ts` | `get_dialog_backend` / `dialog.rs` | None — 1:1. Behavioral nuance: TS lazily creates a web default (always returns a backend); Rust panics when none is installed. This is the locked port flip ("TS ambient default is web; Rust's is native/std") — `host-web` owns the web fill. Worth a one-line note in the divergence map (see below). |
| `setDialogBackend` / `dialog.ts` | `set_dialog_backend` / `dialog.rs` | None — 1:1. `null` → `Option<Arc<dyn DialogBackend>>`. |
| `showConfirmDialog` / `dialog.ts` | `show_confirm_dialog` / `dialog.rs` | None — 1:1. `Promise<boolean>` → `async -> bool`. |
| `showMessageDialog` / `dialog.ts` | `show_message_dialog` / `dialog.rs` | None — 1:1. `Promise<MessageDialogResult>` → `async -> MessageDialogResult`. |
| `showOpenFileDialog` / `dialog.ts` | `show_open_file_dialog` / `dialog.rs` | None — 1:1. `Promise<string[]>` → `async -> Vec<String>`, `[]` sentinel preserved. |
| `showPromptDialog` / `dialog.ts` | `show_prompt_dialog` / `dialog.rs` | None — 1:1. `null` → `Option<String>`; TS `defaultValue = ''` default arg becomes a required `&str` (Rust has no default args — acceptable, caller passes `""`). |
| `showSaveFileDialog` / `dialog.ts` | `show_save_file_dialog` / `dialog.rs` | None — 1:1. `null` → `Option<String>`. |
| `createWebDialogBackend` / `dialog.ts` | _(none)_ | Expected absence, not a missing port. The web backend (file-input picker, `window.alert`/`confirm`/`prompt`) is browser-only; per the conformance map it belongs in `host-web`, and the native crate ships no ambient default. Covered by the `dialog ∈ WEB_PACKAGES` rule in `scripts/rust-conformance.ts` and the seam-with-sentinel paragraph in `conformance.md`. No Rust crate should hold this verb. |

No extra/undocumented Rust functions. No abbreviations or renamed-without-reason. Type words fully preserved (`get_dialog_backend`, `show_open_file_dialog`).

## In sync

- **Crate name** is identity: `@flighthq/dialog` → `flighthq-dialog`.
- **File names** track: `dialog.ts` ↔ `dialog.rs`; `index.ts` ↔ `lib.rs` (the standard barrel↔crate-root mapping).
- **Verb set**: all 7 native-applicable TS exports are present with correct snake_case.
- **Sentinel conventions** carry across: `null`→`Option`, `[]`→`Vec` empty, `false`→`bool` — matching the "expected failure returns sentinel" rule on both sides (`lib.rs` doc comment states it explicitly).
- **Backend seam shape** matches the platform-suite pattern: `get_*_backend` / `set_*_backend` over a `DialogBackend` trait in `flighthq-types`, native host installs it (e.g. `flighthq-host-electron`).
- **Out-param / teardown verbs**: none apply to this crate (all value-returning async verbs); nothing to misalign.

### Divergence-map note

The `createWebDialogBackend` absence and the `get_dialog_backend` default-behavior flip (TS lazy web default vs. Rust panic-until-installed) are both implied by the existing `WEB_PACKAGES` membership and the native-default note in `rust/index.md`, but neither is called out specifically for `dialog`. If the map ever lists per-package web-backend omissions, `dialog`'s `createWebDialogBackend → host-web` belongs there alongside its `clipboard`/`screen` siblings. Not blocking — the general rule already covers it.
