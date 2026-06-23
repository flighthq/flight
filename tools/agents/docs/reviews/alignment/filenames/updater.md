# Filename Alignment: @flighthq/updater

**Verdict:** Clean. This is a single-implementation platform-suite domain (a swappable-backend _event_ capability), not a backend-variant package, so no backend prefix applies; its lone source file `updater.ts` names the domain and passes the folder-removal test.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/index.ts` — thin barrel (`export * from './updater'`); conventional package entry, not a dumping ground.
- `src/updater.ts` — names the domain/object. Holds the whole `updater` cell: the `AppUpdater` entity (`createAppUpdater`/`attachAppUpdater`/`detachAppUpdater`/`disposeAppUpdater`), the lifecycle commands (`checkForUpdates`/`downloadUpdate`/`quitAndInstallUpdate`/`setUpdaterFeedUrl`), and the backend seam (`getUpdaterBackend`/`setUpdaterBackend`/`createWebUpdaterBackend`). A bare `updater.ts` is self-describing without the folder. No single-function naming, no generic name.
- `src/updater.test.ts` — colocated test, mirrors `updater.ts` exactly.

Note: the package has a swappable `UpdaterBackend` (web default in-package; native via `host-electron`'s `createElectronUpdaterBackend`), but it is the canonical owner of the `updater` domain — not one of the `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` backend-variant renderer packages — so the prefix-first backend-token rule does not apply.
