# TS↔Rust Alignment: @flighthq/screen

**Verdict:** Core seam is faithfully ported and file names track, but two judgment-level drifts exist: the web→native backend-factory rename is correct-by-convention yet unrecorded, and two Rust-only convenience getters (`get_screen_scale_factor`, `get_screen_work_area`) have no TS counterpart and no divergence-map entry.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- | --- |
| `createWebScreenBackend` (`screen.ts`) | `create_native_screen_backend` (`screen.rs`) | Rename, not a 1:1 port. This is **correct** under the documented "ambient default flips web→native" rule (rust/index.md §Host layer: "TS's ambient default backend is web; Rust's ambient default is native/std"). The conformance script classifies `createWebScreenBackend` as `web-relocated` (the "1" in the screen row), so it does not see this as a gap or notice the rename. The web→native backend-factory rename pattern is applied here but is **not recorded as an entry** in the divergence map — it is a cross-cutting convention that should be stated once so the pattern is auditable rather than per-crate folklore. |
| _(none)_ | `get_screen_scale_factor` (`screen.rs`) | **Extra Rust function, no TS export.** Convenience getter over `get_primary_screen().scale_factor`. The TS package description advertises "scale factor" but TS ships no dedicated getter — callers read `ScreenInfo.scaleFactor`. Not in the divergence map's "Rust-only (no TS counterpart)" section (which lists only crates, not function-level additions). Silent drift: either add to TS (upstream is authoritative) or record as an intentional Rust-only helper. |
| _(none)_ | `get_screen_work_area` (`screen.rs`) | **Extra Rust function, no TS export.** Convenience getter returning a freshly allocated `Rectangle` from the primary screen's `work*` fields. Same situation as `get_screen_scale_factor`: the description advertises "work area" but TS exposes it only via `ScreenInfo.workWidth/workHeight`. Undocumented Rust-only addition. |
| `createScreenInfo` (`screen.ts`) | `create_screen_info` (`screen.rs`) | In sync. |
| `getPrimaryScreen` (`screen.ts`) | `get_primary_screen` (`screen.rs`) | In sync; `out` → `&mut ScreenInfo`, returns the same `out`. |
| `getScreenBackend` (`screen.ts`) | `get_screen_backend` (`screen.rs`) | In sync; lazy default install preserved. |
| `getScreens` (`screen.ts`) | `get_screens` (`screen.rs`) | In sync; `ScreenInfo[]` out-array → `&mut Vec<ScreenInfo>`. |
| `onScreenChange` (`screen.ts`) | `on_screen_change` (`screen.rs`) | In sync; returns an unsubscribe closure (TS `() => void` → `Box<dyn Fn() + Send + Sync>`). |
| `setScreenBackend` (`screen.ts`) | `set_screen_backend` (`screen.rs`) | In sync; `ScreenBackend | null`→`Option<Arc<dyn ScreenBackend>>` (null → None). |

## In sync

- **Package→crate name** is identity: `@flighthq/screen` → `flighthq-screen`.
- **File names** track: `screen.ts` ↔ `screen.rs` (same domain basename); `index.ts` barrel ↔ `lib.rs` re-export.
- **Type seam** matches `@flighthq/types` `Screen.ts`: `ScreenInfo` (all 9 fields) and the `ScreenBackend` trait (`get_screens` / `get_primary_screen` / `subscribe`) are ported field-for-field and method-for-method.
- **Convention carry-across is clean** for all eight directly-mapped functions: camelCase→snake_case with full type words preserved (no abbreviation), out-params → `&mut`/`out`-returning borrows, `null` → `Option`/`None` sentinels, lazy "there is always a backend" default-install semantics, and the no-throw sentinel behavior (default backend reports empty screens / leaves `out` untouched, mirroring the web backend under absent `window`).
- The default-backend _behavior_ divergence (web reads `window.screen`; native reports clean sentinels until a host registers) is the expected web→native ambient flip and is consistent with the seam-with-sentinel pattern the docs call out for `screen`.

## Should be added to the divergence map

1. A **function-level Rust-only note** for `get_screen_scale_factor` and `get_screen_work_area` (the current "Rust-only" table is crate-granular only), or — preferred, since TS is authoritative — port these helpers upstream into `@flighthq/screen` so the package description's "scale factor" / "work area" claims are backed by exported getters in both impls.
2. A **recorded statement of the `createWeb*Backend` → `create_native_*_backend` rename convention** (it applies to every `native`-default capability crate, not just `screen`), so the rename reads as policy rather than per-crate drift. The conformance script's `web-relocated` classifier hides this rename from the automated gate, making the doc entry the only place it can be audited.
