---
package: '@flighthq/host-electron'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - seam-audit.md
  - platform-integration.md
  - source
---

# host-electron — Review

## Verdict

`solid` — 82/100. A well-structured Electron main-process host adapter covering 16 capability seams through a single explicit `registerElectronBackends` entry point that returns an Entity-backed Host. Per-profile typing (macos/windows/linux) is thorough, the `electron` module is injected (no package dependency), and every source file has a colocated test with fake-Electron fixtures. The package is the exemplary host adapter in the suite. Deductions come from a naming inconsistency (`makeElectronShellCapabilities`), module-level mutable state in the window backend, a duplicate manifest entry, and a handful of known deferred gaps (renderer-targeted IPC, window depth methods).

## Present capabilities

The package contains 17 source files (plus `index.ts` and `contract.ts`) totaling ~2,700 lines of implementation and ~2,600 lines of tests. Every source file has a colocated `.test.ts`.

**Registration entry point** — `registerElectronBackends(electron, options)` (`electronRegister.ts`, 192 lines) constructs all 16 backends and composes them into a single `createEntity({...})` satisfying `ElectronHost<Profile>`. The returned Host is an Entity carrying typed per-profile capabilities via conditional intersection types (`ElectronMacosHost` adds `HasNotificationAction` and `HasNotificationReply`). Empty capability groups (`accessibility: {}`, `connectivity: {}`, `graphics: {}`, etc.) are explicitly present as placeholders.

**Seam adapters** (each with colocated test):

- `electronApp.ts` (160 lines, 7 tests) — Rich per-profile app capabilities. macOS: dock bounce/badge/menu, activation policy, hide/show, open-file event, login item, recent documents. Windows: login item, recent documents, user model id. Linux: badge. Common: quit, relaunch, focus, locale, name, path, version, ready/second-instance/quit-request signals. Throws on missing `app.dock` on macOS profile (justified precondition violation).
- `electronClipboard.ts` (187 lines, 6 tests) — Full clipboard suite: text, HTML, RTF, image (via nativeImage data URLs), bookmark, arbitrary formats, multi-item read/write, clear. Wraps Electron's synchronous clipboard in async contract; reads return `''`/`null`/`false` sentinels on failure.
- `electronDialog.ts` (174 lines, 16 tests) — Four dialog backends: directory open, file open (with multi-selection), file save, message box (including confirm). Returns structured `{outcome}` results with `classifyFailure` mapping `SecurityError`/`EACCES`/`EPERM` to `'security-denied'`. Uses `createFileDialogHandle` from `@flighthq/dialog/contract`.
- `electronIpc.ts` (22 lines, 5 tests) — Receive-only `ipcMain.on(channel, handler)` with per-subscription cleanup. Deliberately omits `send`/`invoke` (documented deferred item; each needs a `webContents` target).
- `electronMenu.ts` (68 lines, 7 tests) — Three shared-state backends: `application` (set/destroy application menu), `popup` (context menu resolving clicked id), `select` (single listener closure shared with application menu). Provider lifecycle via `destroy()` that releases the OS menu.
- `electronMenuTemplate.ts` (79 lines, 3 tests) — Recursive Flight-to-Electron template mapper with role normalization (`toggleFullscreen` to `togglefullscreen`, `helpMenu` to `help`). Strips unknown vendor roles.
- `electronNotification.ts` (214 lines, 7 tests) — Full notification suite with per-platform profiles. macOS adds `action` and `reply` event backends. Delivery publishes only after native `show` event. Entity-pinned close via `bindNotificationClose`. Provider-level `destroy()` attempts all closes, retries failures. Field validation rejects Darwin-only `actions` on non-macOS.
- `electronPlatform.ts` (31 lines, 3 tests) — Writes into caller-owned `out` parameter from `process.platform`/`arch`/`getSystemVersion()` and `app.getLocale()`. Falls back to `''`/`'unknown'` sentinels.
- `electronPower.ts` (173 lines, 13 tests) — Seven power slots: battery health (sentinel-only), change (on-battery/on-ac), idle (state + time), keep-awake (powerSaveBlocker start/stop), session lock/unlock, status (on-battery inference), suspension (suspend/resume). Thermal slot conditionally present only when `getCurrentThermalState` is a function. Battery level/health detail is a permanent main-process limit.
- `electronProtocol.ts` (42 lines, 5 tests) — Protocol registration/unregistration with tracked scheme set. Default protocol client query. Open-url subscription.
- `electronScreen.ts` (143 lines, 5 tests) — Query (primary screen, all screens with `out` parameter, cursor position) and change subscription (display-added/removed/metrics-changed). Rich `ScreenInfo` with orientation inference, color space normalization, DPI calculation.
- `electronShell.ts` (116 lines, 9 tests) — Six explicit capability slots: beep, external (openExternal), pathOpen (openPath), pathReveal (showItemInFolder), trash (trashItem), shortcutLink (Windows-only, read/write via readShortcutLink/writeShortcutLink). Platform-conditional construction.
- `electronShortcut.ts` (60 lines, 6 tests) — Query (`isRegistered`) and trigger (subscribe/unsubscribe/destroy) backends. Opaque Entity tokens pin native accelerator ownership. Provider `destroy()` attempts all unregistrations, continues after failure.
- `electronStorage.ts` (148 lines, 11 tests) — File-backed JSON storage in Electron's userData directory. Atomic write via temporary file + rename. Lazy load with in-memory cache. Error classification: `EACCES`/`EPERM` to `'security-denied'`, `EDQUOT`/`ENOSPC` to `'quota-exceeded'`.
- `electronTray.ts` (422 lines, 10 tests) — Entity-keyed tray management with per-platform capabilities. Common: lifecycle (create/destroy), image, tooltip, menu, bounds, interaction events, popup. macOS: drop events, pressed image, template image, title, double-click policy. Windows: balloon display/remove, balloon events. Rich signal emission for interaction, menu selection, balloon, and drop events.
- `electronUpdater.ts` (138 lines, 18 tests) — Squirrel-backed updater with single-transaction model. Feed URL is immutable construction policy. One awaited check owns its private native event listeners. Downloaded handle is frozen Entity with origin-pinned install. Provider `destroy()` settles in-flight transactions and removes only owned listeners. Strongest test coverage in the package.
- `electronWindow.ts` (450 lines, 18 tests) — Full window backend: open, close, attach (external BrowserWindow), plus 20 window operations (title, position, size, bounds, minimize, maximize, restore, focus, show, hide, center, resizable, always-on-top, min/max size, fullscreen, icon, opacity, skip-taskbar, menu bar, parent, progress, attention, content protection, shadow). Native events wire back to entity fields + signals. Three escape-hatch exports: `getApplicationWindowForElectronId`, `getElectronBrowserWindow`, `getElectronWindowId`.

