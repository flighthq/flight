---
package: '@flighthq/host-electron'
updated: 2026-06-25
basedOn: ../../../../../packages/host-electron/src
---

# host-electron — Seam Audit

A per-method map of every `@flighthq/types` host seam this package implements to its Electron call, or to the documented sentinel where Electron's main process cannot serve the method. This is the in-package parallel to the Rust conformance/divergence map: it is where an inert return is marked as a **permanent main-process limit** versus a **deferred** fill, so a host author can read what is and is not real without tracing the source.

Grounded in the live `packages/host-electron/src` as of `updated`. The factories registered by `registerElectronBackends` are, in registration order: platform, app, window, dialog, clipboard, menu, tray, shortcut, screen, power, notification, shell, protocol, updater, ipc — 15 seams. There is no `storage` factory in this package today; if one is added, add its row here.

Legend for the **Status** column:

- **real** — backed by a genuine Electron call.
- **tracked** — no Electron primitive; the seam keeps its own state so a paired getter is honest (e.g. registered-accelerator set, updater channel/config).
- **limit** — a permanent Electron main-process limitation; the sentinel is the correct, final answer.
- **deferred** — Electron _could_ serve this with more wiring (a second factory, a `webContents` target); inert today, tracked in Backlog.

## platform — `PlatformBackend` (electronPlatform.ts)

| Method | Electron call / sentinel | Status |
| --- | --- | --- |
| `getInfo(out)` | `process.platform`/`arch`/`getSystemVersion()` + `app.getLocale()`; `''`/`'unknown'` fallbacks | real |

## app — `AppBackend` (electronApp.ts)

| Method | Electron call / sentinel | Status |
| --- | --- | --- |
| `addRecentDocument` | `app.addRecentDocument` | real |
| `bounceDock` | `app.dock?.bounce()` ?? `-1` | real (limit off macOS) |
| `cancelAttention` / `cancelDockBounce` | `app.dock?.cancelBounce(id)` | real |
| `clearRecentDocuments` | `app.clearRecentDocuments` | real |
| `focus` | `app.focus` | real |
| `getAppDirectoryPath` | `app.getPath(toElectronPathName(kind))` | real |
| `getAppPath` | `app.getAppPath` | real |
| `getCommandLine` | `[]` (no `app` accessor; lives on `process.argv`, outside the facade) | limit |
| `getExecutablePath` | `app.getPath('exe')` | real |
| `getLocale` / `getSystemLocale` | `app.getLocale` / `app.getSystemLocale` | real |
| `getLoginItem` | `app.getLoginItemSettings()`; `path`/`args` blank (not in Electron settings) | real (partial) |
| `getName` / `setName` | `app.getName` / `app.setName` | real |
| `getPreferredSystemLanguages` | `app.getPreferredSystemLanguages` | real |
| `getVersion` | `app.getVersion` | real |
| `hasSingleInstanceLock` / `requestSingleInstanceLock` / `releaseSingleInstanceLock` | matching `app` calls | real |
| `hideApp` / `showApp` / `isAppHidden` | `app.hide` / `app.show` / `app.isHidden` | real |
| `quit` / `relaunch` | `app.quit` / `app.relaunch` | real |
| `requestAttention` | `app.dock?.bounce(...)` ?? `-1` | real (limit off macOS) |
| `setActivationPolicy` | `app.setActivationPolicy` | real |
| `setBadgeCount` | `app.setBadgeCount` | real |
| `setDockBadge` / `setDockMenu` | `app.dock?.setBadge` / `app.dock.setMenu(...)` | real (limit off macOS) |
| `setLoginItem` | `app.setLoginItemSettings` | real |
| `setUserModelId` | `app.setAppUserModelId` | real |
| `subscribeActivate` / `…AllWindowsClosed` / `…OpenFile` / `…QuitRequest` / `…Ready` / `…SecondInstance` | `app.on(...)` with an unsubscribe that removes the exact handler | real |

## window — `WindowBackend` (electronWindow.ts)

One `BrowserWindow` per `ApplicationWindow`, kept in a `WeakMap`; OS events mutate the entity and emit its signal. Every method no-ops when the window is absent (closed / never opened); risky native calls are wrapped so a destroyed window cannot throw across the seam.

