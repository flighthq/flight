# TS↔Rust Alignment: @flighthq/updater

**Verdict:** Fully in sync — all 11 exports map 1:1 (`npm run rust:conformance`: 11/11, 0 missing), file names track, and conventions (camelCase→snake*case, `Option` for nullable backend, `dispose*\*` teardown verb) are preserved; no drift and nothing to add to the divergence map.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `attachAppUpdater` / `updater.ts` | `attach_app_updater` / `updater.rs` | None |
| `checkForUpdates` / `updater.ts` | `check_for_updates` / `updater.rs` | None |
| `createAppUpdater` / `updater.ts` | `create_app_updater` / `updater.rs` | None |
| `createWebUpdaterBackend` / `updater.ts` | `create_web_updater_backend` / `updater.rs` | None |
| `detachAppUpdater` / `updater.ts` | `detach_app_updater` / `updater.rs` | None |
| `disposeAppUpdater` / `updater.ts` | `dispose_app_updater` / `updater.rs` | None — `dispose_*` teardown verb preserved |
| `downloadUpdate` / `updater.ts` | `download_update` / `updater.rs` | None |
| `getUpdaterBackend` / `updater.ts` | `get_updater_backend` / `updater.rs` | None |
| `quitAndInstallUpdate` / `updater.ts` | `quit_and_install_update` / `updater.rs` | None |
| `setUpdaterBackend(UpdaterBackend \| null)` / `updater.ts` | `set_updater_backend(Option<Arc<dyn UpdaterBackend>>)` / `updater.rs` | None — `null`→`Option` sentinel convention preserved |
| `setUpdaterFeedUrl(url: string)` / `updater.ts` | `set_updater_feed_url(url: &str)` / `updater.rs` | None — `string`→`&str` |
| `createElectronUpdaterBackend` (in `@flighthq/host-electron`, not this crate) | n/a | Not a divergence — host-adapter API; the conformance map routes Electron backend implementations through `host-electron`/host-web validation, not native-core crates. |

## In sync

- **Package→crate name** is identity: `@flighthq/updater` → `flighthq-updater`. No rename, correctly absent from the divergence map.
- **All 11 exported functions** port 1:1 with camelCase→snake_case and full type words intact (`quitAndInstallUpdate` → `quit_and_install_update`, no abbreviation). No missing ports, no extra Rust functions beyond upstream.
- **File names track:** TS `updater.ts` ↔ Rust `updater.rs`; barrel `index.ts` ↔ `lib.rs` re-export the same set.
- **Conventions carry across:** nullable backend `null`↔`Option`, feed URL `string`↔`&str`, `dispose_*` teardown verb. The Rust crate uses a `&AppUpdater` borrow plus a pointer-keyed `SUBSCRIPTIONS` Vec where TS uses a `WeakMap` — an idiomatic GC-vs-arena lowering of the same attach/detach contract, the same shape recorded for other event-entity crates and not a flagged divergence.
- **Backend seam** (`get_*_backend`/`set_*_backend` + web default `WebUpdaterBackend`) matches the documented browser-API-in-`host-web` posture in `conformance.md`; `updater` is explicitly listed there, so the no-op web stub and host-bound verbs are expected conformance work, not native-core gaps.
- **Tests:** every exported function has a colocated Rust test mirroring the TS suite; describe/test ordering follows source order.
