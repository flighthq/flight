# Maturation Roadmap: @flighthq/app

**Current verdict**: solid — 72/100. A clean, deliberate cell (flat free-function command API + a three-signal event entity over a swappable `AppBackend` with a real web default), complete for its declared scope but short of the canonical Electron-`app`-class surface in identity, paths, lifecycle veto, login-item, and recent-documents.

The package is correctly shaped, so maturation is almost entirely additive: extend the `AppBackend` seam in `@flighthq/types`, implement the web defaults (mostly guarded sentinels), and add the matching flat functions / signals. Nothing here requires reshaping the existing API. Effort estimates are coarse and assume the existing pattern is followed verbatim.

## Bronze

The minimum viable jump from "solid" to "genuinely useful for a real desktop shell." These are the highest-value omissions named by the depth review that have no sibling owner.

- **App-level lifecycle signals (ready + quit veto + all-windows-closed).** Add to the `App` entity in `@flighthq/types`: `onReady: Signal<() => void>`, `onQuitRequest: Signal<(request: AppQuitRequest) => void>` (veto via a `preventAppQuit(request)` mutator on a plain `AppQuitRequest` data object, mirroring `onCloseRequest`/veto in `@flighthq/application`), and `onAllWindowsClosed: Signal<() => void>`. Extend `AppBackend` with `subscribeReady`, `subscribeQuitRequest`, `subscribeAllWindowsClosed`; wire them in `attachApp`. Web backend: `subscribeReady` fires once on the next microtask (DOM is "ready" immediately), the others are inert no-op unsubscribes. This closes the single most glaring lifecycle gap (the app has open/activate events but no ready and no quit veto).
- **Login-item / launch-at-startup.** New `@flighthq/types` data type `AppLoginItem` (`{ openAtLogin: boolean; openAsHidden: boolean; path: string; args: readonly string[] }` — all `Readonly` on read). Flat functions `getAppLoginItem(out?: AppLoginItem): AppLoginItem` and `setAppLoginItem(settings: Readonly<AppLoginItemLike>): boolean` plus `createAppLoginItem()`. Backend methods `getLoginItem`/`setLoginItem`. Web: returns `{ openAtLogin: false, ... }` / `false`. No sibling home exists for this — it belongs here.
- **Standard application paths — boundary decision + the app-specific ones.** First a design call (see Sequencing): general well-known dirs (`home`/`documents`/`temp`/`cache`/`appData`) already live in `@flighthq/filesystem` (`FileSystemPathKind`/`getPath`). App-identity-relative paths do _not_: add `getAppPath(): string` (the app bundle/exe directory) and `getAppExecutablePath(): string` here, and a small `AppPathKind = 'userData' | 'logs' | 'crashDumps'` with `getAppDirectoryPath(kind: AppPathKind): string` for app-name-scoped dirs. Backend method `getAppDirectoryPath` / `getAppPath` / `getExecutablePath`; web returns `''`. Document in source that bare OS dirs are deliberately in `@flighthq/filesystem`.
- **Recent documents.** `addAppRecentDocument(path: string): void`, `clearAppRecentDocuments(): void` (backend `addRecentDocument`/`clearRecentDocuments`; web no-op). Completes the `onOpenFile` + `setAppDockMenu` story (Jump List / macOS recents).

## Silver

Competitive with Electron `app` / Tauri `app`+`process` for common professional desktop use, plus the edge cases a well-regarded library handles.

- **Command-line / argv access.** `getAppCommandLine(): readonly string[]` and a typed `getAppCommandLineSwitch(name: string): string | null` / `hasAppCommandLineSwitch(name: string): boolean` (sentinel `null`/`false`). Backend `getCommandLine`; web returns `[]`. Generalizes the `onSecondInstance(argv)` payload to the launching instance.
- **App metadata writes.** `setAppName(name: string): boolean` and `setAppUserModelId(id: string): boolean` (Windows AppUserModelID — required for correct taskbar grouping, badging, and Jump Lists, so it pairs with Bronze badge/recent-docs). Backend `setName`/`setUserModelId`; web no-op `false`.
- **macOS application visibility.** `hideApp(): void`, `showApp(): void`, `isAppHidden(): boolean`, and app-level `requestAppAttention(critical: boolean): number` / `cancelAppAttention(id: number): void` (distinct from window-level attention; -1 sentinel like dock bounce). Backend methods mirror; web no-op / `false` / `-1`.
- **Activation-policy & background.** `setAppActivationPolicy(policy: AppActivationPolicy)` where `AppActivationPolicy = 'regular' | 'accessory' | 'prohibited'` (macOS `NSApplication` activation policy — controls dock presence for agent/menubar apps). Backend `setActivationPolicy`; web no-op.
- **Open-file/open-url completeness on the event side.** Promote `onOpenFile` to carry a `Readonly<AppOpenFileEvent>` (`{ path; windowId? }`) and add `onActivate` payload `Readonly<AppActivateEvent>` (`{ hasVisibleWindows: boolean }`) — matching Electron's `activate` semantics that gate "create window on dock click." Keep back-compat irrelevant (pre-release).
- **Power/quit ordering hooks.** `onBeforeQuit` vs `onWillQuit` split (Electron distinguishes them: `before-quit` is vetoable, `will-quit` is the point of no return) — fold the Bronze `onQuitRequest` into `onBeforeQuit` and add a non-vetoable `onWillQuit: Signal<() => void>`.
- **Cross-backend consistency tests + an `host-electron` implementation of every new method.** Each new `AppBackend` method needs the Electron adapter (`createElectronAppBackend`) filled and a colocated unit test against a fake backend (`exports:check` requires a test per export).

