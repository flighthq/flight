---
package: '@flighthq/host-electron'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# host-electron — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/host-electron

**Session date:** 2026-06-24 **Prior score:** 91/100 **Estimated new score:** 95/100

## Implemented APIs

### First pass (Bronze + Silver)

**`withWindow` refactor (electronWindow.ts)**

- Extracted ~20 identical `const bw = _windows.get(win); if (!bw) return; try { … } catch {}` blocks into a single `withWindow(windows, win, fn)` guard helper.
- The window file is roughly half its original size with no behavior change.
- Added `closed` event listener to clean up the `_windows` WeakMap entry after the BrowserWindow is destroyed, preventing stale references.
- Added re-open guard: if `open()` is called on a win that already has a BrowserWindow, the stale one is destroyed first.

**`createElectronStorageBackend(electron, fileName?)` (electronStorage.ts)**

- File-backed synchronous `StorageBackend` over a JSON file in `app.getPath('userData')`.
- Implements all `StorageBackend` methods: `getItem`, `setItem`, `removeItem`, `clear`, `keys`.
- Lazy load: file is read once on first access, then kept in memory.
- `fs` injected via `ElectronFs` interface on `ElectronApi` — consistent with the electron-free design principle.
- Registered in `registerElectronBackends`, fixing the silently-broken storage seam in the main process.
- Colocated test: 6 tests covering all methods, missing-file case, and disk persistence.

**Dialog modal parent threading (electronDialog.ts)**

- `resolveParentWindow(win)` helper using `getElectronBrowserWindow`.
- All five dialog methods thread `parentWindow` through to Electron's native dialog.

**Notification close (electronNotification.ts + types)**

- `closeNotification(id)` added to `NotificationBackend` in types.
- `createElectronNotificationBackend`: tracks shown notifications in a `Map<id, ElectronNotification>` and implements `closeNotification` via `n.close()`.

**`subscribeLockScreen` / `subscribeUnlockScreen` on PowerBackend (electronPower.ts + types)**

- Both are wired to Electron's `powerMonitor` `lock-screen` / `unlock-screen` events.
- The `Power` entity (`@flighthq/power`) has `onLockScreen`/`onUnlockScreen` signals, wired in `attachPower`.
- Web backend returns inert no-ops.
- Tests added in both power package and host-electron.

**`getElectronWindowId` / `getApplicationWindowForElectronId` (electronWindow.ts)**

- `getElectronWindowId(win)`: returns the Electron `BrowserWindow.id`, or `-1` when not mapped.
- `getApplicationWindowForElectronId(id)`: reverse lookup from Electron window id to `ApplicationWindow`.
- Secondary `_windowsById: Map<number, ApplicationWindow>` maintained in lockstep with the WeakMap.

**`registerElectronBackends` options object (electronRegister.ts)**

- Signature: `registerElectronBackends(electron, options?)` with `ElectronBackendOptions { storageFileName?: string }`.

### Second pass (type-error fixes + seam completeness)

**electronWindow.ts: three new WindowBackend methods**

- `setContentProtection(win, enabled)` — delegates to `bw.setContentProtection(enabled)`.
- `setHasShadow(win, hasShadow)` — delegates to `bw.setHasShadow(hasShadow)` (macOS shadow).
- `flashWindowFrame(win)` — calls `bw.flashFrame(true)` to briefly flash the title-bar/frame.
- `ElectronBrowserWindow` interface extended with `setContentProtection` and `setHasShadow` methods.

**electronScreen.ts: getCursorPosition + rich ScreenChangeEvent**

