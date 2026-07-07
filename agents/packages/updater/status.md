---
package: '@flighthq/updater'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# updater — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/updater

**Session date:** 2026-06-24 **Starting score:** 72/100 (solid) **Estimated new score:** 92/100

## Implemented APIs

### New types added to `@flighthq/types/src/Updater.ts`

- `UpdaterPhaseKind` — string union `'Idle' | 'Checking' | 'UpdateAvailable' | 'Downloading' | 'Downloaded' | 'Staging' | 'Error'`
- `UpdaterErrorKind` — string union `'Network' | 'Signature' | 'Disk' | 'Cancelled' | 'NotSupported' | 'Unknown'`
- `UpdaterError { kind: UpdaterErrorKind; message: string }` — replaces bare `string` in `onError`
- `UpdateProgress { bytesPerSecond, isDelta, percent, totalBytes, transferredBytes }` — replaces bare `number` in `onDownloadProgress`
- `UpdateInfo` — enriched with `downloadSizeBytes`, `deltaFromVersion`, `isMandatory`, `minimumOsVersion`, `sha512`, `stagedRolloutPercent` (existing `version`, `notes`, `releaseDate` retained)
- `UpdaterState { phase, info, progress, error }` — queryable lifecycle snapshot
- `UpdaterConfig { autoDownload, autoInstallOnAppQuit, allowPrerelease }` — auto-download/install policy
- `UpdaterSignatureConfig { algorithm, publicKey }` — integrity verification configuration
- `AppUpdater` — expanded from 6 to 10 signals: added `onUpdateCancelled`, `onUpdateStaging`, `onUpdateVerified`, `onUpdateRolledBack`
- `UpdaterBackend` — expanded from 7 to 22 methods: added `cancelDownload`, `getChannel`, `getConfig`, `rollback`, `setChannel`, `setConfig`, `setSignatureConfig`, `subscribeUpdateCancelled`, `subscribeUpdateStaging`, `subscribeUpdateVerified`, `subscribeUpdateRolledBack`

### New functions in `@flighthq/updater`

- `cancelAppUpdateDownload()` — delegates `cancelDownload()` to backend (Silver: cancellable downloads)
- `checkAndDownloadAppUpdate()` — checks then conditionally downloads based on `autoDownload` config (Silver: combined convenience)
- `checkForAppUpdate()` — renamed from `checkForUpdates` for naming symmetry (Bronze)
- `createUpdaterConfig()` — allocates `UpdaterConfig` with safe defaults (Silver)
- `createUpdaterState()` — allocates zero/idle `UpdaterState` (Bronze)
- `downloadAppUpdate()` — renamed from `downloadUpdate` for naming symmetry (Bronze)
- `getAppUpdaterState(updater)` — returns per-entity queryable `UpdaterState` (Bronze: the highest-leverage gap)
- `getUpdaterChannel()` — returns active channel string (Silver)
- `getUpdaterConfig()` — returns active config (Silver)
- `isAppUpdateEligible(info, rolloutSeed)` — pure staged-rollout gating helper (Gold)
- `rollbackAppUpdate()` — delegates `rollback()` to backend (Gold)
- `setUpdaterChannel(channel)` — sets channel on active backend (Silver)
- `setUpdaterConfig(config)` — applies config to active backend (Silver)
- `setUpdaterSignatureConfig(config)` — configures signature/integrity verification (Gold)

### Updated `@flighthq/host-electron`

- `createElectronUpdaterBackend` updated to implement the full new `UpdaterBackend` interface
- `toUpdateInfo` updated to return enriched `UpdateInfo` (new fields default to `-1`/`null`/`false`/`''`/`100`)
- `subscribeError` now wraps the Electron error as `UpdaterError { kind: 'Unknown', message }`
- Added no-op stubs for `cancelDownload`, `rollback`, `setSignatureConfig`, `subscribeUpdateCancelled`, `subscribeUpdateStaging`, `subscribeUpdateVerified`, `subscribeUpdateRolledBack` (Squirrel does not expose these natively)
- `electronUpdater.test.ts` fully updated to new API and extended with new test cases

### State Machine

`attachAppUpdater` now maintains per-entity `UpdaterState` in a `WeakMap<AppUpdater, UpdaterState>`. Each backend event updates the state before emitting the signal, so `getAppUpdaterState(updater)` always reflects the latest phase without requiring a listener. The entity/runtime split is a `WeakMap` (not a paired runtime object) since subscription bookkeeping already uses one — this is the minimal approach that avoids new public fields on the entity.

### Test coverage

38 tests in `updater.test.ts` covering:

- `attachAppUpdater`: idempotency, all-10-signals wiring, full state machine phase transitions (Idle→Checking→Available→Downloading→Downloaded→Staging→Error→Idle via cancel/rollback)
- `cancelAppUpdateDownload`, `checkAndDownloadAppUpdate` (both autoDownload paths), `checkForAppUpdate`
- `createAppUpdater` (all 10 signals + initial Idle state), `createUpdaterConfig`, `createUpdaterState`
- `createWebUpdaterBackend` (no-ops, channel/config storage, all subscribe returns)
- `detachAppUpdater` (stops delivery, safe when not attached), `disposeAppUpdater`
- `downloadAppUpdate`, `getAppUpdaterState` (per-entity independence), `getUpdaterBackend`
- `getUpdaterChannel`, `getUpdaterConfig`, `isAppUpdateEligible` (boundary conditions)
- `quitAndInstallUpdate`, `rollbackAppUpdate`, `setUpdaterBackend`, `setUpdaterChannel`
- `setUpdaterConfig`, `setUpdaterFeedUrl`, `setUpdaterSignatureConfig`

