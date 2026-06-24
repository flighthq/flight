---
package: '@flighthq/host-electron'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/host-electron.md
  - source
  - incoming/builder-67dc46d64
---

# host-electron — Review

## Verdict

solid — 90/100. An exemplary host adapter that now fills 16 of Flight's host seams over a hand-curated, `electron`-free `ElectronApi` interface. This bundle closes three of the four real omissions the prior depth review flagged (storage, modal-parent threading, notification close) and fleshes the tray/screen/notification backends out to their full current `@flighthq/types` seam shape. What remains is genuinely cross-package or design-gated (updater richness, renderer-targeted IPC, a handful of `WindowBackend` additions), not within-package neglect.

This is an _adapter_, not a domain library, so the bar is "does it faithfully and exhaustively fill every Flight host seam an Electron main process can serve?" — and against that bar the gap from 90 to authoritative is now small.

## What changed since the prior depth review (verified base→head)

The prior depth review (80/100) named five remediation items. Verified against `incoming/builder-67dc46d64` (base→head):

- **Storage seam — fixed.** `electronStorage.ts` is net-new (`base/` has no such file). `createElectronStorageBackend(electron, fileName = 'storage.json')` is a synchronous file-backed `StorageBackend` over a JSON file in `app.getPath('userData')`, lazily loaded once then memory-resident, all five methods (`getItem`/`setItem`/`removeItem`/`clear`/`keys`) guarded, returning the documented sentinels. It is now registered in `registerElectronBackends` (`setStorageBackend` was absent in `base/electronRegister.ts`). This closes the prior "silently-broken in the main process" latent bug.
- **Modal parent threading — fixed.** `electronDialog.ts` adds `resolveParentWindow(win)` over `getElectronBrowserWindow`; all five dialog methods now thread the optional `parentWindow` to Electron's native dialog. The local `ElectronDialog` interface types the first arg `ElectronBrowserWindow | undefined`, so `undefined` (no parent) is well-typed.
- **Notification close — fixed.** `closeNotification(id)` plus `closeAllNotifications` are implemented over an `id→ElectronNotification` map. `notify` now returns a `string` id (base returned `false`/boolean — a genuine seam type error). The full seam is realized: `getCapabilities`, `getPermission`, `scheduleNotification`/`cancelScheduledNotification` (honest no-ops), `getActive/Pending/LaunchNotifications`, and `subscribeShow/Dismiss/Reply` (reply a documented no-op — Electron has no inline reply).
- **`withWindow` refactor — done.** The ~20 identical `get → guard → try/catch` blocks are collapsed into one `withWindow(windows, win, fn)` helper (`electronWindow.ts`). The file reads cleanly; behavior is preserved. Also new: a `closed`-event cleanup of both side tables, and a re-open guard that destroys a stale `BrowserWindow` before constructing a new one.
- **Updater richness — correctly deferred.** Still built on Squirrel `autoUpdater`; `downloadUpdate` folds into `checkForUpdates`, `subscribeDownloadProgress` is inert. This is design-gated (electron-updater is a second factory + a peer concept) and surfaced as a suggestion, not silently skipped.

## Present capabilities

Sixteen capability backends, each a `createElectron<Cap>Backend(electron: ElectronApi)` factory, plus a one-call `registerElectronBackends(electron, options?)` and the `getElectronBrowserWindow` / `getElectronWindowId` / `getApplicationWindowForElectronId` window-identity escape hatches. Coverage by seam:

- **Window** (`electronWindow.ts`): one `BrowserWindow` per `ApplicationWindow` via a `WeakMap`, plus a reverse `Map<number, ApplicationWindow>` (`_windowsById`) maintained in lockstep. `open` wires every native event (`move`/`resize`/`minimize`/`maximize`/`unmaximize`+`restore`/`enter`+`leave-full-screen`/`focus`/`blur`/`close`/`closed`) back into entity fields and emits the matching signal. Full command surface including the three new methods this bundle adds — `setContentProtection`, `setHasShadow`, `flashWindowFrame` — and the new id↔window resolvers. `getBounds` falls back to entity fields when the window is gone.
- **App**: identity, quit/relaunch/focus, single-instance trio, badge, dock badge/menu/bounce, `subscribeActivate/OpenFile/SecondInstance`.
- **Clipboard**: text/html/rtf/image/bookmark read+write, `hasText`/`hasImage`/`clear`, sentinels on failure.
- **Dialog**: open/openDirectory/save/message/confirm with parent-window threading; `prompt` correctly `null` (unsupported).
- **Menu**: app menu + context-menu popup, recursive template mapping, per-item `click`→`onSelect`.
- **Tray** (`electronTray.ts`): now the **full** `TrayBackend` — `displayBalloon`/`removeBalloon`, `getBounds`, `getCapabilities`, `getTitle`/`getTooltip`, `isDestroyed`, `listIds`, `popUpContextMenu`, `setIcon`/`setPressedIcon`/`setIgnoreDoubleClickEvents`, `setTemplate` (documented best-effort no-op). The subscriber delivers a rich `TrayEventData` payload (bounds, modifier keys, position, drop-files/text) across all 17 Electron tray events.
- **Screen** (`electronScreen.ts`): `getScreens`/`getPrimaryScreen` with `out`-params, new `getCursorPosition(out)` via `getCursorScreenPoint()`, and a `subscribe` that synthesizes structured `ScreenChangeEvent` payloads (`kind`/`screen`/`changedMetrics`) from the raw Electron args. `fillScreenInfo` now populates the full extended `ScreenInfo` (rotation/orientation/refreshRate/colorDepth/physical size/hdr/colorSpace/etc.) from optional Electron display fields, falling back to sentinels.
- **Power** (`electronPower.ts`): status (battery `-1`, charging inferred from AC flag), idle state/time, keep-awake with **two** independently-tracked blocker ids (display-sleep vs app-suspension), suspend/resume, and the new `subscribeLockScreen`/`subscribeUnlockScreen` over `powerMonitor`. `getBatteryHealth`/low-power/thermal honestly return `null`/no-op (main process cannot read them).
- **Notification**, **Shell**, **Protocol**, **Shortcut**, **Platform**, **Updater**, **IPC** as above / per prior review.
- **Module surface** (`electronModule.ts`): `ElectronApi` declares exactly the Electron slice consumed, now including the `fs: ElectronFs` slice (`existsSync`/`readFileSync`/`writeFileSync`) injected for storage, the new window/screen/tray methods, and `ElectronBalloonOptions`. Keeps the package `electron`- and `node:fs`-dependency-free and fake-testable.
- Every source file has a colocated `*.test.ts`; the four window exports each have their own `describe` (exports:check satisfied); `"sideEffects": false`; single root `.` export. 155 `it` cases across the suite.

## Gaps

Honest remaining thin spots, all either cross-package or design-gated (none are within-package neglect):

- **Renderer-targeted IPC.** `electronIpc.ts` `send` no-ops and `invoke` resolves `undefined` — the main side has no `webContents` target. IPC is effectively receive-only. Closing this needs either an `IpcBackend` seam change in `@flighthq/types` (a target-window field) or a window-specific factory (`createElectronIpcBackendForWindow`). Cross-package design decision.
- **Updater fidelity.** Squirrel-only; `subscribeDownloadProgress`/`cancelDownload`/`rollback`/channel-prerelease-differential events are inert. A real `electron-updater`-backed variant is a second factory plus an `ElectronUpdaterApi` peer concept — a design fork (is electron-updater the intended production path?).
- **`WindowBackend` depth.** `setVisibleOnAllWorkspaces`, `setKiosk`, `setRepresentedFilename` (macOS), `setOverlayIcon` (Windows), `setVibrancy`/`setBackgroundMaterial` are absent — each requires extending `WindowBackend` in `@flighthq/types` plus a web no-op. Bounded but cross-package.
- **Power battery detail.** `batteryLevel -1`, `isLowPower false`, `getBatteryHealth null`, thermal `Unknown` — genuine main-process limitations, so the Electron power story is strictly poorer than the web backend on battery. Acceptable, but worth an explicit seam-audit note.
- **Notification web-SW close path.** `closeNotification` here is correct for the main process; the deferred item is a service-worker-backed _web_ notification backend, which lives in the web default, not here.
- **Gold seam-audit table.** No committed table mapping every `@flighthq/types` host seam method to its Electron call or sentinel. Documentation-only but high value for host authors and the natural parallel to the Rust conformance/divergence map.

