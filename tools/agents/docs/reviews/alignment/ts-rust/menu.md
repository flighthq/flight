# TS↔Rust Alignment: @flighthq/menu

**Verdict:** Near-complete and faithful, but one TS export (`createWebMenuBackend`) is ported as a bare `WebMenuBackend` struct with no `create_web_menu_backend` constructor function — an undocumented 1:1 gap that should either be ported or recorded in the divergence map; `show_context_menu` exists but lacks a matching-named test.

The crate name is identity (`@flighthq/menu` → `flighthq-menu`), the type seam (`MenuBackend`, `MenuItemTemplate`, `MenuItemType`) lives in `flighthq-types`, and the camelCase→snake_case mapping is otherwise clean and preserves full type words. The two crate functions reported "missing" by `npm run rust:conformance` are a name/test-coverage artifact, not absent behavior — analysis below.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createWebMenuBackend` (`menu.ts`) | `WebMenuBackend` struct (`menu.rs`) | **1:1 port gap.** TS exposes a `createWebMenuBackend()` factory function (public export, colocated test). Rust exposes only the `WebMenuBackend` struct and no `create_web_menu_backend()` function. Peer crate `flighthq-share` ports the analogous TS factory as a real `create_web_share_backend()` function, so the codebase pattern is to port the factory; menu (and siblings `shortcut`, `tray`) diverge by exposing the struct only. Either add `create_web_menu_backend() -> Arc<dyn MenuBackend>` or record the struct-vs-factory divergence in the conformance map. This is what `rust:conformance` counts as 1 of the 2 "missing". |
| `showContextMenu` (`menu.ts`) | `show_context_menu` (`menu.rs`) | **Function present and correct** (`async fn show_context_menu(items, x, y) -> Option<String>`, line 96). Flagged "missing" by `rust:conformance` only because that script measures _test-name_ coverage and no Rust test name contains `show_context_menu` (the popup path is exercised indirectly via `set_menu_backend_installs_custom`). Add a `show_context_menu_*` test to close the coverage signal; no source change needed. |
| `subscribeSelect` (backend method, `Menu.ts`) | `subscribe_select` (trait method, `platform.rs`) | In sync — backend trait method, not a package export; preserved verbatim. |
| `popupContextMenu` (backend method) | `popup_context_menu` (trait method) | In sync — naming preserved; returns boxed `Future<Output = Option<String>>` mirroring TS `Promise<string \| null>`. |

## In sync

- `createMenuItemTemplate` ↔ `create_menu_item_template` — defaults preserved (`type: 'normal'`/`Normal`, `enabled: true`). TS `template?: Readonly<Partial<...>>` maps to Rust `template: MenuItemTemplate` + `..template` struct-update spread, idiomatic and faithful.
- `getMenuBackend` ↔ `get_menu_backend` — lazy web-default fallback; "there is always a backend" invariant preserved (Rust uses a `Mutex<Option<Arc<dyn MenuBackend>>>` registry).
- `onMenuSelect` ↔ `on_menu_select` — full type word preserved; returns an unsubscribe closure (`Box<dyn Fn()>` ↔ `() => void`).
- `setApplicationMenu` ↔ `set_application_menu` — `bool` sentinel return preserved (`false` on web).
- `setMenuBackend` ↔ `set_menu_backend` — `null` → `Option<Arc<dyn MenuBackend>>`; pass-`None`-to-revert semantics preserved.
- Sentinel conventions carry across: `Promise<string | null>` → `Option<String>`, `boolean` → `bool`, web backend returns `false`/`None`/no-op rather than throwing.
- **File names track:** TS `menu.ts` ↔ Rust `menu.rs`; both single-module packages.
- The two `rust:conformance` "missing" entries (`createWebMenuBackend`, `showContextMenu`) are accounted for by the [web-relocated functions](../../../rust/conformance.md#web-relocated-functions) clause (menu is listed there: the `*Backend` seam is the conformance unit; verbs are browser-validated). The remaining real gap is the missing `create_web_menu_backend` _constructor_, which the web-relocation clause does not cover.

## Divergence map note

There is no menu-specific entry recording the `createWebMenuBackend` → `WebMenuBackend`-struct (factory-elided) divergence. Either add the `create_web_menu_backend()` function for true 1:1, or add a single map entry covering the `Web*Backend` struct-without-factory pattern shared by `menu`, `shortcut`, and `tray` (so it is auditable drift, not silent). The `menu` row's `2 ⚠️` in the conformance table is otherwise indistinguishable from genuine missing behavior.
