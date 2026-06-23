# Depth Review: @flighthq/host-electron

**Domain:** Electron main-process host adapter — concrete implementations of Flight's platform/host capability seams (`*Backend` traits in `@flighthq/types`) realized over the real `electron` module.

**Verdict:** solid — 80/100

This is an _adapter_ package, not an independent feature library, so the depth bar is different from a domain library like `easing` or `path`. The right question is not "is this an authoritative Electron library" but "does it faithfully and exhaustively fill every Flight host seam an Electron main process can serve?" Measured against that bar, the coverage is broad and the implementations are careful, with a small number of genuine omissions and several documented thin spots.

## Present capabilities

Fifteen capability backends, each a `createElectron<Cap>Backend(electron: ElectronApi)` factory, plus a one-call `registerElectronBackends(electron)` that installs all of them, and a `getElectronBrowserWindow` escape hatch. Coverage by seam:

- **Window** (`createElectronWindowBackend`): the deepest backend. One `BrowserWindow` per `ApplicationWindow` via a `WeakMap` side table; `open` wires every relevant native event (`move`, `resize`, `minimize`, `maximize`, `unmaximize`/`restore`, `enter`/`leave-full-screen`, `focus`/`blur`, `close`) back into the entity fields and emits the matching signal. Full command surface: title, position, size, bounds (with `out`-param + fallback to entity fields when the window is gone), minimize/maximize/restore, focus/show/hide/center, resizable, always-on-top, min/max size, fullscreen, icon, opacity, skip-taskbar, menu-bar visibility, parent, progress bar, attention (`flashFrame`). Every risky native call is wrapped in `try/catch` so a destroyed window can't throw across the seam.
- **App** (`createElectronAppBackend`): name/version/locale, quit/relaunch/focus, single-instance lock trio, badge count, dock badge/menu/bounce/cancel-bounce (no-op/`-1` off macOS), and `subscribeActivate`/`subscribeOpenFile`/`subscribeSecondInstance` with correct Electron `(event, …)` argument adaptation.
- **Clipboard**: text/html/rtf/image (as data URLs via `nativeImage`)/bookmark read+write, `hasText`/`hasImage`, `clear`. Every read returns a sentinel (`''`/`null`/`false`) on failure.
- **Dialog**: open (multi/directory properties), save, message, confirm (synthesized from a message box). `prompt` correctly reports unsupported (`null`) — Electron has no native text-input dialog.
- **Menu**: application menu + context-menu popup, recursive template→Electron mapping, per-item `click`→`onSelect` funneling, submenu recursion.
- **Tray**: id→tray map, icon/tooltip/title/context-menu, click/right-click/double-click events forwarded to a single subscriber.
- **Notification**, **Screen** (`out`-param enumeration, primary detection, all three metrics-change events), **Power** (status, on-battery/on-ac, suspend/resume, keep-awake via a single `powerSaveBlocker` id), **Shell** (openExternal/openPath/showItemInFolder/moveToTrash/beep), **Protocol** (register/unregister/isRegistered/setAsDefault + `open-url`), **Shortcut** (global accelerators), **Platform** (defensive `process` access + Electron locale), **Updater**, **IPC**.
- **Module surface** (`electronModule.ts`): a hand-curated `ElectronApi` interface declaring exactly the Electron slice consumed, keeping the package `electron`-dependency-free and unit-testable with a fake. This is the right design and is well-commented.
- Every source file has a colocated `*.test.ts` (1362 test LOC), `"sideEffects": false`, single root export.

## Gaps vs an authoritative host-adapter library

Honest thin spots, separated into missing-by-design vs missing-by-omission:

Missing by design (correctly scoped out, documented in the codebase map):

- **`filesystem`** — explicitly out of scope ("node `fs` … a future node-fs injection covers those"). Not a gap.
- **Mobile-only seams** (`haptics`, `share`, `statusbar`, `geolocation`, `webcam`, `sensors`, `keyboard`, `device` battery/safe-area, `lifecycle`) — not desktop/Electron-main concerns. Correctly absent.
- **IPC send/invoke**: deliberately inert (no `webContents` target in a generic main-side backend); resolves to the undefined sentinel. Reasonable, but see naming note — this leaves IPC effectively receive-only.

Missing/thin by omission (could be served by Electron but aren't):

- **`storage`** seam (synchronous persistent KV) is _not_ registered, even though Electron main could back it with a file. Today an Electron host silently keeps the web/localStorage default, which does not exist in the main process — so `storage` is effectively broken under this host, not merely deferred. Either implement a file-backed main-process storage backend or document the omission.
- **Updater is shallow**: built on Electron's built-in Squirrel `autoUpdater`, so `downloadUpdate` folds into `checkForUpdates` and `subscribeDownloadProgress` is permanently inert. The comment acknowledges `electron-updater` would expose richer events. For an "authoritative" updater story, a second `electron-updater`-backed factory (or a progress-capable variant) would close this.
- **Dialogs are always application-modal**: the parent window is never threaded through (`window` argument hard-coded `undefined`), so per-window modal dialogs are unreachable even though `getElectronBrowserWindow` makes the mapping available. A real gap given the window side-table already exists.
- **Context-menu dismissal**: `popupContextMenu` never resolves on dismissal (no Electron close event), only on click or throw. Documented, but a leaked-Promise hazard for callers.
- **Power**: `batteryLevel` is hard `-1` and `isLowPower` hard `false` — main process genuinely can't read these, so acceptable, but it means the Electron power story is strictly poorer than the web backend on battery.
- **Notification** has no `close`/update-by-tag path exposed through the seam (the underlying `ElectronNotification.close()` exists in the module type but isn't used).

## Naming / API-shape notes

- Factory naming is uniform and self-identifying: `createElectron<Cap>Backend` returning the typed `*Backend`, matching the documented `createElectron*Backend` granular-use contract and the host-suite seam pattern. `registerElectronBackends` and `getElectronBrowserWindow` read well.
- `ElectronApi` as an explicit local interface (rather than importing `electron`) is exactly the documented design and is the standout shape decision — it documents the precise coupling and keeps the adapter testable.
- The inert IPC `send`/`invoke` are shaped to match the web default's inert shape, which is consistent, but a reader scanning the API would not learn from signatures alone that IPC is receive-only here; this lives only in a comment.
- Window backend's exhaustive per-method `try/catch { /* window already destroyed */ }` is correct but repetitive (≈20 identical blocks); a small `withWindow(win, fn)` helper would cut the file roughly in half without changing behavior. Quality, not depth.
- Backends are alphabetized in `registerElectronBackends`-adjacent files and the barrel; ordering is clean.

## Recommendation

Keep the verdict at **solid (80/100)**. As a Flight host adapter this is broad, faithful, and well-engineered — the window backend in particular is thorough, and the `ElectronApi` injection design is exemplary. To reach authoritative for its (correctly narrow) domain:

1. Decide and act on **`storage`**: either ship a file-backed main-process backend and register it, or explicitly document that Electron apps must register storage separately — the current silent web-default fallthrough is a latent bug.
2. **Thread the modal parent** through dialogs using the existing window map (`getElectronBrowserWindow`), enabling per-window modality.
3. Offer an **`electron-updater`-backed updater variant** (or progress-capable path) so `downloadUpdate`/`subscribeDownloadProgress` are real, not inert.
4. Expose **notification close/update** through the seam (the module type already supports it).
5. Optional polish: extract the window backend's repeated guard into a `withWindow` helper.

None of the above changes the package's role; they close the handful of real omissions that separate "solid adapter" from "exhaustive adapter for everything an Electron main process can serve."
