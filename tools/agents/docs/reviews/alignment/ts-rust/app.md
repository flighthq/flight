# TS↔Rust Alignment: @flighthq/app

**Verdict:** In sync — all 20 TS functions port 1:1 (camelCase→snake_case, full type words preserved); the one difference (`createWebAppBackend` → `NativeAppBackend`) is the sanctioned web→native default-backend flip, classified web-relocated by `npm run rust:conformance` (0 real-core gaps).

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createWebAppBackend` (`app.ts`) | `NativeAppBackend` struct + `Default`/`new` (`app.rs`) | Sanctioned divergence, not drift. TS's ambient default backend is web (`createWebAppBackend`); Rust's is native/std (`NativeAppBackend`), per rust/index.md "the one flip from TS". The conformance script counts `createWebAppBackend` as the single **web-relocated** gap (browser-validated in `host-web`), not a real-core gap. No TS↔Rust mapping is broken — the web backend factory is intentionally not ported. **Worth noting:** `app` is not named in rust/index.md line 77's list of native-default-backend crates (filesystem/storage/shell/device/platform/clipboard); the list reads as illustrative, but adding `app`/`application` would remove ambiguity. |
| (general — `native` cargo feature) | `crates/flighthq-app/Cargo.toml` has no `[features]` | rust/index.md line 77 says the in-crate native default backend is "gated behind a `native` cargo feature (off for wasm)". `NativeAppBackend` is compiled unconditionally here. Verified workspace-wide (sibling host-suite crates also omit the feature), so this is a doc-vs-impl mismatch across the suite, not app-specific drift — flag for the doc, not this crate. |
| `index.ts` (barrel) | `lib.rs` (barrel) | Expected Rust barrel convention; not drift. |

All other 19 functions map exactly:

`attachApp`→`attach_app`, `bounceAppDock`→`bounce_app_dock`, `cancelAppDockBounce`→`cancel_app_dock_bounce`, `createApp`→`create_app`, `detachApp`→`detach_app`, `disposeApp`→`dispose_app`, `focusApp`→`focus_app`, `getAppBackend`→`get_app_backend`, `getAppLocale`→`get_app_locale`, `getAppName`→`get_app_name`, `getAppVersion`→`get_app_version`, `hasAppSingleInstanceLock`→`has_app_single_instance_lock`, `quitApp`→`quit_app`, `relaunchApp`→`relaunch_app`, `releaseAppSingleInstanceLock`→`release_app_single_instance_lock`, `requestAppSingleInstanceLock`→`request_app_single_instance_lock`, `setAppBackend`→`set_app_backend`, `setAppBadgeCount`→`set_app_badge_count`, `setAppDockBadge`→`set_app_dock_badge`, `setAppDockMenu`→`set_app_dock_menu`.

## In sync

- **Function set:** 1:1 except the sanctioned `createWebAppBackend` web-relocation. No abbreviated names, no renamed-without-reason, no extra Rust pub fns beyond the documented native-default backend.
- **File names:** `app.ts` ↔ `app.rs` (identical basename); `index.ts` ↔ `lib.rs` (standard barrel). No filename drift.
- **Type/seam layout:** `App` entity and `AppBackend` trait both live in `flighthq-types` (`platform.rs`), matching the TS rule that cross-package types live in `@flighthq/types`. The three signals map exactly: `onActivate`/`onOpenFile`/`onSecondInstance` → `on_activate`/`on_open_file`/`on_second_instance` (payloads `()`, `String`, `Vec<String>`).
- **Conventions carried:** sentinels preserved (`bounceAppDock`/`bounce_app_dock` → `-1`; `setAppBadgeCount`/`set_app_badge_count` → `false`; identity/locale → `""`). Teardown verbs preserved (`disposeApp`→`dispose_app` detaches subscription, no `destroy_*` since nothing owns a non-GC resource). Out-params n/a (no out-param functions in this package). `setAppBackend(null)` → `set_app_backend(None)`.
- **Backend nullability:** TS `_backend: AppBackend | null` lazily creating the web default ↔ Rust `static BACKEND: Mutex<Option<Arc<dyn AppBackend>>>` lazily creating `NativeAppBackend`. Same lazy-default semantics, native target substituted for web.

### Divergence-map note

No new map entry is strictly required — the conformance script already sanctions `createWebAppBackend` via its `WEB_PACKAGES`/`createWeb*` classification, and rust/index.md documents the web→native flip. Two low-priority doc nits to consider: (1) add `app`/`application` to rust/index.md line 77's example list of native-default-backend crates; (2) reconcile the "`native` cargo feature" wording on line 77 with the host-suite crates (incl. this one) that ship the native backend unconditionally with no `[features]`.
