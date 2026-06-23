# Depth Review: @flighthq/app

**Domain**: Application/process-layer host integration — application identity, lifecycle control, single-instance locking, dock/taskbar badging, and OS-level app events. This is the "what the running application _is_ to the OS" layer, sitting above a single window (windowing lives in `@flighthq/application`) and orchestrating the desktop-app shell concerns that Electron's `app` module, Tauri's `app`/`process` APIs, and NW.js cover.

**Verdict**: solid — 72/100

The package is a clean, deliberate cell: a flat free-function API over a swappable `AppBackend`, an event entity (`App`) of three signals, a complete web default backend, and a `set*Backend` seam for native hosts. For the scope the Package Map declares, it is essentially complete and well-shaped. It scores below "authoritative" only because the _canonical_ desktop-application-layer domain (the Electron `app` surface is the de-facto reference) includes a meaningfully larger set of identity, lifecycle, path, and login-item concerns that are absent here — some legitimately delegated to sibling packages, but several genuinely missing from the app-layer with no obvious home.

## Present capabilities

Identity:

- `getAppName()`, `getAppVersion()`, `getAppLocale()` — read-only identity, sentinel `''` when unknown.

Lifecycle control:

- `quitApp()`, `relaunchApp()`, `focusApp()`.

Single-instance:

- `requestAppSingleInstanceLock()`, `releaseAppSingleInstanceLock()`, `hasAppSingleInstanceLock()`, and the `onSecondInstance(argv)` signal — the full lock+notify quartet, which is the centerpiece of single-instance apps.

Dock / taskbar:

- `setAppBadgeCount(count)` (returns `false` when unsupported; wired to `navigator.setAppBadge` on web — the canonical badge home, explicitly moved off `tray`).
- `setAppDockBadge(text)`, `setAppDockMenu(items)`, `bounceAppDock()` / `cancelAppDockBounce(id)` (macOS dock affordances; `-1`/no-op on web).

App events (entity of signals):

- `createApp()` / `attachApp()` / `detachApp()` / `disposeApp()` lifecycle; `onActivate`, `onOpenFile(path)`, `onSecondInstance(argv)`.

Backend seam:

- `getAppBackend()` (lazy web default), `setAppBackend(backend|null)`, `createWebAppBackend()`. The web backend correctly guards every API behind `typeof` checks and returns sentinels rather than throwing, matching the platform-suite contract.

The shape is correct, idiomatic to the SDK (command + event capability blended into one cell, exactly as the Package Map prescribes), tree-shakable, side-effect-free, and the web backend is a genuine working implementation, not a stub of no-ops. Test coverage (44 cases / 328 lines for ~25 exports) is proportionate.

## Gaps vs an authoritative application-layer library

Measured against the canonical desktop-app-layer surface (Electron `app` as the reference, plus Tauri/NW.js), the following are absent. Several are reasonably _missing-by-design_ (delegated to siblings); others are _missing-by-omission_ with no clear owner.

Likely missing-by-design (delegated, acceptable but worth confirming):

- **Custom URI scheme / deep-link** (`setAsDefaultProtocolClient`, `onOpenURL`) → owned by `@flighthq/protocol`.
- **Auto-update** (`checkForUpdates`, lifecycle) → `@flighthq/updater`.
- **Inter-process messaging** → `@flighthq/ipc`.
- **OS notifications** → `@flighthq/notification`. **Power/keep-awake** → `@flighthq/power`. **App active/inactive/background, resume/pause** → `@flighthq/lifecycle`.

Missing-by-omission (no obvious sibling owner; these are app-identity/lifecycle concerns):

- **Standard application paths** — Electron's `app.getPath('userData' | 'appData' | 'temp' | 'logs' | 'cache' | 'downloads' | 'documents' | 'home')` and `app.getAppPath()`. This is one of the most-used parts of the canonical surface. `@flighthq/filesystem` is noted as owning "standard directory paths," so this _may_ be delegated — but app-relative paths (appData/userData/exe) are conventionally an app-identity concern, and the boundary should be stated.
- **Login-item / launch-on-startup** — `setLoginItemSettings` / `getLoginItemSettings` (open at login, hidden launch). A core desktop-app feature with no home in the suite.
- **`onReady` / `whenReady` and a `before-quit` / `will-quit` veto** — the app exposes `onActivate` / `onOpenFile` / `onSecondInstance` but has no ready signal and no quit-veto. Window-close-with-veto exists (`onCloseRequest` in `@flighthq/application`); an app-level quit veto is the natural analogue and is absent.
- **`onAllWindowsClosed`** — the classic cross-platform quit-decision hook.
- **Recent-documents** — `addRecentDocument` / `clearRecentDocuments` (Jump List / macOS recents), a natural companion to `onOpenFile` and `setAppDockMenu`.
- **`setName` / app metadata writes**, `getCommandLine` / `argv` access beyond the second-instance payload, and **GPU/feature info** (`getGPUInfo`) — lower priority, but part of the exhaustive surface.
- **App-level theme/accent** is owned elsewhere, but **`requestAttention` at the app level** (vs the window) and **macOS `hide`/`show`/`isHidden`** application visibility are app-layer affordances absent here.

Naming the highest-value omissions concisely: standard application paths, login-item settings, an `onReady`/ready signal, a quit veto, and recent-documents. These are what separate "solid" from "authoritative" in this domain.

## Naming / API-shape notes

- Names are consistent and self-identifying: every export carries the full `App`/`AppDock` type word (`bounceAppDock`, `setAppDockMenu`, `requestAppSingleInstanceLock`). No abbreviations. Good alphabetization in source.
- `setAppBadgeCount` (numeric, cross-platform PWA/taskbar) vs `setAppDockBadge` (text, dock-specific) is a clean and correct split, and the comment documenting the badge's relocation from `tray` is exactly the kind of boundary note the project wants.
- The entity quartet `createApp`/`attachApp`/`detachApp`/`disposeApp` matches the event-capability pattern used by `@flighthq/application`'s window wiring; `attachApp` being idempotent (tears down a prior subscription first) is a nice touch.
- One minor asymmetry: identity, control, lock, and dock are all flat module functions reading from `getAppBackend()`, while events are entity-bound. This is the documented two-shape pattern (command + event), so it is intentional, not a defect — but a reader meeting the package cold sees two interaction models in one file.
- `getAppBackend()` lazily constructs the web backend, so there is genuinely "always a backend"; sentinels (`''`, `false`, `-1`, no-op) are used correctly throughout rather than throws. Fully aligned with the suite contract.

## Recommendation

Keep the verdict at **solid**. The declared scope is implemented cleanly and the web backend is real, not a placeholder — this is not a stub. To reach **authoritative** for the application/process-layer domain, prioritize:

1. **Standard application paths** (`getAppPath`-style: userData/appData/temp/logs/cache + exe/app dir) — or explicitly document that all of it lives in `@flighthq/filesystem` and that app-relative paths are intentionally there. This is the single biggest gap against the reference surface.
2. **Login-item / launch-at-startup** (`setAppLoginItem` / `getAppLoginItem`) — no current owner.
3. **App-level lifecycle completeness**: an `onAppReady` signal and an `onAppQuitRequest` veto signal (mirroring the existing window `onCloseRequest`), plus `onAllWindowsClosed`.
4. **Recent-documents** (`addAppRecentDocument` / `clearAppRecentDocuments`) to complete the `onOpenFile` + dock-menu story.

Items 2–4 have no sibling home in the documented suite, so they belong here. Item 1 needs a boundary decision with `@flighthq/filesystem` rather than autonomous implementation. Adding these would close the gap to the canonical Electron-`app`-class surface.