| Method | Electron call / sentinel | Status |
| --- | --- | --- |
| `open` | `new BrowserWindow(options)` + wires move/resize/minimize/maximize/unmaximize/restore/fullscreen/focus/blur/close to entity signals | real |
| `close` | `bw.close()` | real |
| `setTitle` / `setPosition` / `setSize` | `bw.setTitle` / `setPosition` / `setSize` | real |
| `getBounds(out)` | `bw.getBounds()`; falls back to the entity's own fields when unmapped/destroyed | real |
| `minimize` / `maximize` / `restore` | `bw.minimize` / `maximize` / `restore`-or-`unmaximize` | real |
| `focus` / `show` / `hide` / `center` | matching `bw` calls | real |
| `setResizable` / `setAlwaysOnTop` | `bw.setResizable` / `setAlwaysOnTop` | real |
| `setMinimumSize` / `setMaximumSize` | `bw.setMinimumSize` / `setMaximumSize` | real |
| `setFullscreen` | `bw.setFullScreen` | real |
| `setIcon` / `setOpacity` / `setSkipTaskbar` | `bw.setIcon` / `setOpacity` / `setSkipTaskbar` | real |
| `setMenuBarVisible` | `bw.setMenuBarVisibility` | real |
| `setParent` | `bw.setParentWindow(parentBw)` (resolved through the same WeakMap) | real |
| `setProgress` | `bw.setProgressBar` | real |
| `requestAttention` / `flashWindowFrame` | `bw.flashFrame(...)` | real |
| `setContentProtection` | `bw.setContentProtection` | real |
| `setHasShadow` | `bw.setHasShadow` (macOS) | real |

Host escape hatch: `getElectronBrowserWindow(win)` returns the backing `BrowserWindow` (or `null`) so a host app can `loadFile`/`loadUrl` content the seam does not cover. Adapter-only by design.

## dialog — `DialogBackend` (electronDialog.ts)

| Method          | Electron call / sentinel                                  | Status |
| --------------- | --------------------------------------------------------- | ------ |
| `openFile`      | `dialog.showOpenDialog`; `[]` on cancel                   | real   |
| `openDirectory` | `dialog.showOpenDialog` (`openDirectory`); `[]` on cancel | real   |
| `saveFile`      | `dialog.showSaveDialog`; `null` on cancel                 | real   |
| `message`       | `dialog.showMessageBox`                                   | real   |
| `confirm`       | `dialog.showMessageBox` (OK/Cancel)                       | real   |
| `prompt`        | `null` (Electron has no native text-input dialog)         | limit  |

Dialogs are application-modal — the modal-parent window is not threaded through this factory (parent `undefined`).

## clipboard — `ClipboardBackend` (electronClipboard.ts)

Electron's synchronous clipboard adapted to the async contract; reads resolve to `''`/`null`/`false` on failure rather than throwing.

| Method                                     | Electron call / sentinel                                       | Status |
| ------------------------------------------ | -------------------------------------------------------------- | ------ |
| `readText` / `writeText` / `hasText`       | `clipboard.readText` / `writeText`                             | real   |
| `readHtml` / `writeHtml`                   | `clipboard.readHtml` / `writeHtml`                             | real   |
| `readImage` / `writeImage` / `hasImage`    | `clipboard.readImage`/`writeImage` via `nativeImage` data URLs | real   |
| `readRTF` / `writeRTF`                     | `clipboard.readRTF` / `writeRTF`                               | real   |
| `readBookmark` / `writeBookmark`           | `clipboard.readBookmark` / `writeBookmark`; `null` when empty  | real   |
| `readFormat` / `writeFormat` / `hasFormat` | `clipboard.read` / `write` / `has`                             | real   |
| `getFormats`                               | `clipboard.availableFormats`                                   | real   |
| `readItems` / `writeItems`                 | `clipboard.has`/`read` loop / `clipboard.write`                | real   |
| `readFiles` / `writeFiles`                 | `[]` / `false` (no first-class file-list flavor)               | limit  |
| `getChangeCount`                           | `-1` (no change counter)                                       | limit  |
| `subscribeClipboardChange`                 | inert unsubscribe (no clipboard-change event)                  | limit  |
| `clear`                                    | `clipboard.clear`                                              | real   |

## menu — `MenuBackend` (electronMenu.ts)

| Method               | Electron call / sentinel                                                           | Status |
| -------------------- | ---------------------------------------------------------------------------------- | ------ |
| `setApplicationMenu` | `Menu.setApplicationMenu(buildFromTemplate(...))` with per-item `click` → onSelect | real   |
| `popupContextMenu`   | `menu.popup({x,y})`; resolves the clicked id, or `null` only if popup throws       | real   |
| `subscribeSelect`    | sets the single app-menu select listener; unsubscribe clears it                    | real   |

Electron exposes no menu-close event, so a dismissed context menu leaves the Promise unresolved (callers treat a non-resolving Promise as "still open") — this is a seam limit, not a sentinel.

## tray — `TrayBackend` (electronTray.ts)

Trays identified by an opaque numeric id; an id→record map holds the `Tray` plus the title/tooltip/menu Electron cannot read back.

