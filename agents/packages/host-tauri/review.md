---
package: '@flighthq/host-tauri'
status: solid
score: 76
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# host-tauri -- Review

## Verdict

`solid` -- **76/100**. A well-shaped Tauri v2 host adapter that faithfully instantiates the host-electron pattern: injected `TauriApi` (zero `@tauri-apps/*` dependencies), file-per-capability layout, a single `registerTauriBackends` entry point returning a typed `TauriHost`, and honest empty groups for every capability Tauri does not cover. Recent rework (2026-08-30) brought shortcut, notification, and shell adapters to the explicit-slot model the charter prescribes. 64 tests pass across 11 files, with respectable fake-based depth. The remaining distance is housekeeping (a naming inconsistency, a duplicate dependency, a duplicated test block, a missing Entity wrapper), two charter-named coverage targets without a dated Decision excluding them (store, deep-link), and checkbox/radio menu item support Tauri provides but the adapter does not model.

## Present capabilities

Fifteen exported functions across 10 adapter files plus the aggregator, totaling ~1,340 lines of source and ~1,370 lines of colocated tests (2,712 lines total including both).

- **`registerTauriBackends(tauri, profile)`** (`tauriRegister.ts`, 129 lines) -- returns a `TauriHost<Profile>` Entity with capability groups for every Host slot. Groups with no Tauri equivalent (accessibility, connectivity, graphics, input, ipc, media, midi, net, power, protocol, screen, share, storage, text, ui, updater) are honestly empty `{}`. Each covered group installs Entity providers from the per-file adapters below. The return type is statically typed through `Has*` intersection types, enforcing at compile time which capabilities the Tauri host claims.

- **`createTauriAppCapabilities(tauri)`** (`tauriApp.ts`, 33 lines) -- seven Entity-backed slots: `locale` (locale/preferredSystemLanguages/systemLocale), `name`, `version`, `hide`, `show`, `quit` (via `process.exit(0)`), `relaunch`. Name, version, and locale are prefetched asynchronously at construction time and cached for synchronous reads -- empty strings until resolved, matching the async-to-sync bridge pattern documented in the `TauriApi` type.

- **`createTauriClipboardBackend(tauri)`** (`tauriClipboard.ts`, 40 lines) -- `readText`, `writeText`, `hasText`, `clear` over `plugin-clipboard-manager`. Returns Entity. Error paths return sentinels (`''`, `false`). Other clipboard vectors (HTML, RTF, image, files) are structurally absent from the host, not stubbed.

- **`createTauriDirectoryOpenDialogBackend`, `createTauriFileOpenDialogBackend`, `createTauriFileSaveDialogBackend`, `createTauriMessageDialogBackend`** (`tauriDialog.ts`, 169 lines) -- four dialog backends. File-open maps Tauri's `open()` to `FileDialogHandle` entities via `createFileDialogHandle` from `@flighthq/dialog/contract`. Save maps `defaultName` to Tauri's `defaultPath`. Filters flatten Flight's `accept` map to Tauri's `extensions` array. Outcomes are discriminated: `cancelled`, `selected`, `security-denied` (classified from error name/code), `runtime-unavailable` (when `dialog.open` is not a function), and domain-specific failures. Abort signal is respected pre-call and tolerated mid-call. Message backend delegates `message` and `confirm` to Tauri's dialog plugin; `question` kind maps to `info` (Tauri has no question kind). No `prompt` backend (Tauri lacks native text-input dialogs -- documented). The three file dialog backends return `& Entity`; `createTauriMessageDialogBackend` does not wrap in `createEntity` (see Issues).

- **`createTauriMenuBackends(tauri)`** (`tauriMenu.ts`, 108 lines) -- returns `{ application, popup, select }` as three separate Entity-backed slots. `setApplicationMenu` kicks off an async build-then-`setAsAppMenu`, optimistically returns `true`. `popup` resolves with the clicked item id or `null` on build failure. `select` provides a `subscribe`/unsubscribe listener pattern. Menu items are built recursively through Tauri's async factories (`Menu.new`, `MenuItem.new`, `Submenu.new`, `PredefinedMenuItem.new`). Destroy releases JS state only -- cannot synchronously clear the native menu.

- **`createTauriNotificationCapabilities(tauri)`** (`tauriNotification.ts`, 81 lines) -- Entity with three sub-capabilities: `delivery` (permission check, field validation, `sendNotification` via the plugin, auto-generated ids), `lifecycle` (terminal `destroy`), `permission` (async `getPermission`/`requestPermission` mapping `default`/`denied`/`granted`). Rejected fields (anything beyond `body`, `icon`, `id`, `title`) are reported as `invalid-request` with the specific field names.

