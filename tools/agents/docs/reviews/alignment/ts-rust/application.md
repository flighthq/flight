# TS↔Rust Alignment: @flighthq/application

**Verdict:** Strongly aligned — every shared function maps 1:1 with correct snake_case and full type words; the only divergences are the documented web-relocation of browser-only functions and a small set of Rust-only structural helpers (signals split, native default backend, single-frame entry) that are sound but currently undocumented in the divergence map.

`application` is listed in `WEB_PACKAGES` in `scripts/rust-conformance.ts`, so the script classifies its browser-API-only functions as `web-relocated` (expected, not a gap) per the conformance map's [Web-relocated functions](../../../rust/conformance.md#web-relocated-functions) section. The script only inspects TS→Rust _missing_ functions; it cannot see Rust-only _extra_ functions, so those are judged here.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `attachApplicationExit` / `application.ts` | — | Missing in Rust. Browser-only (`beforeunload`/`pagehide` wiring). Covered by `application` ∈ `WEB_PACKAGES` (`web-relocated`); belongs in `host-web`. Expected, not a gap. |
| `detachApplicationExit` / `application.ts` | — | Same as above — browser exit-wiring teardown, web-relocated. Expected. |
| `requestApplicationFullscreen` / `window.ts` | — | Missing in Rust. Returns `Promise<void>` over the Fullscreen API (`element.requestFullscreen`). Browser-only; web-relocated. Expected. |
| `exitApplicationFullscreen` / `window.ts` | — | Same — `document.exitFullscreen`, browser-only, web-relocated. Expected. |
| `lockApplicationPointer` / `window.ts` | — | Missing in Rust. Pointer Lock API over an `HTMLElement`. Browser-only; web-relocated. Expected. |
| `createWebWindowBackend` / `window.ts` | `create_native_window_backend` / `window.rs` | **Renamed, not a literal port.** TS builds the _web_ backend (DOM window controls); Rust builds the _native_ no-op/sentinel default that native hosts replace via `set_window_backend`. The substrate differs (`createWeb*` is web-relocated to `host-web`), and Rust needs a headless default floor, so a differently-named function is correct — but this `createWeb*` → `create_native*` rename is **not recorded in the divergence map** and should be. |
| — | `create_application_window_signals` / `window.rs` | **Rust-only.** TS keeps signals on the entity (enabled via the window wiring); Rust splits an `ApplicationWindowSignals` companion out so `ApplicationWindow` stays `Clone`, and exposes a `create_*` for it. Sound Rust-port structural decision; **undocumented** — add to the divergence map. |
| — | `create_native_window_backend` / `window.rs` | See the `createWebWindowBackend` row — this is the Rust replacement, undocumented. |
| — | `run_application_frame` / `application.rs` | **Rust-only.** A single-frame step used by hosts/`flighthq-capture` that drive their own loop (vs `start_application_loop`/`stop_application_loop`, both ported). Reasonable native-host seam; **undocumented** — add to the divergence map. |
| `WindowCloseRequest.cancel` / `window.ts` (veto via `onCloseRequest`) | `WindowCloseRequest::cancel` + `is_cancelled` / `window.rs` | Not free functions — `cancel`/`is_cancelled` are inherent methods on the close-request payload (interior-mutability veto). Picked up by the `pub fn` grep but they are not extra package exports; the TS veto is a callback flag, the Rust shape is a method pair. Aligned in intent. |
| `webApplication.ts`, `webWindow.ts` (empty/web-only files) | (no counterpart .rs) | TS splits web-bound code into `webApplication.ts` / `webWindow.ts`; Rust has no web-relocated files (they belong in `host-web`). Filename non-tracking here is correct given the web-relocation. |

## In sync

- **Package→crate name:** `@flighthq/application` → `flighthq-application` (identity). `Cargo.toml` `description` matches `package.json` verbatim.
- **File basenames track:** `application.ts` ↔ `application.rs`, `window.ts` ↔ `window.rs`.
- **All window command/query verbs map 1:1** with snake*case and full type words preserved: `center_window`, `close_window`, `focus_window`, `hide_window`, `show_window`, `maximize_window`, `minimize_window`, `restore_window`, `open_window`, `request_window_attention`, `request_window_close`, and the full `set_window*\*` family (`always_on_top`, `fullscreen`, `icon`, `maximum_size`, `menu_bar_visible`, `minimum_size`, `opacity`, `parent`, `position`, `progress`, `resizable`, `size`, `skip_taskbar`, `title`), plus `get_window_backend`/`set_window_backend`/`get_window_bounds`.
- **attach/detach event-wiring pairs** all present and symmetric: `attach_window_close`/`detach_window_close`, `..._drop_file`, `..._focus`, `..._fullscreen`, `..._orientation`, `..._render_context`, `..._render_state`, `..._resize`, `..._visibility`.
- **Lifecycle & teardown verbs preserved:** `create_application`, `dispose_application`, `dispose_application_window`, `start_application_loop`, `stop_application_loop` — `dispose_*` correctly chosen (detach-and-release-to-GC) over `destroy_*`.
- **Out-param convention carried:** `compute_window_device_transform(win, out)` and `get_window_bounds(win, out)` take `&mut` out-params, mirroring the TS `out: Matrix` / `out: WindowBounds`.
- **Sentinel convention carried:** `close_window` / `open_window` / `request_window_close` return `bool`, matching the TS sentinel-not-throw rule.

## Divergence-map follow-ups

Add three entries (currently silent drift the script cannot flag):

1. `createWebWindowBackend` → `create_native_window_backend` — rename + substrate flip (web factory web-relocated to `host-web`; Rust ships a native no-op default floor).
2. `create_application_window_signals` (Rust-only) — signals-companion split that keeps `ApplicationWindow` `Clone`.
3. `run_application_frame` (Rust-only) — single-frame step for host-driven / capture loops alongside the ported `start_application_loop`/`stop_application_loop`.