| Method | Electron call / sentinel | Status |
| --- | --- | --- |
| `create` | `new Tray(icon ?? '')` + click/right-click/double-click handlers | real |
| `destroy` | `tray.destroy()` | real |
| `displayBalloon` / `removeBalloon` | `tray.displayBalloon` / `removeBalloon` | real |
| `getBounds` | `tray.getBounds()`; `null` on throw/absent | real |
| `getCapabilities` | static caps (`dropFiles: false`, the rest true) | real |
| `getTitle` / `getTooltip` | record cache (`''` when unknown) | tracked |
| `isDestroyed` | `tray.isDestroyed()`; `true` when absent | real |
| `listIds` | `[...trays.keys()]` | tracked |
| `popUpContextMenu` | `tray.popUpContextMenu(menu, position?)` | real |
| `setContextMenu` | `tray.setContextMenu(buildFromTemplate(...))` | real |
| `setIcon` / `setPressedIcon` | `tray.setImage` / `setPressedImage` | real |
| `setIgnoreDoubleClickEvents` | `tray.setIgnoreDoubleClickEvents` | real |
| `setTemplate` | no-op (template-ness is a `nativeImage` property, not a live tray toggle) | limit |
| `setTitle` / `setTooltip` | `tray.setTitle` / `setToolTip` (+ record cache) | real |
| `subscribe` | sets the single tray event listener; unsubscribe clears it | real |

## shortcut — `ShortcutBackend` (electronShortcut.ts)

| Method | Electron call / sentinel | Status |
| --- | --- | --- |
| `register` | `globalShortcut.register`; synthesizes the `ShortcutEvent` | real |
| `unregister` / `unregisterAll` | `globalShortcut.unregister` / `unregisterAll` (always `true`; Electron returns void) | real |
| `isRegistered` | `globalShortcut.isRegistered` | real |
| `getRegistered` | tracked accelerator set (Electron exposes no enumeration) | tracked |
| `setEnabled` | `false` (no per-accelerator enable toggle) | limit |
| `setAllEnabled` | no-op (no enable/disable toggle; must unregister/re-register) | limit |

## screen — `ScreenBackend` (electronScreen.ts)

| Method | Electron call / sentinel | Status |
| --- | --- | --- |
| `getScreens(out)` | `screen.getAllDisplays()` + `getPrimaryDisplay().id` into `out` | real |
| `getPrimaryScreen(out)` | `screen.getPrimaryDisplay()` | real |
| `getCursorPosition(out)` | `screen.getCursorScreenPoint()` | real |
| `subscribe` | wires `display-added`/`display-removed`/`display-metrics-changed` to one listener as `ScreenChangeEvent` | real |

## power — `PowerBackend` (electronPower.ts)

| Method | Electron call / sentinel | Status |
| --- | --- | --- |
| `getStatus(out)` | `powerMonitor.onBatteryPower` infers charging; `batteryLevel`/`chargingTime`/`dischargingTime` `-1`, `isBatteryLow`/`isLowPower` `false`, `thermalState` `'Unknown'` | real (battery detail is a limit) |
| `getBatteryHealth` | `null` (no main-process battery-health detail) | limit |
| `getSystemIdleState` / `getSystemIdleTime` | `powerMonitor.getSystemIdleState` / `getSystemIdleTime` | real |
| `isKeepAwakeActive` | `blockerId >= 0` | tracked |
| `setKeepAwake` | `powerSaveBlocker.start('prevent-display-sleep')` / `stop(id)` | real |
| `subscribe` | `on-battery`/`on-ac` | real |
| `subscribeLockScreen` / `subscribeUnlockScreen` | `lock-screen` / `unlock-screen` | real |
| `subscribeResume` / `subscribeSuspend` | `resume` / `suspend` | real |
| `subscribeThermalStateChange` | `thermal-state-change` | real |
| `subscribeLowPowerModeChange` | inert unsubscribe (no low-power-mode event) | limit |

Battery level/health/low-power are permanent main-process limits — the Electron power story is strictly poorer than the web backend on battery, by Electron design, not neglect.

## notification — `NotificationBackend` (electronNotification.ts)

Live notifications keyed by their resolved id so `close*` can dismiss them.

| Method | Electron call / sentinel | Status |
| --- | --- | --- |
| `notify` | `new Notification(...)`.show(); returns the id, or `''` when `!isSupported()` | real |
| `requestPermission` / `getPermission` | `'granted'`/`'denied'` from `Notification.isSupported()` (no prompt) | real |
| `isSupported` | `Notification.isSupported()` | real |
| `getCapabilities` | static caps (`actions: true`, the rest false) | real |
| `closeNotification` / `closeAllNotifications` | `n.close()` over the live map | real |
| `getLaunchNotification` | `null` (no launch-from-notification reporting) | limit |
| `getActiveNotifications` | `[]` (no enumeration of shown notifications) | limit |
| `getPendingNotifications` / `scheduleNotification` / `cancelScheduledNotification` | `[]` / `''` / no-op (no local scheduling) | limit |
| `updateNotification` | `false` (no in-place update; close and re-notify) | limit |
| `subscribeClick` / `subscribeAction` / `subscribeDismiss` / `subscribeShow` | `Notification` `click`/`action`/`close`/`show` events | real |
| `subscribeReply` | inert unsubscribe (no inline text-reply action) | limit |