- **`createTauriPlatformBackend(tauri)`** (`tauriPlatform.ts`, 38 lines) -- fills a `PlatformInfo` out-parameter from `plugin-os`. Maps Tauri platform strings to `PlatformName` (windows, macos, linux, ios, android, unknown). `runtime: 'tauri'`, `kind: 'desktop'`, `isTouch: false`. Locale is async, prefetched once at construction.

- **`makeTauriShellCapabilities(tauri)`** (`tauriShell.ts`, 52 lines) -- three Entity providers: `external` (openUrl), `pathOpen` (openPath with error message preservation), `pathReveal` (revealItemInDir). Trash, shortcut-link, and beep are structurally absent. All providers satisfy `Omit<*Backend, typeof EntityRuntimeKey>` with `createEntity`.

- **`createTauriShortcutQueryBackend(tauri)`, `createTauriShortcutTriggerBackend(tauri)`** (`tauriShortcut.ts`, 69 lines) -- two independent Entity providers. Query delegates `isRegistered` to the plugin. Trigger maintains a `Map<ShortcutTriggerSubscription, Accelerator>` ledger: registrations enter only after native acquisition settles; `Pressed` events are filtered (so one press fires once); `unsubscribe` releases the native registration by exact token; `destroy` awaits pending acquisitions, attempts every teardown, and throws the first error while retaining failed obligations for retry. This is the 2026-08-30 rework from the prior ambient backend model.

- **`createTauriWindowBackend(tauri)`** (`tauriWindow.ts`, 219 lines) -- 24 operations plus `attach`. `open` adopts the current webview window (`getCurrentWindow`) with `host` ownership, applies options, and wires four Tauri event listeners (`onMoved`, `onResized`, `onFocusChanged`, `onCloseRequested`) to the entity's fields and signals. `attach` supports both `host` and `flight` ownership; idempotent for the same handle/ownership pair; rejects a second entity on the same native handle. `close` detaches and, for `flight`-owned windows, calls `handle.close()` fire-and-forget. `getBounds` reports mirrored entity fields (Tauri's position/size APIs are async). All control methods (`setTitle`, `minimize`, `maximize`, `restore`, `focus`, `show`, `hide`, `center`, `setResizable`, `setAlwaysOnTop`, `setMinimumSize`, `setMaximumSize`, `setFullscreen`, `setIcon`, `setSkipTaskbar`, `requestAttention`, `setContentProtection`, `flashWindowFrame`, `setHasShadow`) route through a guarded `run` helper that swallows rejections.

- **`createTauriTrayCapabilities(tauri, profile)`** (`tauriTray.ts`, 340 lines) -- the largest adapter. Profile-conditional: Linux gets `{image, lifecycle, menu, menuSelectionEvents, title}`; Windows adds `interactionEvents` and `tooltip`; macOS adds all of those plus `templateImage`. Lifecycle is fully async with correct cancellation (abort-during-pending closes the acquired native icon). Menu operations are generation-tracked to prevent stale builds from installing over newer ones. Interaction events map `Click` (left/right) and `DoubleClick` from Tauri's `TauriTrayIconEvent`. Destroy attempts menu teardown before icon close, retains failed native steps for retry, and reports structured `failures` on partial teardown.

**Type surface** -- `TauriApi` and all related types (`TauriAppModule`, `TauriClipboardManager`, `TauriDialogPlugin`, `TauriGlobalShortcutPlugin`, `TauriMenuModule`, `TauriNotificationPlugin`, `TauriOpenerPlugin`, `TauriOsModule`, `TauriProcessPlugin`, `TauriTrayModule`, `TauriWindowModule`, plus all event, option, and handle types) live in `@flighthq/types/src/TauriApi.ts` (319 lines). This is the coupling surface between Flight and a Tauri host -- documented, minimal, and widened only when a backend needs more.

**Tests** -- 11 colocated test files, 64 tests, all passing. Every adapter has its own test file with a `fakeTauri()` factory. Coverage includes: registration wiring, Entity presence, happy-path delegation, error sentinels, abort signal handling, async acquisition ordering, race conditions (tray menu generation tracking, window attach idempotency, shortcut pending-then-destroy), rejection axis (window close rejection produces no unhandled promise rejection), menu build failure, notification field validation, platform name mapping, shell error message preservation. The tray test suite (9 tests, 257 lines) is particularly thorough, covering cancellation-during-pending, generation-supersession, partial destroy failure with retry, and profile-conditional slot exposure.

## Issues

1. **Naming inconsistency: `makeTauriShellCapabilities` uses `make` prefix.** Every other exported function in the package uses `create` (14 of 15 exports). The codebase convention is `create*` for allocation. This should be `createTauriShellCapabilities`.

2. **Duplicate `@flighthq/entity` dependency in `package.json`.** Lines 41 and 46 both declare `"@flighthq/entity": "*"`. The build warns about the duplicate key.

