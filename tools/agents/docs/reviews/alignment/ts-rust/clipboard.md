# TS↔Rust Alignment: @flighthq/clipboard

**Verdict:** In sync — all 15 native-applicable TS verbs and the backend seam map 1:1 to `flighthq-clipboard`; the only gap (`createWebClipboardBackend` absent in Rust) is the documented `host-web` / native-default seam pattern, not drift.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `clearClipboard` / `clipboard.ts` | `clear_clipboard` / `clipboard.rs` | None — 1:1. `Promise<boolean>` → `async -> bool`. |
| `getClipboardBackend` / `clipboard.ts` | `get_clipboard_backend` / `clipboard.rs` | None on naming. Behavioral nuance: TS lazily creates a web default (comment: "There is always a backend"); Rust panics when none is installed. This is the locked port flip ("TS ambient default is web; Rust's is native/std") — `host-web` owns the web fill. Worth a one-line note in the divergence map (see below). |
| `hasClipboardImage` / `clipboard.ts` | `has_clipboard_image` / `clipboard.rs` | None — 1:1. `has*` boolean verb preserved. |
| `hasClipboardText` / `clipboard.ts` | `has_clipboard_text` / `clipboard.rs` | None — 1:1. |
| `readClipboardBookmark` / `clipboard.ts` | `read_clipboard_bookmark` / `clipboard.rs` | None — 1:1. `Promise<ClipboardBookmark \| null>` → `async -> Option<ClipboardBookmark>`; `null`→`Option` carried. |
| `readClipboardHtml` / `clipboard.ts` | `read_clipboard_html` / `clipboard.rs` | None — 1:1. `''` sentinel → `String` (empty). |
| `readClipboardImage` / `clipboard.ts` | `read_clipboard_image` / `clipboard.rs` | None — 1:1. |
| `readClipboardRTF` / `clipboard.ts` | `read_clipboard_rtf` / `clipboard.rs` | None. TS keeps the acronym uppercase (`RTF`); Rust lowercases to `rtf` — correct snake_case lowering of an acronym, full word preserved, matches `read_html`/`write_html` casing. Not drift. |
| `readClipboardText` / `clipboard.ts` | `read_clipboard_text` / `clipboard.rs` | None — 1:1. |
| `setClipboardBackend` / `clipboard.ts` | `set_clipboard_backend` / `clipboard.rs` | None — 1:1. `ClipboardBackend \| null` → `Option<Arc<dyn ClipboardBackend>>`. |
| `writeClipboardBookmark` / `clipboard.ts` | `write_clipboard_bookmark` / `clipboard.rs` | None — 1:1. `(title: string, url: string)` → `(&str, &str)`. |
| `writeClipboardHtml` / `clipboard.ts` | `write_clipboard_html` / `clipboard.rs` | None — 1:1. |
| `writeClipboardImage` / `clipboard.ts` | `write_clipboard_image` / `clipboard.rs` | None — 1:1. `dataUrl: string` → `data_url: &str`. |
| `writeClipboardRTF` / `clipboard.ts` | `write_clipboard_rtf` / `clipboard.rs` | None — same acronym lowering as `read*RTF`. |
| `writeClipboardText` / `clipboard.ts` | `write_clipboard_text` / `clipboard.rs` | None — 1:1. |
| `createWebClipboardBackend` / `clipboard.ts` | _(none)_ | Expected absence, not a missing port. The web backend (`navigator.clipboard`, `ClipboardItem`, `Blob`, `FileReader` data-URL reads) is browser-only; per the conformance map it belongs in `host-web`, and the native crate ships no ambient default. Covered by `clipboard ∈ WEB_PACKAGES` in `scripts/rust-conformance.ts` and the seam-with-sentinel paragraph in `conformance.md`. No Rust crate should hold this verb. |

No extra/undocumented Rust functions. No abbreviations or renamed-without-reason. Type words fully preserved (`get_clipboard_backend`, `write_clipboard_bookmark`).

## In sync

- **Crate name** is identity: `@flighthq/clipboard` → `flighthq-clipboard`. Descriptions match verbatim across `package.json` and `Cargo.toml`.
- **File names** track: `clipboard.ts` ↔ `clipboard.rs`; `index.ts` ↔ `lib.rs` (the standard barrel↔crate-root mapping). The lib.rs `pub use` re-exports the full verb set, mirroring `index.ts`'s `export * from './clipboard'`.
- **Verb set**: all 15 native-applicable TS exports are present with correct snake_case; the full image/RTF/bookmark/html/text matrix is mirrored exactly.
- **Sentinel conventions** carry across: `null`→`Option`, `''`→empty `String`, `false`→`bool` — matching the "expected failure returns sentinel, never throw" rule on both sides (the `lib.rs` doc comment states it explicitly: "clipboard access is an expected-failure surface, not a programmer error").
- **Backend seam shape** matches the platform-suite pattern: `get_*_backend` / `set_*_backend` over a `ClipboardBackend` trait in `flighthq-types`, native host installs it (doc comment references `flighthq-host-electron`).
- **Out-param / teardown verbs**: none apply (all value-returning async verbs); nothing to misalign.

### Divergence-map note

The `createWebClipboardBackend` absence and the `get_clipboard_backend` default-behavior flip (TS lazy web default — "there is always a backend" — vs. Rust panic-until-installed) are both implied by the existing `WEB_PACKAGES` membership and the native-default note in `rust/index.md`, but neither is called out specifically for `clipboard`. This is the identical situation flagged in the sibling `dialog.md` review. If the map ever grows per-package web-backend omission entries, `clipboard`'s `createWebClipboardBackend → host-web` belongs there alongside `dialog`/`screen`. Not blocking — the general `WEB_PACKAGES` rule already covers it, and `clipboard` is named explicitly in the `conformance.md` line 119 platform-suite list.