## Charter contradictions

None. The charter is a stub (only "What it is" is filled; North star / Boundaries / Decisions / Open directions are all `TODO`), so there is no stated principle for the code to contradict. The package faithfully follows the codebase-map host-suite contract it is judged against in the charter's absence: `electron`-free injected `ElectronApi`, `createElectron*Backend` granular factories + one-call `registerElectronBackends`, sentinels-not-throws at the seam, **not** re-exported from `@flighthq/sdk`, `crate: null` (no Rust mirror — correct; Electron's substrate does not exist in the Rust box).

## Contract & docs fit

**Lives up to the contract — strongly.**

- Types come from `@flighthq/types` (`WindowBackend`, `TrayBackend`, `ScreenBackend`, `NotificationBackend`, `StorageBackend`, `PowerBackend`, etc.); the package defines no cross-package types of its own — `ElectronApi`/`ElectronFs`/`ElectronBalloonOptions` are adapter-local Electron-shape interfaces, which is the documented, exemplary design, not a types-layer leak.
- Full unabbreviated names (`createElectronStorageBackend`, `getApplicationWindowForElectronId`); sentinels everywhere (`null`/`''`/`-1`/`[]`/no-op); single root `.` export; `"sideEffects": false`; `out`-params on `getBounds`/`getScreens`/`getCursorPosition`/`getStatus`/`fillScreenInfo`.
- `node:fs` is threaded through `ElectronApi.fs` rather than imported — keeping the package `node:fs`-free per the codebase-map "filesystem out of scope here; a future node-fs injection covers those" line. This is the right reading of that rule and is well-documented in `electronStorage.ts`.

**Candidate doc revisions (user's gate, not the reviewer's):**

- The codebase-map Package Map line for `@flighthq/host-electron` enumerates the realized seams as "window/app/dialog/clipboard/menu/tray/shortcut/screen/power/notification/shell/protocol/updater/ipc" — it now also registers **storage**. The line is stale by one seam; `package.json`'s `description` has the same omission.
- The map says "`filesystem` (node `fs`) are out of scope here — a future `host-capacitor` / a node-fs injection covers those." The node-fs injection has now partially arrived (for storage, via `ElectronApi.fs`). Worth a note that the fs slice exists for storage even though a full `filesystem` backend is still unbuilt.
- `CONTRACT.md` already lists `host-electron` in the `crate: null` set — correct, no change needed.

## Candidate open directions

The charter is a stub; each silence below is a question a direction pass should settle (feeds the charter's Open directions):

- **Exhaustiveness as the North star.** Is the bar literally "every `@flighthq/types` host seam method has an Electron call or a documented sentinel," made mechanical by a committed seam-audit table? That table would also pin down which inert returns are permanent (main-process limits) vs. deferred.
- **Updater path ruling (design fork).** Is `electron-updater` the blessed production updater, warranting a second `createElectronUpdaterAutoBackend` factory with real progress/channel/cancel — or does host-electron stay Squirrel-only and richer updates live elsewhere?
- **Renderer-targeted IPC (cross-package fork).** Extend the `IpcBackend` seam in `@flighthq/types` with a target window, or expose a window-specific factory? This decides whether main→renderer messaging is in scope for this adapter at all.
- **`WindowBackend` completeness boundary.** Are the macOS/Windows-specific window controls (kiosk, vibrancy, represented filename, overlay icon, all-workspaces) in scope for the seam — i.e. should `@flighthq/types` grow them with web no-ops — or are they deliberately out of the cross-platform window contract?
- **Sibling-host symmetry.** The map names `host-tauri`/`host-capacitor` as future siblings. Should host-electron's seam coverage and the audit table be authored as the _template_ every host backend conforms to, so the suite stays symmetric?