## shell — `ShellBackend` (electronShell.ts)

| Method | Electron call / sentinel | Status |
| --- | --- | --- |
| `openExternal` | `shell.openExternal`; `false` on throw | real |
| `openPath` | `shell.openPath` (`''` success) → `true` | real |
| `openPathResult` | `shell.openPath` (raw `''`-or-error string) | real |
| `showItemInFolder` | `shell.showItemInFolder` | real |
| `moveToTrash` / `moveItemsToTrash` | `shell.trashItem` (per-path for the batch) | real |
| `readShortcutLink` / `writeShortcutLink` | `shell.readShortcutLink` / `writeShortcutLink` (Windows `.lnk`; `null`/`false` elsewhere) | real (limit off Windows) |
| `beep` | `shell.beep` | real |

## protocol — `ProtocolBackend` (electronProtocol.ts)

| Method                           | Electron call / sentinel                                          | Status  |
| -------------------------------- | ----------------------------------------------------------------- | ------- |
| `register` / `setAsDefault`      | `app.setAsDefaultProtocolClient`                                  | real    |
| `unregister` / `removeAsDefault` | `app.removeAsDefaultProtocolClient`                               | real    |
| `isRegistered` / `isDefault`     | `app.isDefaultProtocolClient`                                     | real    |
| `getRegisteredSchemes`           | tracked scheme set (no Electron enumeration)                      | tracked |
| `getLaunchUrl`                   | `null` (cold-start link arrives via `open-url`/`second-instance`) | limit   |
| `drainPendingUrls`               | `[]` (no pre-attach buffer; links arrive live)                    | limit   |
| `subscribe`                      | `app.on('open-url')` → `(url)`                                    | real    |

## updater — `UpdaterBackend` (electronUpdater.ts)

Backed by Electron's built-in `autoUpdater` (Squirrel), which conflates check+download and emits no progress event. Channels, config, signature, cancel, rollback, staging, and verification are electron-updater concepts the built-in updater lacks.

| Method | Electron call / sentinel | Status |
| --- | --- | --- |
| `setFeedUrl` | `autoUpdater.setFeedUrl({url})` | real |
| `checkForUpdates` | `autoUpdater.checkForUpdates` | real |
| `downloadUpdate` | `autoUpdater.checkForUpdates` (built-in auto-downloads on check) | real (folded) |
| `quitAndInstall` | `autoUpdater.quitAndInstall` | real |
| `cancelDownload` | no-op (no cancelable download) | deferred (electron-updater) |
| `rollback` | no-op (cannot roll back an installed update) | deferred (electron-updater) |
| `getChannel` / `setChannel` | tracked field (no built-in channel switch) | tracked |
| `getConfig` / `setConfig` | tracked field (built-in always auto-downloads) | tracked |
| `setSignatureConfig` | no-op (verifies via OS code-signing chain) | limit |
| `subscribeChecking` / `…UpdateAvailable` / `…UpdateNotAvailable` / `…UpdateDownloaded` / `…Error` | matching `autoUpdater` events | real |
| `subscribeDownloadProgress` | inert (built-in emits no progress event) | deferred (electron-updater) |
| `subscribeUpdateCancelled` / `…RolledBack` / `…Staging` / `…Verified` | inert (no such concept in the built-in updater) | deferred (electron-updater) |

## ipc — `IpcBackend` (electronIpc.ts)

The main-process side: it can receive from renderers but cannot send/invoke without a `webContents` target.

| Method      | Electron call / sentinel                                  | Status                           |
| ----------- | --------------------------------------------------------- | -------------------------------- |
| `subscribe` | `ipcMain.on(channel, …)`; unsubscribe removes the handler | real                             |
| `send`      | no-op (main→renderer needs a specific `webContents`)      | deferred (renderer-targeted IPC) |
| `invoke`    | resolves `undefined` (no invoke target on the main side)  | deferred (renderer-targeted IPC) |

## Permanent limits vs. deferred — summary

- **Permanent main-process limits** (the sentinel is the final answer): app `getCommandLine`, dock operations off macOS, dialog `prompt`, clipboard files/change-count/change-event, menu dismissal-close, tray `setTemplate`, shortcut enable toggles, power battery level/health/low-power, notification launch/active/pending/scheduling/update/reply, protocol launch-url/pending, updater `setSignatureConfig`.
- **Deferred** (Electron could serve with more wiring, tracked in `assessment.md` Backlog): renderer- targeted IPC `send`/`invoke`; the updater's progress/cancel/rollback/staging/verification surface (an electron-updater-backed second factory).
