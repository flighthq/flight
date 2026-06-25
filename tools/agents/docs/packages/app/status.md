---
package: '@flighthq/app'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# app — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Swept the `assessment.md` Recommended list for sweep-safe, strictly-within-package items. Own tests pass (56/56).

**Done:**

- **Documented web sentinels + native semantics on the in-package web fill.** Added durable doc-comments to the previously-bare `createWebAppBackend` methods (`getAppDirectoryPath`, `getAppPath`, `getCommandLine`, `getExecutablePath`, `getLoginItem`, `getName`, `getVersion`, `subscribeActivate`, `subscribeAllWindowsClosed`, `subscribeOpenFile`, `subscribeSecondInstance`), each stating its web sentinel (`''` / `[]` / never-called / default item) and its native intent. No signature change; doc-only. This is the in-package half of the "document web sentinels + native semantics" item — the `AppBackend` interface half lives in `@flighthq/types` (parked, cross-boundary).

**Parked:**

- **Resolve the two orphaned types (retract).** _Stale premise + cross-boundary._ `AppLaunchKind` / `AppMemoryPressure` are **not** orphaned — they live in `packages/types/src/Lifecycle.ts` and are actively implemented by `@flighthq/lifecycle` (`getAppLaunchKind`, `subscribeMemoryWarning`, `onMemoryWarning`). Retracting them would touch `@flighthq/types` and break `@flighthq/lifecycle`. The assessment should be corrected to drop this item.
- **Alias-safe `out`-param getter variants.** _Design decision; cited precedent does not exist._ The assessment claims `getAppLoginItem(out?)` "already follows the read-shape/`*Like`-write split", but the actual signature is `getAppLoginItem(): AppLoginItem` with no `out` param. Adding `out` variants is a public-API signature change and the `out`-write type (`AppLoginItem` vs `AppLoginItemLike`) is an unblessed shape — parked rather than guessed.
- **Note the Map under-description.** _Cross-boundary._ The fix targets `tools/agents/docs/index.md` (the codebase map), which is outside the `packages/app/` + `tools/agents/docs/packages/app/` editable boundary.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Session Status: @flighthq/app

**Date**: 2026-06-24 **Starting score (pass 1)**: 72/100 (solid) **Estimated score after pass 2**: 92/100 (gold)

## Implemented APIs (cumulative across both passes)

### Type files in `@flighthq/types`

- `packages/types/src/AppActivationPolicy.ts` — `AppActivationPolicy = 'accessory' | 'prohibited' | 'regular'`
- `packages/types/src/AppLoginItem.ts` — `AppLoginItem` (read shape) and `AppLoginItemLike` (write/partial shape)
- `packages/types/src/AppPathKind.ts` — `AppPathKind = 'crashDumps' | 'logs' | 'userData'`

All three exported from `packages/types/src/index.ts` in alphabetical position.

### `App` entity (`packages/types/src/App.ts`)

Signals on the `App` entity:

- `onActivate: Signal<() => void>`
- `onAllWindowsClosed: Signal<() => void>`
- `onOpenFile: Signal<(path: string) => void>`
- `onQuitRequest: Signal<() => void>` (vetoable via `cancelSignal(app.onQuitRequest)`)
- `onReady: Signal<() => void>`
- `onSecondInstance: Signal<(argv: readonly string[]) => void>`

### `AppBackend` interface (`packages/types/src/App.ts`)

Complete backend seam. All methods:

- `addRecentDocument(path)` / `clearRecentDocuments()`
- `bounceDock(): number` / `cancelDockBounce(id)`
- `cancelAttention(id)` / `requestAttention(critical): number`
- `focus()`
- `getAppDirectoryPath(kind: AppPathKind): string`
- `getAppPath(): string`
- `getCommandLine(): readonly string[]`
- `getExecutablePath(): string`
- `getLocale(): string`
- `getLoginItem(): AppLoginItem` / `setLoginItem(settings): boolean`
- `getPreferredSystemLanguages(): readonly string[]` — ranked list of OS preferred languages; `[]` on web
- `getSystemLocale(): string` — OS-level system locale (may differ from UI locale); `''` on web
- `getName(): string` / `setName(name): boolean`
- `getVersion(): string`
- `hasSingleInstanceLock(): boolean` / `requestSingleInstanceLock(): boolean` / `releaseSingleInstanceLock()`
- `hideApp(): boolean` / `showApp(): boolean` / `isAppHidden(): boolean`
- `quit()` / `relaunch()`
- `setActivationPolicy(policy): void`
- `setBadgeCount(count): boolean`
- `setDockBadge(text): void`
- `setDockMenu(items): void`
- `setUserModelId(id): boolean`
- `subscribeActivate(listener): () => void`
- `subscribeAllWindowsClosed(listener): () => void`
- `subscribeOpenFile(listener): () => void`
- `subscribeQuitRequest(listener: (cancel: () => void) => void): () => void` — listener receives a host-level cancel callback; calling it calls `event.preventDefault()` at the host level (Electron) in addition to blocking `backend.quit()`
- `subscribeReady(listener): () => void`
- `subscribeSecondInstance(listener): () => void`