3. **Duplicate `describe('tauri power slot coverage')` block in `tauriRegister.test.ts`.** Lines 68--76 and 78--86 are byte-for-byte identical, running the same assertion twice under the same describe name.

4. **`createTauriMessageDialogBackend` is the only backend that does not wrap its return in `createEntity`.** It returns a plain `{ message, confirm }` object. The three file dialog backends explicitly return `& Entity` and use `createEntity`; the message backend returns `MessageDialogBackend` without Entity identity. This is a consistency gap.

5. **Duplicated menu-building logic.** `buildTrayItems` in `tauriTray.ts` (lines 280--310) is near-identical to `buildItems`/`buildItem` in `tauriMenu.ts` (lines 76--108). Both recursively handle separator/submenu/leaf through the same Tauri menu factories with the same structure. This could share a single implementation.

## Gaps

Calibrated against the charter's North star, Decisions, and Boundaries.

1. **Store and deep-link adapters absent without a Decision.** The 2026-07-11 Decision names "store/deep-link" in the Tauri v2 coverage target. The 2026-08-21 Decision supersedes the web-default clause and establishes "uncovered seams have no implementation." The 2026-08-30 Decision explicitly records updater as an absent slot. Store (`plugin-store`) and deep-link (`plugin-deep-link`) are in the same position as updater -- Tauri v2 plugins that exist but are not wired -- but neither has a dated Decision recording the exclusion. Either build them or add a Decision.

2. **Checkbox/radio menu items silently degrade.** `MenuItemTemplate.type` includes `'checkbox' | 'radio'` with a `checked` field. Tauri v2 has `CheckMenuItem`. `buildItem` in `tauriMenu.ts` and `buildTrayItems` in `tauriTray.ts` model only separator/submenu/leaf, so checked items become plain items and `checked` is silently dropped.

3. **Window `setProgress` absent.** Tauri v2 has `window.setProgressBar`. The window backend does not include this operation, unlike host-electron.

4. **App lifecycle subscriptions absent.** `subscribeQuitRequest` could map to the current window's `onCloseRequested`. `plugin-single-instance` and `plugin-deep-link` could supply second-instance and deep-link events. All are absent; the group is empty.

5. **Seam-coverage audit table** (charter Open direction 3) has not been produced. host-electron has a `seam-audit.md` precedent.

6. **No `index.ts` public-lane file.** `index.ts` is `export * from './contract'`, making the `.` and `./contract` lanes identical. This is the common `host-*` pattern and may be intentional, but it means the public lane is not cultivated separately from the contract lane.

## Charter contradictions

None that are violations. One tension:

The 2026-07-11 Decision names store and deep-link as coverage targets. They remain unbuilt, with no dated Decision recording the exclusion (unlike updater, which has the 2026-08-30 Decision). The 2026-08-21 no-no-op supersession explains the posture change but does not explicitly name store or deep-link. This is a procedural gap -- the charter's own Decisions would be cleaner with explicit "absent slot" entries for store and deep-link paralleling updater's.

## Contract and docs fit

**Package-side compliance:**
- `role: host` with `crate: null` -- correct for a TS-only, non-tree-shaken host adapter.
- `sideEffects: false` declared, and the source honors it -- no top-level registration or side effects.
- Injected `TauriApi` pattern: no `@tauri-apps/*` hard dependency; the type lives in `@flighthq/types`.
- Two export lanes (`.` and `./contract`) present, though currently identical.
- File-per-capability layout mirrors host-electron.
- All types in `@flighthq/types` -- no inline exported types in the package.
- `satisfies Omit<*Backend, typeof EntityRuntimeKey>` pattern used consistently for type safety.
- Comment discipline is strong: every empty group and absent slot carries a comment explaining why.

**Candidate docs revisions:**
- The `platform-integration.md` shared principles list does not include `host-tauri` in the "Packages in the suite" enumeration (only `host-electron` is listed under Host).

## Candidate open directions

These are questions the charter does not answer that this review assumed or surfaced:

1. **Store and deep-link: build or exclude by Decision?** Both are Tauri v2 plugins with working APIs. The updater has an explicit "absent slot" Decision. Should store and deep-link get the same treatment, or should adapters be built?
2. **Multi-window:** The current-window-only stance is documented. Should `WebviewWindow` creation be modeled behind `WindowBackend.open` when options request a new window, or is single-window permanent for Tauri?
3. **IPC over Tauri events:** Charter Open direction 2 -- Tauri's `event`/`invoke` channel as the `ipc` seam backend. Same design question as host-electron. Suite-level ruling needed.
4. **Checkbox/radio menu items:** Tauri has `CheckMenuItem`. Should `buildItem` model it, or is the leaf-only approximation intentional? This affects both application and tray menus.
