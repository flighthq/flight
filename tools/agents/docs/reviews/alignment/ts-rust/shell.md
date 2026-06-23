# TS↔Rust Alignment: @flighthq/shell

**Verdict:** Aligned — all 7 verb/seam functions map 1:1, file names track, and the one missing export (`createWebShellBackend`) is a recorded web-relocation; the only open item is a `set_shell_backend` re-set/`null` semantic that drifts from both TS and a sibling Rust crate and is not in the divergence map.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `createWebShellBackend` (`shell.ts`) | — (no port) | Expected, **recorded** divergence. conformance.md "Web-relocated functions" (line 117–119) lists `shell` explicitly; the script classifies any `createWeb*` / `*Backend` as `web-relocated` (rust-conformance.ts:237). Browser-only `window.open` impl belongs in `host-web`. No action. |
| — (no TS counterpart) | `NativeShellBackend` (`shell.rs`) | Expected, **recorded**. Rust's host-layer rule (rust/index.md "Host layer") flips TS's ambient web default to a native-default in-crate backend gated behind the `native` feature. Rust-only struct is the documented expression of that flip. The `*Backend`-suffix classifier already absorbs it. No action. |
| `setShellBackend(backend \| null): void` (`shell.ts`) | `set_shell_backend(backend: Box<dyn ShellBackend>)` (`shell.rs`) | **Drift, not in map.** TS takes a nullable arg over a plain mutable slot (`_backend = backend`) — freely re-callable, `null` resets to the web default. Rust uses `OnceLock` and `panic!`s on a second call, with no `Option`/reset path. This narrows the seam contract (no reset, second `set` is a panic vs a silent replace) and is _not_ a sentinel-vs-panic case the conventions sanction — re-installing a backend is legitimate caller behavior, not programmer error. Note: this is suite-wide — `storage` shares the same `OnceLock`+panic shape, while `clipboard` uses the resettable `set_clipboard_backend(Option<Arc<…>>)` form that mirrors TS. Recommend standardizing the platform `set_*_backend` slot semantics and recording the chosen TS↔Rust divergence in the map. |
| `getShellBackend` (`shell.ts`) | `get_shell_backend` (`shell.rs`) | In sync (return-type shape differs as expected: TS `ShellBackend` value vs Rust `&'static dyn ShellBackend`). |
| `moveItemToTrash` | `move_item_to_trash` | In sync. |
| `openExternalUrl` | `open_external_url` | In sync. |
| `openShellPath` | `open_shell_path` | In sync. |
| `shellBeep` | `shell_beep` | In sync. |
| `showItemInFolder` | `show_item_in_folder` | In sync. |

## In sync

- Package→crate name is identity: `@flighthq/shell` → `flighthq-shell`. Not in RENAMES (correct).
- All six core verbs plus `get_shell_backend` map 1:1, camelCase→snake_case, full type words preserved (`showItemInFolder` → `show_item_in_folder`, no abbreviation).
- File names track: `shell.ts` ↔ `shell.rs`; barrel `index.ts` (`export * from './shell'`) ↔ `lib.rs` (`pub use shell::{…}`).
- Sentinel convention carries: TS returns `Promise<boolean>` (`false` on unsupported), Rust returns `bool` (`false` on unsupported) — same expected-failure-as-sentinel posture, no panics on the verbs. (TS is async; Rust is sync, consistent with the native-clean seam note in rust/index.md "Host layer".)
- `ShellBackend` seam type lives in the header layer in both (`@flighthq/types` / `flighthq-types`), re-exported from the crate root.
- No abbreviated names, no extra Rust verb functions beyond the documented `NativeShellBackend`.
- Conformance script: 8 TS / 7 ported / 7 matched / 1 web-relocated — clean, no unexplained gap.

## Divergence-map note

The map already covers the `createWebShellBackend` omission and the `NativeShellBackend` addition (web-relocated + native-default rules). The one item it does **not** cover is the `set_shell_backend` contract change (non-nullable, `OnceLock`/panic-on-re-set vs TS's resettable nullable slot). Since `clipboard` and `shell`/`storage` already disagree with each other on this, the right fix is a suite-wide decision recorded once in the divergence map, rather than a shell-only note.