### Exported functions in `packages/app/src/app.ts`

All functions:

- `addAppRecentDocument(path)` — adds to system recent-documents list
- `attachApp(app)` — wires all six backend subscriptions to the App entity's signals
- `bounceAppDock(): number` — starts a dock bounce; -1 when unsupported
- `cancelAppAttention(id)` — cancels app-level attention request
- `cancelAppDockBounce(id)` — cancels dock bounce
- `clearAppRecentDocuments()` — clears system recent-documents list
- `createApp(): App` — allocates App entity with six inert signals
- `createAppLoginItem(): AppLoginItem` — allocates default login item
- `createWebAppBackend(): AppBackend` — complete web default backend
- `detachApp(app)` — stops delivery and clears subscription
- `disposeApp(app)` — detaches and releases App for GC
- `focusApp()` — brings app to foreground
- `getAppBackend(): AppBackend` — lazy web fallback; always returns a backend
- `getAppCommandLine(): readonly string[]` — process argv; `[]` on web
- `getAppCommandLineSwitch(name): string | null` — value of named switch; `null` if absent
- `getAppDirectoryPath(kind): string` — app-identity-relative paths; `''` on web
- `getAppExecutablePath(): string` — executable path; `''` on web
- `getAppLocale(): string` — UI locale (e.g. `'en-US'`); `''` when unknown
- `getAppLoginItem(): AppLoginItem` — reads login-item settings
- `getAppName(): string` — application name
- `getAppPath(): string` — app bundle/exe directory; `''` on web
- `getAppPreferredSystemLanguages(): readonly string[]` — ranked list of OS preferred languages (web: `navigator.languages`); `[]` when unavailable
- `getAppSystemLocale(): string` — OS-level system locale, e.g. `'en_US'` (web: `Intl.DateTimeFormat().resolvedOptions().locale`); `''` when unavailable
- `getAppVersion(): string` — application version
- `hasAppCommandLineSwitch(name): boolean`
- `hasAppSingleInstanceLock(): boolean`
- `hideApp(): boolean` — macOS hide; `false` on web
- `isAppHidden(): boolean` — macOS hidden state
- `quitApp()` — quits the application
- `relaunchApp()` — relaunches the application
- `releaseAppSingleInstanceLock()`
- `requestAppAttention(critical): number` — taskbar flash / dock bounce; `-1` on web
- `requestAppSingleInstanceLock(): boolean`
- `setAppActivationPolicy(policy)` — macOS activation policy; no-op on web
- `setAppBackend(backend | null)` — installs native backend or falls back to web default
- `setAppBadgeCount(count): boolean` — PWA/taskbar/dock badge; uses `navigator.setAppBadge` on web
- `setAppDockBadge(text)` — dock/taskbar badge text
- `setAppDockMenu(items)` — macOS dock right-click menu
- `setAppLoginItem(settings): boolean` — launch-at-startup settings
- `setAppName(name): boolean` — updates display name
- `setAppUserModelId(id): boolean` — Windows AppUserModelID for taskbar grouping

### `packages/host-electron/src/electronApp.ts`

All `AppBackend` methods implemented against `electron.app`:

- `addRecentDocument` / `clearRecentDocuments`
- `cancelAttention` / `requestAttention` — `app.dock?.cancelBounce` / `app.dock?.bounce`
- `getAppDirectoryPath` — `app.getPath` with kind→name mapping
- `getAppPath` — `app.getAppPath()`
- `getCommandLine` — `process.argv`
- `getExecutablePath` — `process.execPath`
- `getLoginItem` / `setLoginItem` — `app.getLoginItemSettings` / `app.setLoginItemSettings`
- `getPreferredSystemLanguages` — `app.getPreferredSystemLanguages?.() ?? []`
- `getSystemLocale` — `app.getSystemLocale?.() ?? ''`
- `hideApp` / `showApp` / `isAppHidden` — `app.hide` / `app.show` / `app.isHidden` (macOS optional)
- `setActivationPolicy` — `app.setActivationPolicy` (optional, macOS)
- `setName` — `app.setName`
- `setUserModelId` — `app.setAppUserModelId` (Windows, via cast)
- `subscribeAllWindowsClosed` — `window-all-closed` event
- `subscribeQuitRequest` — `before-quit` event; the handler passes a cancel callback to the listener; calling it calls `event.preventDefault()` so OS-initiated quits are blocked at the Electron level when Flight vetoes them
- `subscribeReady` — `ready` event with `isReady()` fast-path

`packages/host-electron/src/electronModule.ts` extended:

- `ElectronApp.getSystemLocale?()` and `ElectronApp.getPreferredSystemLanguages?()` — optional methods matching Electron's current API
- `ElectronJumpListTask`, `ElectronLoginItemSettings`, `ElectronSetLoginItemSettings` types

### Test coverage