- `getCursorPosition(out)` implemented via `screen.getCursorScreenPoint()`.
- `subscribe` now synthesizes proper `ScreenChangeEvent` payloads (with `kind`, `screen`, and `changedMetrics`) instead of passing the raw Electron listener through.
- `fillScreenInfo` now fills all extended `ScreenInfo` fields (rotation, orientation, refreshRate, colorDepth, pixelDepth, physicalWidth/Height, isHdr, colorSpace, maxLuminance, depthPerComponent, dpi, label, internal, touchSupport, monochrome) — populating from optional Electron display fields or falling back to sentinels.
- `ElectronScreen` interface extended with `getCursorScreenPoint()` and updated listener signature to `(...args: unknown[]) => void`.

**electronTray.ts: full TrayBackend implementation**

- Previous implementation was missing: `displayBalloon`, `getBounds`, `getCapabilities`, `getTitle`, `getTooltip`, `isDestroyed`, `listIds`, `popUpContextMenu`, `removeBalloon`, `setIcon`, `setIgnoreDoubleClickEvents`, `setPressedIcon`, `setTemplate`.
- Subscriber now delivers rich `TrayEventData` payload (with bounds, modifier keys, position, dropFiles/Text) instead of the old broken `(id, type)` signature.
- All Electron tray events wired: click, right-click, double-click, middle-click, mouse-enter, mouse-leave, mouse-move, mouse-up, mouse-down, drag-enter, drag-leave, drop, drop-files, drop-text, balloon-show, balloon-click, balloon-closed.
- `ElectronTray` interface extended with all needed methods.
- `ElectronBalloonOptions` type added to `electronModule.ts`.

**electronNotification.ts: full NotificationBackend implementation**

- Previous implementation returned `boolean` from `notify` instead of `string` (type error).
- Now returns the notification id string (echoes `request.id` when provided, else generates one).
- Added: `cancelScheduledNotification`, `closeAllNotifications`, `getActiveNotifications`, `getCapabilities`, `getLaunchNotification`, `getPendingNotifications`, `getPermission`, `scheduleNotification`, `subscribeDismiss`, `subscribeReply`, `subscribeShow`.
- Multiple listeners per event (listener Sets instead of single slots), matching the full seam.
- `subscribeReply` returns a no-op (Electron does not support inline-reply actions).

### Package/test changes

**electronRegister.test.ts**: `setStorageBackend(null)` already in `afterEach` from first pass.

**electronScreen.test.ts**: Updated to use `fireEvent(event, ...args)` pattern (new listener signature), added `getCursorPosition` test, extended getPrimaryScreen test to check new extended fields.

**electronTray.test.ts**: Rewritten to use new `TrayEventData` subscriber signature; added tests for `getBounds`, `getCapabilities`, `getTitle`, `getTooltip`, `isDestroyed`, `listIds`.

**electronNotification.test.ts**: Rewritten to match new `string` return type; added tests for all new methods: `cancelScheduledNotification`, `closeAllNotifications`, `getCapabilities`, `getPermission`, `scheduleNotification`, `subscribeDismiss`, `subscribeReply`, `subscribeShow`.

**Test count**: 127 → 144 tests, all passing.

## Deferred items and why

**`createElectronUpdaterAutoBackend` (electron-updater variant)** — Requires an optional peer concept (`ElectronUpdaterApi`) and a second factory where `downloadUpdate` and `subscribeDownloadProgress` are real. The built-in `autoUpdater` conflates check+download, so progress is permanently inert. Deferred: requires user confirmation that `electron-updater` is the intended production updater path (vs staying Squirrel-only). This is a non-trivial new factory and a design decision.

**Renderer-targeted IPC (`createElectronIpcBackendForWindow`)** — The main side needs a `webContents` target to send to a specific renderer. Exposing this requires either extending the `IpcBackend` seam in `@flighthq/types` to carry a target window, or exporting a window-specific factory. Cross-package seam change; needs user decision on design direction.

**Window depth additions** — `setVisibleOnAllWorkspaces`, `setKiosk`, `setRepresentedFilename` (macOS), `setOverlayIcon` (Windows), `setVibrancy`/`setBackgroundMaterial` — each requires extending `WindowBackend` in `@flighthq/types` and adding no-ops in the web default. Cross-package changes; each is bounded but requires a types PR.