## Deferred items

### `@flighthq/updater-formats` (new package)

The maturation roadmap recommends spinning out feed/manifest parsers (`parseUpdaterFeedYaml`, `parseUpdaterFeedJson`, `parseAppcastXml`) as a neighbor package `@flighthq/updater-formats`. This crosses the package boundary (new package with separate `package.json`, `tsconfig.json`, workspace registration). Deferred — requires user confirmation on the new package boundary before proceeding, matching the codebase rule about not creating packages autonomously.

### Rust parity — `flighthq-updater`

The Gold roadmap includes a 1:1 Rust crate mirror. No `crates/` directory exists in this worktree; the Rust port lives in the `rust` worktree. Noted as a gap; requires work in that worktree.

### `host-electron` deeper integration

`createElectronUpdaterBackend` uses Squirrel (built-in Electron autoUpdater), which lacks progress events, cancel, rollback, staging, and verified signals. The Silver roadmap calls for wiring `host-electron` to `electron-updater` (the npm package, not the built-in) to expose channel selection, `autoDownload`, progress, cancellation. This is a `host-electron` task, not an updater task, and requires adding an `electron-updater` dependency there. Noted for the next `host-electron` session.

### Future Gold items not yet implemented

- **Docs** — a package-level usage doc (lifecycle diagram, host registration guide, `host-electron` mapping table). Not implemented; this session prioritized API completeness over documentation.
- A `'Staging'` phase is defined and wired in the state machine but there is no `onUpdateStaging` signal emitted in a visible way through the Squirrel host — Squirrel has no staging event; only electron-updater exposes it. The infrastructure is present; the host must fire it.

## Concerns

- The `UpdaterBackend` interface grew from 7 to 22 methods. Any existing third-party host implementation outside the monorepo would need to add 15 methods (all of which can be no-op stubs for most). This is acceptable pre-release but worth documenting clearly in the `UpdaterBackend` type comment.
- `checkAndDownloadAppUpdate` reads `getUpdaterConfig()` and then calls `checkForUpdates()` and potentially `downloadUpdate()` as two separate backend calls. For a Squirrel-style backend this is fine (both are instant triggers). For an electron-updater backend, the download would ideally start only after the `update-available` event fires — not immediately. The current implementation is a convenience that respects `autoDownload` as a policy flag but does not enforce the sequential flow. A more correct implementation would require the backend to support a `checkAndDownload` method or a callback pattern. This is a known simplification, documented in the function comment.

## Suggestions for future sessions

1. **Wire `host-electron` to `electron-updater`** (Silver completion): add `electron-updater` as a dependency to `@flighthq/host-electron`, create `createElectronUpdaterBackendV2` (or replace the existing one) that maps electron-updater's richer events to the full `UpdaterBackend` contract — particularly `subscribeDownloadProgress`, `subscribeUpdateCancelled`, `setChannel`, `getChannel`, and `cancelDownload`.
2. **`@flighthq/updater-formats`** (Silver completion): confirm the new package boundary with the user, then implement `parseUpdaterFeedYaml` (latest.yml), `parseUpdaterFeedJson` (Tauri manifest), and `parseAppcastXml` (Sparkle appcast) as pure value-in/value-out parsers returning `UpdateInfo[]`.
3. **Rust `flighthq-updater`** (Gold completion): 1:1 crate mirror in the `rust` worktree per the conformance map. `is_app_update_eligible` and the `updater-formats` parsers are the first conformance targets (mixable value-typed leaves).
4. **Package-level docs** (Gold completion): a lifecycle diagram (Idle→Checking→Available→Downloading→Downloaded→Staging→install / Error / Cancelled), host registration guide, and electron-updater mapping table.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` "## Recommended" that fall strictly within `packages/updater/`.

### Done

- **Pinned the `checkAndDownloadAppUpdate` fire-both simplification.** Added a colocated test in `src/updater.test.ts` ("downloads immediately under autoDownload without gating on update-available") asserting that `downloadUpdate` fires in the same call as `checkForUpdates` under `autoDownload: true`, without waiting for a `fireUpdateAvailable` signal. The two pre-existing branch tests (download fires under `true`, only-check under `false`) remain. This locks the documented instant-trigger semantics against silent drift. Own-tests: 39 passed.

### Parked

- **Document the no-op-stub expectation on `UpdaterBackend`.** cross-boundary: the `UpdaterBackend` interface lives in `packages/types/src/Updater.ts`, not `packages/updater/`. The doc comment would have to edit `@flighthq/types`, which is outside the hard boundary.
- **Alphabetize the `UpdaterConfig` interface fields.** cross-boundary: `UpdaterConfig` is also declared in `packages/types/src/Updater.ts`. Reordering its interface fields touches `@flighthq/types`, outside the boundary. (`createUpdaterConfig` in this package already returns the fields alphabetized.)

### Notes

- Did not run `npm run check`, `npm run fix`, `order:fix`, `tsc -b`, or any monorepo-wide command per task constraints. Verification was `npm run test --workspace=packages/updater` only (39/39 pass).