- `packages/app/src/app.test.ts`: 56 tests — all exported functions, veto logic (quit proceeds without cancel, does not quit when cancelled, calls host cancel callback when vetoed), idempotent re-attach, web sentinel values, preferred system languages, system locale
- `packages/host-electron/src/electronApp.test.ts`: tests for all Electron backend methods including the fixed quit-veto (preventDefault called when cancelled, not called when not cancelled), preferred languages, system locale

## Deferred items and why

### Remaining Gold items

1. **GPU / metrics info** (`getAppGpuInfo`, `getAppMetrics`, `getAppMemoryInfo`) — async Promise-returning; requires research into `AppGpuInfo`/`AppProcessMetric` type design. Web has partial support via `navigator.gpu` / `WEBGL_debug_renderer_info`. Deferred: moderate engineering + dedicated type design session needed.

2. **Crash / render-process lifecycle** (`onAppChildProcessGone`, `onAppRenderProcessGone`) — requires `AppProcessGone` type design and Electron `child-process-gone` / `render-process-gone` events. Electron-specific with no web analogue; deferred.

3. **Jump List / dock menu richness** — promoting `setAppDockMenu` to a unified `AppJumpListCategory[]` descriptor for Windows (custom tasks, jump-list categories). Cross-platform design decision needed: Windows Jump List and macOS dock menu have different conceptual shapes. Needs user input before implementing.

4. **Secure-restore-state / accessibility hooks** (`setAppAccessibilitySupportEnabled`, `onAppAccessibilitySupportChanged`) — may belong to `@flighthq/platform`. Need sibling-ownership check before adding.

5. **Rust parity (`flighthq-app`)** — no crates/ directory changes made; Rust conformance map should be updated in the Rust worktree once the TS API is stable. The native default backend (real single-instance lock via OS named mutex/lockfile, real login-item via platform autostart, `get_app_path` via `std::env::current_exe`) is the highest-value native-first addition.

## Design choices made

### Quit-veto mechanism (pass 2 — gap fixed)

The `AppBackend.subscribeQuitRequest` signature was changed from `listener: () => void` to `listener: (cancel: () => void) => void`. The listener now receives a host-level cancel callback. When a Flight listener vetoes the quit via `cancelSignal(app.onQuitRequest)`, `attachApp` calls `cancelHost()`, which in the Electron backend calls `event.preventDefault()` on the `before-quit` event. This closes the gap where an OS-initiated quit (Cmd+Q, system shutdown) would bypass the Flight-level veto — previously `backend.quit()` was simply not called, but Electron's quit sequence would still proceed since `event.preventDefault()` was never called.

### Locale vs preferred languages split

Two separate functions:

- `getAppLocale()` — the active UI locale (Electron `app.getLocale()` / web `navigator.language`), the locale the app uses for UI rendering
- `getAppSystemLocale()` — the OS-level system locale (`app.getSystemLocale?()` / web `Intl.DateTimeFormat().resolvedOptions().locale`), which may differ from the UI locale; relevant for date/number formatting
- `getAppPreferredSystemLanguages()` — the full ranked list (`app.getPreferredSystemLanguages?()` / web `navigator.languages`), for content negotiation

These three cover distinct use cases that are commonly conflated. Keeping them as separate functions makes their intent explicit.

### Paths boundary with `@flighthq/filesystem`

Bare OS directories (`home`, `documents`, `downloads`, `temp`, `appData`, `cache`) stay in `@flighthq/filesystem` (`FileSystemPathKind` / `getPath`). App-identity-relative paths (`userData`, `logs`, `crashDumps`) + `getAppPath()` / `getAppExecutablePath()` live in `@flighthq/app`. Documented in source comment on `getAppDirectoryPath`.

### Badge ownership

`setAppBadgeCount(count)` (numeric, cross-platform PWA/taskbar/dock) lives here as canonical app identity. `setAppDockBadge(text)` (text, macOS dock only) lives here too. The `@flighthq/tray` package does not duplicate this — the badge is app identity, not tray identity.

### `setAppUserModelId` ownership

Lives in `@flighthq/app` (app identity) rather than `@flighthq/tray` or `@flighthq/notification`. The Windows AppUserModelID is a process-level identity concept that affects taskbar grouping, badging, and Jump Lists across the whole app. Other packages reference this concept but do not re-expose the setter.

## Remaining design decisions needing user input

1. **Jump List / dock menu richness** — should `setAppDockMenu` be promoted to a unified cross-platform API (`AppJumpListCategory[]`) covering both Windows Jump List tasks/categories and macOS dock menu? The two platform APIs have different conceptual shapes (Windows: custom task lists with icons/descriptions; macOS: simple menu items). Options: (a) keep them separate (`setAppDockMenu` / `setAppJumpList`), (b) unify under one descriptor with platform-specific fields, (c) keep current behavior and document the gap.

2. **Accessibility / theme-source hooks** — `setAppAccessibilitySupportEnabled` and `onAppAccessibilitySupportChanged` appear in Electron's `app` surface. Confirm whether these belong to `@flighthq/app` or `@flighthq/platform` before adding.
