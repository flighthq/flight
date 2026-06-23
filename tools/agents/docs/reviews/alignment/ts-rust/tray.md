# TS↔Rust Alignment: @flighthq/tray

**Verdict:** In sync — all 8 non-web functions map 1:1 (camelCase→snake*case, full type words, teardown verb `destroy*`and`null→Option`sentinel preserved); the lone`createWebTrayBackend` omission is the documented web-relocated convention, applied consistently with sibling host-seam crates.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createTrayIcon` (`tray.ts`) | `create_tray_icon` (`tray.rs`) | None. `TrayIcon \| null` → `Option<TrayIcon>` sentinel preserved. |
| `destroyTrayIcon` (`tray.ts`) | `destroy_tray_icon` (`tray.rs`) | None. `destroy_` teardown verb preserved (frees a host resource). |
| `getTrayBackend` (`tray.ts`) | `get_tray_backend` (`tray.rs`) | None. Lazy web-default install mirrors TS exactly. |
| `onTrayEvent` (`tray.ts`) | `on_tray_event` (`tray.rs`) | None. Returns unsubscribe closure, matching TS `() => void`. |
| `setTrayBackend` (`tray.ts`) | `set_tray_backend` (`tray.rs`) | None. `TrayBackend \| null` → `Option<Arc<dyn TrayBackend>>`. |
| `setTrayContextMenu` (`tray.ts`) | `set_tray_context_menu` (`tray.rs`) | None. |
| `setTrayIconTitle` (`tray.ts`) | `set_tray_icon_title` (`tray.rs`) | None. Full type word `TrayIcon` preserved. |
| `setTrayIconTooltip` (`tray.ts`) | `set_tray_icon_tooltip` (`tray.rs`) | None. Full type word `TrayIcon` preserved. |
| `createWebTrayBackend` (`tray.ts`) | _(no `create_web_tray_backend` fn; `WebTrayBackend` struct only)_ | Documented web-relocated divergence (conformance.md §"Web-relocated functions" lists `tray`). The script classifies `createWeb*`/`*Backend` as `web-relocated`, so the table's "1 missing" is categorized, not a true gap. Nuance below. |

## In sync

- **Crate name** is identity: `@flighthq/tray` → `flighthq-tray`. Not in any rename/divergence entry, and correctly so.
- **Filenames track**: `index.ts`→`lib.rs` (barrel/root), `tray.ts`→`tray.rs`. Same domain basename; no drift.
- **8 of 9 exported functions** port 1:1 with correct snake_case and unabbreviated type words (`TrayIcon` never shortened). No renamed-without-reason, no abbreviation, no extra Rust-only public functions beyond the `WebTrayBackend` struct.
- **Sentinel convention** carries: backend `create` returns `-1` for "unsupported", mapped to `None`/`null` in both impls; mutators are no-ops on web in both. `i32`/`number` backend id parity.
- **Teardown verb**: `destroy_tray_icon` correctly uses `destroy_` (frees a non-GC host resource), matching TS `destroyTrayIcon`.
- **No out-params** in this package, so the `out → &mut` rule is N/A.
- **Conformance script sets are consistent**: `tray` is covered by the `WEB_PACKAGES`/`web-relocated` classification (rust-conformance.ts line 237), aligned with conformance.md line 119.

## Notes for the divergence map

- The omission of `create_web_tray_backend` is **covered by the existing general rule** (conformance.md §"Web-relocated functions", which names `tray`), so no new map entry is required. No stale entry observed.
- **One nuance the script cannot see** (judgment, not a required fix): the Rust crate keeps the `WebTrayBackend` _struct_ in-crate (lib.rs re-exports it) and uses it as the lazy default inside `get_tray_backend`, whereas the strict "web-relocated" reading would place web-only implementations in `host-web`. This is defensible — the struct is the native-default **sentinel** (returns `-1`/no-op, needs no browser substrate), so it belongs with the seam rather than in `host-web`. TS exposes the web backend two ways (the lazy default _and_ a public `createWebTrayBackend` factory); the Rust port collapses this to the lazy default plus a public struct, dropping the standalone factory function. This matches sibling host-seam crates (`shell`, `clipboard` expose no `create_web_*_backend` factory), so it is a consistent port pattern rather than tray-specific drift. If the project wants the divergence map to be explicit about this "struct-in-crate, no factory fn" shape for sentinel web backends, a one-line clarification under §"Web-relocated functions" would remove any ambiguity, but it is optional.