## Gaps

Gaps a mature Electron host adapter would fill, grounded in the seam-audit and status:

1. **Renderer-targeted IPC** — `send`, `invoke`, and `handle` are absent. The main process can only receive. Each needs a `webContents` target or a request/response pair, making this a cross-package seam decision (may require extending `IpcBackend` in `@flighthq/types`). Documented deferred item in status and seam-audit.
2. **Window depth methods** — `setVisibleOnAllWorkspaces`, `setKiosk`, `setRepresentedFilename` (macOS), `setOverlayIcon` (Windows), `setVibrancy`/`setBackgroundMaterial` are absent from both source and `@flighthq/types`. Documented in status.
3. **Dialog modal-parent threading** — All four dialog factories pass `undefined` for the parent window parameter. A dialog attached to a BrowserWindow is an Electron feature the seam does not yet expose.
4. **Context menu dismissal detection** — Electron exposes no menu-close event. A dismissed popup context menu leaves its Promise unresolved. This is a permanent Electron limitation, not a deferred item, but it means callers cannot distinguish a dismissed menu from one that is still open.
5. **Empty Host capability groups** — `accessibility`, `connectivity`, `graphics`, `input`, `media`, `midi`, `net`, `share`, `text`, `ui` are all `{}` on the returned Host. These represent seams that either have no Electron main-process equivalent or have not yet been wired.

## Charter contradictions

No contradictions found against the stated charter principles. The charter explicitly defines this as "an adapter, not a domain library: it owns no capability semantics of its own, only the translation between a Flight seam and an Electron API call." The implementation implements this faithfully: every adapter translates a Flight seam to an Electron call or returns a documented sentinel.