**Full `electron-updater` fidelity** (Gold) — channel/prerelease/differential-download progress, complete event set. Gated on updater variant decision above.

**Notification close web Service Worker path** — `closeNotification` on web could use `serviceWorker.getRegistration()` + `registration.getNotifications({ tag })` + `n.close()` for a real service-worker close. Current web implementation uses the simple `n.close()` on the in-page `Notification` object, which is correct for the basic (non-SW) web backend. A SW-backed web notification backend would need a different implementation.

**Exhaustive seam audit table** (Gold) — a committed markdown table mapping every `@flighthq/types` host seam method to its Electron call or sentinel. Documentation-only but high value for host authors.

## Concerns or surprises

**Type errors from pre-existing seam evolution**: The `NotificationBackend`, `TrayBackend`, `ScreenBackend`, and `WindowBackend` interfaces in `@flighthq/types` had grown significantly since the original implementation (returning `string` instead of `boolean` from `notify`, the full TrayBackend method set, `getCursorPosition` on ScreenBackend, `setContentProtection`/`flashWindowFrame`/`setHasShadow` on WindowBackend). The `npm run check` type-checking was not catching these because the TypeScript project references hadn't been validated recently. All are fixed in this pass.

**`fire` helper and action listeners**: The `fire<T>` helper in the notification backend is used for single-argument listeners. The two-argument action listener (`(id, actionId)`) uses an inline for-loop instead to avoid a generic wrapper with two params. This is intentional.

**`setTemplate` is a no-op on Electron tray**: Electron does not have a live template-mode toggle — template images are set at construction via `NativeImage.setTemplateImage`. The seam method exists for macOS hosts that may need live switching; Electron hosts should use `setImage` with a pre-flagged NativeImage instead. Documented in the implementation.

**Pre-existing type errors in other packages**: `npm run check` shows type errors in `filters`, `interaction`, `lifecycle`, `scene-gl`, `sdk`, `share`, `statusbar`, `velocity`. These are pre-existing and unrelated to `host-electron`; they were present before this session.

## Design choices made

**Notification id vs tag**: The first pass tracked notifications by `request.tag` (a UX-facing deduplication key). The full `NotificationBackend` seam uses `id` (a stable identifier echoed back from `notify`). This pass aligns the Electron backend with the seam: `notify` returns the notification id (echoes `request.id` when provided, else generates `electron-notif-N`). The `_shown` map is now keyed by id.

**TrayBackend subscriber payload**: Changed from the legacy `(id: number, type: TrayEventType)` two-argument signature to the full `TrayEventData` single-argument payload. This is a breaking change to the subscriber signature but aligns with the current `@flighthq/types` `TrayBackend` interface.

**ScreenChangeEvent synthesis**: The raw Electron screen events carry `(event, display, changedMetrics?)` args. The seam requires a structured `ScreenChangeEvent`. The backend now synthesizes this correctly from the Electron args rather than passing through a bare listener. This means callers get typed, structured events rather than raw Electron callbacks.

## Suggestions for future sessions

1. **`createElectronUpdaterAutoBackend`**: confirm `electron-updater` direction, then implement the injected `ElectronUpdaterApi` factory with real progress events.

2. **Renderer-targeted IPC**: decide on `createElectronIpcBackendForWindow(electron, win)` vs a window field on the `IpcBackend` send/invoke signatures; implement once decided.

3. **Window depth additions**: `setVisibleOnAllWorkspaces`, `setKiosk` — each a small cross-package seam addition; batch these in a single session.

4. **Gold seam audit table**: produce a committed markdown table mapping every `@flighthq/types` host seam method to its Electron call or sentinel, paralleling the Rust conformance/divergence map.

5. **Notification close → web Service Worker path**: implement via `serviceWorker.getRegistration()` + `registration.getNotifications({ tag })` in a dedicated SW-backed web notification backend variant.