## Gold

Authoritative / AAA: nothing a desktop-app-shell expert finds missing, exhaustive edge handling, full Rust parity.

- **GPU / feature / metrics info.** `getAppGpuInfo(level: AppGpuInfoLevel): Promise<AppGpuInfo>` (`'basic' | 'complete'`), `getAppMetrics(out?): readonly AppProcessMetric[]` (per-process CPU/memory — Electron `app.getAppMetrics`), and `getAppMemoryInfo()`. Value-typed `AppGpuInfo`/`AppProcessMetric` in `@flighthq/types`. Web: `getAppGpuInfo` can return a minimal object from `navigator.gpu`/WebGL `WEBGL_debug_renderer_info`; metrics return `[]`.
- **Crash + render-process lifecycle.** `onAppChildProcessGone: Signal<(info: Readonly<AppProcessGone>) => void>` and `onAppRenderProcessGone` (Electron `child-process-gone`/`render-process-gone`), with `AppProcessGone` (`{ type; reason; exitCode }`). Web: inert.
- **Full path/locale exhaustiveness.** Complete `AppPathKind` to the Electron set delegated-or-owned per the Bronze boundary decision; add `getAppPreferredSystemLanguages(): readonly string[]` and `getAppSystemLocale()` (distinct from UI locale).
- **Jump List / dock menu richness.** Promote `setAppDockMenu`/recent-docs to a full `AppJumpList` descriptor on Windows (`AppJumpListCategory[]`, custom tasks) unified with the macOS dock menu under one cross-platform `setAppDockMenu`/`setAppJumpList` pair — or document the platform split explicitly.
- **Secure-restore-state, accessibility, and theme-source hooks** where they are genuinely app-level (`setAppAccessibilitySupportEnabled`, `onAppAccessibilitySupportChanged`) — confirm against sibling ownership (`@flighthq/platform`) before adding.
- **Exhaustive error/edge handling + docs.** Every backend method documents its web sentinel and native semantics; alias-safe `out`-param variants for the value-returning getters (`getAppLoginItem(out)`, `getAppMetrics(out)`); a package-level overview doc covering the command-vs-event two-shape model so a cold reader is not surprised.
- **Rust parity — `flighthq-app`.** 1:1 crate: `AppBackend` trait + `set_app_backend`, free functions (`get_app_name`, `request_app_single_instance_lock`, `set_app_login_item`, `get_app_directory_path`, `add_app_recent_document`, …), signal-backed `App` entity, and a native default backend gated behind the `native` cargo feature (real single-instance lock via OS named mutex/lockfile, real login-item via the platform autostart mechanism, real `get_app_path` via `std::env::current_exe`). The web fills live in `flighthq-host-web`. This is where the native-first design pays off: the native app backend is the _production_ default, not a stub. Conformance scenes pair Rust ↔ TS for the value-returning getters.

## Sequencing & effort

Recommended order, with dependencies and decisions to surface.

1. **Decision to surface first (do not implement autonomously): the paths boundary with `@flighthq/filesystem`.** `FileSystemPathKind` already owns `home/documents/desktop/downloads/temp/appData/cache`. Confirm with the user that bare OS dirs stay there and only app-identity-relative paths (`getAppPath`, `getAppExecutablePath`, `userData/logs/crashDumps` scoped by app name) live in `@flighthq/app`. Everything in the Bronze "paths" item is blocked on this; the rest of Bronze is not.
2. **Bronze lifecycle signals + login-item + recent-docs** (low effort, ~1 session): pure additions to `App`/`AppBackend` in `@flighthq/types`, then `app.ts` wiring, web sentinels, and colocated tests. No cross-package dependency except `@flighthq/signals` (already a dep). The `AppQuitRequest`/`preventAppQuit` shape should mirror `@flighthq/application`'s `onCloseRequest` veto exactly — read that file first so the two veto APIs are symmetric.
3. **Bronze paths** once (1) is decided (low effort).
4. **Silver** (moderate): argv/switches, metadata writes (note `setAppUserModelId` is a prerequisite for correct Windows badge/recent-docs from Bronze, so it is higher priority than its tier suggests), visibility, activation policy, and richer event payloads. Each item is a types extension + web default + test. **Every Silver/Bronze backend method must also land in `@flighthq/host-electron`'s `createElectronAppBackend`** — surface this as the real implementation cost; the web defaults are mostly no-ops, so without the Electron adapter these features are inert.
5. **Gold** (high effort, partly research): GPU/metrics, crash lifecycle, jump-list richness, and the `flighthq-app` Rust crate with a real native backend. The Rust native single-instance lock and login-item are genuinely new engineering (no web equivalent to port), so budget separately.

**Cross-package items to flag:**

- Paths boundary with `@flighthq/filesystem` (blocking, above).
- Quit-veto symmetry with `@flighthq/application` (`onCloseRequest`) — keep the data-object + `prevent*` mutator shape identical.
- `setAppUserModelId` interacts with `@flighthq/tray`/`@flighthq/notification` Windows grouping — confirm it is owned here (it is app identity) and referenced, not duplicated, there.
- Accessibility/theme hooks (Gold) may belong to `@flighthq/platform`; verify before adding to avoid double ownership.
- All new exports trigger `npm run exports:check` (test-per-export), `npm run order` (alphabetized exports), and `npm run api` (naming symmetry) gates.