One observation that approaches but does not cross the line: `electronWindow.ts` holds module-level mutable state (`_windows`, `_windowRecords`, `_windowsById` WeakMaps/Map) that functions reach for without argument injection. The charter does not explicitly prohibit this (it addresses the package's role, not its internal structure), and the codebase-map explicit dependency model says "no module-scoped mutable state that functions reach for." The window backend uses it because the `WindowBackend` interface requires free-function methods that must resolve an `ApplicationWindow` to its `BrowserWindow`, and the mapping is inherently stateful. A `resetElectronWindowBackendForTest()` export exposes this for tests.

## Contract and docs fit

### How well the package lives up to the contract

- **Two export lanes** — Correct. `index.ts` re-exports `./contract`; `contract.ts` re-exports all 17 adapter modules. `package.json` exports both `.` and `./contract`.
- **`sideEffects: false`** — Declared and upheld. No top-level registration, no import side effects.
- **Types in `@flighthq/types`** — All types imported from `@flighthq/types/contract`. No exported type definitions in this package.
- **Full unabbreviated function names** — Followed throughout. `createElectronClipboardBackend`, `createElectronDirectoryOpenDialogBackend`, `registerElectronBackends`, etc.
- **Sentinels not throws** — Consistently applied. Clipboard returns `''`/`null`/`false`; dialogs return `{outcome}` objects; shell returns `{reason}` objects. The one throw is `electronApp.ts:82` (`throw new Error('Electron macOS app capabilities require app.dock')`) which is a precondition violation (API misuse: requesting macOS profile without dock).
- **`out` parameters** — Used in platform (`getInfo(out)`), screen (`getPrimaryScreen(out)`, `getScreens(out)`, `getCursorPosition(out)`), and power (`getStatus(out)`, `getBatteryHealth(out)`).
- **No `@flighthq/sdk` import** — Confirmed.
- **Entity-backed returns** — `registerElectronBackends` returns `createEntity({...})`. Most individual backends also return `createEntity(...)`.
- **`crate: null`** — Correctly declared; no Rust mirror.

### Issues

- **Duplicate `@flighthq/entity` dependency** — `package.json` lines 41 and 43 both list `"@flighthq/entity": "*"`. Harmless (JSON last-key-wins), but a manifest hygiene issue.
- **`makeElectronShellCapabilities` naming inconsistency** — Every other factory function in the package uses the `create*` prefix (`createElectronClipboardBackend`, `createElectronAppCapabilities`, etc.). `makeElectronShellCapabilities` (`electronShell.ts:19`) is the sole `make*` function. The codebase-map specifies `create*` for allocation functions. This should be `createElectronShellCapabilities`.
- **Module-level mutable state in `electronWindow.ts`** — Three module-scoped variables (`_windows`, `_windowRecords`, `_windowsById`) are mutated by `attachElectronWindow`/`detachElectronWindow` and read by every window method. While structurally justified (the `WindowBackend` interface requires stateless free functions that need shared state), this is the explicit dependency model's "module-scoped mutable state that functions reach for" pattern that the codebase-map discourages.
- **`_windowsById` is a `Map`, not a `WeakMap`** — Unlike `_windows` and `_windowRecords` which are `WeakMap`s, `_windowsById` (`Map<number, ApplicationWindow>`) holds strong references to `ApplicationWindow` entities keyed by numeric Electron id. Entries are removed in `detachElectronWindow`, but a closed-event race or missed detach would leak.
- **Missing `@flighthq/window` dependency** — `electronWindow.ts` imports from `@flighthq/application/contract` (`notifyWindowClosed`) but there is no `@flighthq/window` package. This is consistent with the current architecture where window functionality lives in `@flighthq/application`, but the package map lists `window` as a separate entity in the Host slot list. The manifest correctly declares `@flighthq/application` as a dependency.

### Candidate contract/docs revisions

- The Package Map in `AGENTS.md` lists the platform suite's host backends as "outside `@flighthq/sdk`" which is correct and enforced by `scripts/sdk-policy.ts`. No revision needed.
- The `host-electron` seam-audit (`seam-audit.md`) is thorough and up-to-date as of 2026-08-30. Its status accurately reflects the source.

## Test assessment

Every source file has a colocated test. Total: ~134 test cases (describe + it blocks) across 17 test files. Tests use fake-Electron fixtures (injected module stubs) to exercise adapter logic without a real Electron runtime. Coverage highlights:

- **Strongest**: `electronUpdater.test.ts` (18 cases) — tests concurrent checks, partial attach failure rollback, sibling teardown retry, provider destroy settlement, frozen metadata.
- **Strongest**: `electronWindow.test.ts` (18 cases) — tests open/close/attach, event wiring (move/resize/minimize/maximize/restore/fullscreen/focus/blur/closed), escape hatches, ownership semantics.
- **Adequate**: `electronDialog.test.ts` (16 cases), `electronPower.test.ts` (13 cases), `electronStorage.test.ts` (11 cases), `electronTray.test.ts` (10 cases).
- **Thinner**: `electronPlatform.test.ts` (3 cases), `electronMenuTemplate.test.ts` (3 cases), `electronRegister.test.ts` (3 cases). These test the happy path and basic profile switching but have fewer edge-case scenarios.

## Candidate open directions

Questions the charter does not answer that this review had to assume:

- **Window backend state management** — Whether the module-level `WeakMap`/`Map` approach for window-to-BrowserWindow mapping should be replaced with an injected state container to align with the explicit dependency model, or whether the current approach is the accepted host-adapter exception.
- **Host capability group coverage** — Whether the ten empty capability groups on the returned Host (`accessibility`, `connectivity`, `graphics`, `input`, `media`, `midi`, `net`, `share`, `text`, `ui`) represent intentional scope boundaries or deferred work. Some (like `graphics` and `input`) may not have meaningful Electron main-process equivalents; others (like `net` and `media`) might.
- **Dialog parent window** — Whether dialog backends should accept an optional `ApplicationWindow` parameter to produce modal dialogs attached to a specific BrowserWindow, or whether application-modal (no parent) is the intended design.
