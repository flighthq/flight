---
package: '@flighthq/host-tauri'
status: solid
score: 72
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# host-tauri — Review

## Verdict

`solid` — **72/100**. A faithful instantiation of the host-electron adapter template: injected `TauriApi` (no `@tauri-apps/*` dependency), file-per-capability layout, a one-call `registerTauriBackends`, honest sentinels for everything Tauri lacks, and consistently documented async→sync bridges. Ten seams are registered where host-electron registers sixteen; the charter's own target list names three more (updater, store/storage, deep-link) that are absent, checkbox/radio menu items silently degrade, and test depth is thin relative to the sibling.

## Present capabilities

Ten seam adapters + aggregator, each `createTauri*Backend(tauri)` exported individually (`packages/host-tauri/src/`):

- **`registerTauriBackends(tauri)`** (`tauriRegister.ts`) — installs platform, app, window, dialog, clipboard, menu, tray, shortcut, notification, shell; documents that storage/protocol/updater/ipc/power/screen stay on web defaults (a Tauri app runs in a webview, so e.g. localStorage keeps working).
- **`TauriApi`** (`tauriModule.ts`, 304 lines) — the local structural type of the exact Tauri v2 surface used, with an aggregation example, per-module doc comments, and the `Menu.new`-as-quoted-method modeling of Tauri's async static factories. This is the ElectronApi pattern, done thoroughly.
- **platform** (`tauriPlatform.ts`) — clean sync map over `plugin-os` (sync in v2), out-param fill, `runtime: 'tauri'`.
- **app** (`tauriApp.ts`) — name/version prefetch-and-cache (async→sync bridge, `''` until resolved), quit/relaunch via `plugin-process`, hide/show, locale via os; the desktop-extras (dock, recent documents, badge, login item, single-instance, lifecycle subscriptions) all report contract sentinels with per-method comments.
- **window** (`tauriWindow.ts`) — adopts the current webview window, applies `WindowOptions`, wires `onMoved`/`onResized`/`onFocusChanged`/`onCloseRequested` back onto the entity + signals (the electron pattern), fire-and-forget commands with swallowed rejections, `getBounds` from mirrored entity fields (async position unreadable synchronously), `flashWindowFrame` → informational attention.
- **dialog** (`tauriDialog.ts`) — open/save/message/confirm with real host paths in `FileDialogHandle`s, filter mapping, kind fallback (`question`→`info`), honest `prompt` → null (no Tauri text-input dialog), message → single-button acknowledgement.
- **clipboard** (`tauriClipboard.ts`) — text + clear + hasText over `plugin-clipboard-manager`; HTML/RTF/bookmark/formats/files/image/change-counter all sentinel-ed with reasons (Tauri's image crosses as an `Image` object, not a data URL).
- **menu** (`tauriMenu.ts`) — async build-then-install for `setApplicationMenu` (optimistic true), `popupContextMenu` resolving the clicked id or null, single `subscribeSelect` listener; recursion over separators/submenus/leaves.
- **tray** (`tauriTray.ts`) — sync numeric-id `create` adopting the async `TrayIcon` handle on settle, per-record title/tooltip mirrors for read-back, click/double-click/right-click mapping, context-menu build, capability report; balloon/bounds/pressed-icon sentinel-ed.
- **shortcut** (`tauriShortcut.ts`) — optimistic local `Set` mirror with rollback on async rejection, `Pressed`-only filtering so one press fires once, enable toggles sentinel-ed.
- **notification** (`tauriNotification.ts`) — permission prefetch + `requestPermission` mapping, fire-and-forget `notify` minting ids (Tauri returns no handle → close/update/enumerate honestly sentinel-ed), full `getCapabilities` false-report.
- **Tests** — 11 colocated files, 44 cases, fake-`TauriApi` based (register wiring, adapters' happy paths and key sentinels).

## Gaps

1. **Chartered target seams unbuilt.** The charter's North star names **updater** (`plugin-updater`), **storage** (`plugin-store`), and **protocol/deep-link** (`plugin-deep-link`) in the coverage target ("map a seam only where a genuine Tauri call exists"). Genuine Tauri calls exist for all three; none is adapted. Storage at least has the sync-seam/async-plugin mismatch host-capacitor documented for preferences (and a working webview localStorage default) — but the register comment claims intent without recording *that* reason; updater and deep-link have no web-default equivalent that actually functions in a Tauri app, so those seams currently degrade to inert web sentinels.
2. **Checkbox/radio menu items degrade silently.** `MenuItemTemplate.type` includes `'checkbox' | 'radio'` with `checked` (`types/src/Menu.ts`), and Tauri has `CheckMenuItem`; `buildItem` (`tauriMenu.ts`) models only separator/submenu/leaf, so checked items become plain items and `checked` is dropped — in both menu and tray menus.
3. **Window surface under-uses Tauri.** `setProgress` is a no-op though the comment itself names `setProgressBar` as available; multi-window creation (`WebviewWindow`) is explicitly out of scope (documented) but the single-window stance is a real functional gap vs host-electron.
4. **App lifecycle subscriptions all inert.** `subscribeQuitRequest` could map to the current window's `onCloseRequested`; second-instance/deep-link events exist via `plugin-single-instance`/`plugin-deep-link` (the file comment defers them to "the app"). Sentinels are honest, but several have reachable Tauri calls.
5. **Test depth.** 44 cases across 11 adapters (host-electron's suite is substantially deeper); untested behaviors include shortcut rollback-on-rejection, tray early-method no-ops before handle adoption, window event wiring beyond the basics, and menu popup rejection → null.
6. **Seam-coverage audit table** (charter Open direction 3) — not yet produced; host-electron's cell has a `seam-audit.md` precedent.

## Charter contradictions

One tension, not a violation: the **[2026-07-11] "Desktop seam subset"** Decision lists window/app/dialog/clipboard/notification/shell/menu/tray/updater/os/shortcut/store/deep-link as "the coverage target", while the shipped register covers ten and leaves updater/store/deep-link to web defaults. The Decision's "where it maps cleanly" qualifier makes this defensible for store (sync/async mismatch), but updater and deep-link map as cleanly as, say, shortcut does. Either build them or append a dated Decision recording why they are out.

## Contract & docs fit

- **Package side**: `host-*` shape honored — `crate: null`, injected API, no `@tauri-apps` dep, not in the sdk barrel, `sideEffects: false`, single root export, per-capability files mirroring host-electron, granular `createTauri*Backend` exports. Comment discipline is exemplary: every sentinel carries its why. Clean.
- **Docs side — candidate revisions**: `agents/packages/map.md`'s host-electron entry still says "Future siblings: `host-tauri`, `host-capacitor`" — stale, both exist. Neither host package appears in `agents/index.md`'s Package Map "Host backends" line (only host-electron). Both docs are owed entries.

## Candidate open directions

1. Updater/deep-link adapters: build now against `plugin-updater`/`plugin-deep-link`, or append the Decision that they are app-side concerns? (The web defaults for these seams are non-functional in Tauri, unlike storage.)
2. Multi-window: keep the current-window-only stance permanently, or model `WebviewWindow` creation behind `WindowBackend.open` when options request a new window?
3. The `ipc` seam over Tauri `event`/`invoke` (charter Open direction 2) — same fork host-electron flagged; needs a suite-level ruling.
