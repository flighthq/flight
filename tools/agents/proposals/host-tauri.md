---
id: host-tauri
title: '@flighthq/host-tauri'
type: new-package
target: host-tauri
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/host-tauri.md
  - tools/agents/docs/reviews/breadth/application-platform.md
depends_on: []
updated: 2026-06-23
---

## Summary

A second concrete desktop host adapter: a Tauri implementation of Flight's window/app/dialog/clipboard/menu/tray/shortcut/screen/power/notification/shell/protocol/updater/ipc seams, registered in one call (`registerTauriBackends(tauri)`), proving the backend seams are not Electron-shaped and giving a lighter-weight (Rust/WebView) desktop target.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum genuinely useful Tauri host: the same one-call registration as Electron, covering the desktop capabilities a windowed Tauri app reaches for first — window, app identity/control, dialog, clipboard, shell, and the local `TauriApi` seam interface. Shippable, basic, proves the seam works against a real second runtime.

- **`tauriModule.ts` — the `TauriApi` local interface** (the analogue of `ElectronApi`): a structural type covering the precise Tauri JS surface used, so the real `@tauri-apps/api` + plugins satisfy it structurally and the package carries no Tauri dependency. Bronze members:
  - `TauriWindowApi` — `getCurrent()`, `getAll()`, and a `TauriWebviewWindow` with `setTitle/title`, `setPosition/setSize/innerSize/outerPosition`, `minimize/maximize/unmaximize/isMaximized/isMinimized`, `setFocus`, `show/hide`, `center`, `setResizable`, `setAlwaysOnTop`, `setMinSize/setMaxSize`, `setFullscreen/isFullscreen`, `close`, and `listen(event, handler): Promise<UnlistenFn>` (the async unlisten contract that replaces Electron's `on`/`removeAllListeners`).
  - `TauriAppApi` — `getName()`, `getVersion()`, `getTauriVersion()`, `defaultWindowIcon()`.
  - `TauriProcessApi` — `exit(code)`, `relaunch()`.
  - `TauriDialogApi` — `open(options)`, `save(options)`, `message(text, options)`, `ask(...)`, `confirm(...)`.
  - `TauriClipboardApi` — `readText()`, `writeText(text)`, `readImage()`, `writeImage(bytes)`, `clear()`.
  - `TauriShellApi` — `open(path)` (open URL/path), `Command` (for beep/reveal fallbacks).
  - `TauriCoreApi` — `invoke(cmd, args)`, `convertFileSrc(path)` (the IPC bridge primitive; documents the async-over-IPC nature).
- **Backend factories (in `@flighthq/host-tauri`), Bronze set:**
  - `createTauriWindowBackend(tauri): WindowBackend` — maps `ApplicationWindow` size/position/state/title commands and `openWindow` onto `WebviewWindow`; bridges Tauri's async `listen('tauri://resize' | 'tauri://move' | 'tauri://focus' | 'tauri://close-requested' | …)` events into the `ApplicationWindow` signal emission the seam expects (including close-with-veto via `onCloseRequest`).
  - `createTauriAppBackend(tauri): AppBackend` — name/version/locale via `app` module, quit/relaunch/focus/exit via `process` + window focus.
  - `createTauriDialogBackend(tauri): DialogBackend` — open/save/message/confirm/prompt over `plugin-dialog`, mapping Flight's `DialogFilter`/options shape onto Tauri's.
  - `createTauriClipboardBackend(tauri): ClipboardBackend` — text + image (image crosses the seam as Flight's data-URL convention, converted to/from Tauri's byte form), returning sentinels (`''`/`null`/`false`) on failure rather than throwing.
  - `createTauriShellBackend(tauri): ShellBackend` — open external URL/path; `beep`/`reveal-in-folder` via `Command` where available, no-op sentinel otherwise.
- **`registerTauriBackends(tauri: TauriApi): void`** — the one-call installer (mirrors `registerElectronBackends`), wiring the Bronze backends into `setWindowBackend`/`setAppBackend`/`setDialogBackend`/`setClipboardBackend`/`setShellBackend`. Each `set*Backend(null)` reverts to the web default; no bulk unregister.
- **`index.ts` barrel** re-exporting every `createTauri*Backend`, `registerTauriBackends`, and the `TauriApi` types — single root `.` export, `"sideEffects": false`.
- **Colocated tests** for each backend driven by a fake `TauriApi`, asserting the seam contract (sentinels on failure, signal emission on bridged events, command mapping).

Effort: medium. The async-over-IPC adaptation (every call is a Promise; events are `listen`→`Promise<UnlistenFn>`) and the close-requested veto bridge are the real work versus Electron's synchronous main-process calls. This is the 80%-value desktop slice and the proof-of-seam.

### Silver

Competitive with what a serious Tauri integration covers: the full desktop capability set Electron's host already fills, plus Tauri's first-class filesystem, with cross-backend behavioral consistency against `host-electron`.

- **Remaining `TauriApi` slices** added to `tauriModule.ts`: `TauriMenuApi` (`Menu`, `Submenu`, `MenuItem`, `PredefinedMenuItem`, `setAsAppMenu`, `popup`), `TauriTrayApi` (`TrayIcon.new`, `setTooltip/setTitle/setIcon/setMenu`, tray `action` events), `TauriGlobalShortcutApi` (`register/unregister/unregisterAll/isRegistered`), `TauriScreenApi` (the `window`/monitor functions: `currentMonitor`, `availableMonitors`, `primaryMonitor` with `scaleFactor`/`position`/`size`/`workArea`), `TauriNotificationApi` (`plugin-notification`: `sendNotification`, `isPermissionGranted`, `requestPermission`, `onAction`), `TauriUpdaterApi` (`plugin-updater`: `check`, `downloadAndInstall` with progress callback), `TauriFsApi` (`plugin-fs`: read/write/list/stat/mkdir/remove + `BaseDirectory`), `TauriPathApi` (standard-directory resolution: `appDataDir`, `documentDir`, `downloadDir`, etc.), `TauriOsApi` (`platform`, `arch`, `locale`, `version` for the platform seam), `TauriPowerApi` (battery/charging where available; macOS/Windows specifics).
- **Backend factories completing the desktop suite:**
  - `createTauriMenuBackend(tauri): MenuBackend` — application menu + context menu from Flight's menu descriptors, mapping `MenuItem`/role/accelerator/submenu/`onMenuSelect` onto Tauri's menu builder and its `action` event stream.
  - `createTauriTrayBackend(tauri): TrayBackend` — tray icon/tooltip/title/context-menu + `onTrayEvent` over `TrayIcon` actions (icon crosses as data-URL/bytes).
  - `createTauriShortcutBackend(tauri): ShortcutBackend` — global hotkeys over `plugin-global-shortcut`, normalizing Flight accelerators to Tauri's.
  - `createTauriScreenBackend(tauri): ScreenBackend` — display enumeration, work area, scale factor + `onScreenChange`.
  - `createTauriNotificationBackend(tauri): NotificationBackend` — notifications + permission query/request + `onNotificationClick`/`onNotificationAction`.
  - `createTauriUpdaterBackend(tauri): UpdaterBackend` — the event-capability updater lifecycle (checking/available/progress/downloaded/error signals + check/download/quit-and-install) over `plugin-updater`.
  - `createTauriPlatformBackend(tauri): PlatformBackend` — OS name/kind/arch/locale via `plugin-os`.
  - `createTauriPowerBackend(tauri): PowerBackend` — battery/charging/keep-awake (keep-awake via a Tauri command or `plugin-`-equivalent).
  - `createTauriFilesystemBackend(tauri): FilesystemBackend` — read/write/list/stat + standard directory paths over `plugin-fs` + `path`. **This is a Tauri win over the Electron host**, where filesystem was explicitly out of scope; it makes `@flighthq/filesystem` realized on a desktop native host for the first time.
  - `createTauriProtocolBackend(tauri): ProtocolBackend` — deep-link / custom-scheme registration + `onOpenURL` over `plugin-deep-link`.
- **`registerTauriBackends` extended** to wire the full set (parallel to `host-electron`'s 15-backend registration), with the same `set*Backend(null)` revert semantics.
- **IPC adapter:** `createTauriIpcBackend(tauri): IpcBackend` — `sendIpcMessage`/`invokeIpc`/`onIpcMessage` over Tauri's `invoke` + `event` (WebView↔Rust-core channel), the analogue of Electron's `ipcMain` but across the Tauri IPC bridge rather than Node IPC.
- **Multi-window** support in the window backend: `openWindow` creating new `WebviewWindow` instances, label↔`win` mapping owned by the backend (mirroring Electron's `id`↔window map), per-window event wiring and disposal.
- **Granular registration helpers** matching Electron: each `createTauri*Backend` independently usable, plus a documented subset-registration recipe for apps that want only some seams on Tauri.
- **Cross-backend consistency suite:** a shared contract-test harness (ideally lifted to a common `host-*` test util) asserting `host-tauri` and `host-electron` agree on the observable seam behavior — sentinel returns, signal payload shapes, dialog filter mapping, window state transitions — so "the seam is not Electron-shaped" is _tested_, not asserted. Any divergence forced by Tauri (e.g. async-only clipboard, permission-gated capability returning a sentinel when not allowlisted) is documented as an intentional host divergence.

Effort: large. This is full feature parity with the Electron host plus filesystem; the menu/tray/event-bridging and the multi-window label mapping are the heaviest pieces. The cross-backend contract suite is what earns the "proves the seam" claim.

### Gold

The authoritative, production-grade second desktop host: exhaustive Tauri capability coverage, robust permission/allowlist handling, the mobile-Tauri story considered, performance on the IPC bridge, and full documentation of the host-authoring contract this package implicitly defines.

- **Permissions / capabilities allowlist handling (Tauri-specific, load-bearing):** every backend guards on Tauri's capability allowlist and **returns the established sentinel** (`null`/`false`/`-1`/`''`/no-op) when a capability is not granted in `tauri.conf.json`, never throwing — exactly the web-backend "guard and return sentinel" discipline applied to a permission-gated native host. A `getTauriCapabilityStatus(tauri, capability): 'granted' | 'denied' | 'unknown'` inspection helper and a documented mapping of each Flight capability to the Tauri permission(s) it requires (the allowlist a host app must enable). This dovetails with the requested `@flighthq/permission` seam if/when it lands.
- **Full window-control parity:** the native-host extras the window seam allows beyond the web default — `setIcon`, `setOpacity`, `setProgressBar`, `requestUserAttention`/flash, `setSkipTaskbar`, `setDecorations`/`setMenuBarVisibility`, `setParentWindow`, `setIgnoreCursorEvents`, drag-region and custom-titlebar hooks — each mapped to Tauri's `WebviewWindow` API or a sentinel where Tauri lacks it, with the gaps recorded in the divergence map.
- **Inbound host events fully bridged:** `onActivate`/`onOpenFile` (app), `onSecondInstance` (single-instance via `plugin-single-instance`), `onOpenURL` (deep link), tray/menu/notification/screen/power event streams — all delivered through the same `on*(listener): () => void` over Tauri's `listen` seam, with disciplined `UnlistenFn` cleanup so no listener leaks across window/app teardown (`dispose*` semantics honored).
- **App/process layer completeness:** `createTauriAppBackend` covering single-instance lock + `onSecondInstance`, app badge (`setAppBadgeCount` via dock/taskbar where supported), and relaunch/quit edge cases (exit codes, graceful-vs-forced).
- **Performance + allocation discipline on the IPC bridge:** batched/debounced window-state event handling (Tauri emits high-frequency resize/move events over IPC), reuse of decoded event payloads where the seam allows out-params, and a documented note on the async-IPC latency floor versus Electron's synchronous calls (a real behavioral difference apps should know about). No per-event allocation in the bridged hot paths.
- **Robust error + edge-case handling:** every async Tauri call wrapped to convert rejected Promises into seam sentinels, plugin-absent detection (a capability whose plugin is not installed returns the sentinel, not a crash), version-skew handling against `getTauriVersion()` (Tauri 1 vs Tauri 2 API differences gated behind the `TauriApi` slice the consumer passes), and clear behavior when the WebView is torn down mid-call.
- **Tauri 2 mobile consideration:** evaluate whether the mobile capabilities (`haptics`, `statusbar`, `share`, `notification` permissions, `geolocation`) Tauri 2 exposes on iOS/Android should be filled here or in a sibling `@flighthq/host-tauri-mobile` — likely a sibling to keep the desktop adapter focused, decided by whether the mobile plugin surface diverges enough to warrant a split (the `-mobile` neighbor pattern). Either way, this is the path by which Tauri also helps close the mobile-host gap the review flags.
- **The host-authoring contract, documented:** because this is the _second_ host, it is the package that turns the implicit "what a host adapter must implement" into an explicit, written contract — a `host-adapter` authoring guide (shared between `host-electron`, `host-tauri`, and future `host-capacitor`) enumerating every seam, its required behavior, the sentinel discipline, the event-bridging expectation, and the cross-backend contract suite as the conformance gate. This is arguably the highest-leverage Gold deliverable: it makes the _third_ host cheap.
- **Tests + docs:** exhaustive colocated unit suites with fake `TauriApi`; the shared cross-host contract suite run against both Electron and Tauri in CI; a worked example app (a Tauri-shelled Flight desktop app under `examples/`/host-docs) demonstrating `registerTauriBackends` end to end; and the divergence map entries for every place Tauri necessarily differs from Electron (async clipboard, permission-gated sentinels, no Node `fs`-vs-`plugin-fs`, multi-window label model).

Effort: very large, but front-loaded value is in Bronze/Silver. Gold is mostly hardening (permissions, errors, performance), the mobile decision, and the documentation/contract work that pays off on host #3 and the Rust port's host story.

## Boundaries

- **Defines no capability seams.** All `*Backend` contracts and `*Kind` identifiers stay in `@flighthq/types` and the owning capability packages. If a seam needs generalizing to fit Tauri, that change lands _there_ (a cross-package edit to raise with the user), not as a special case in this adapter.
- **Carries no Tauri dependency.** The `@tauri-apps/*` surface enters only via the explicitly-passed `TauriApi`, typed by the local `tauriModule.ts`. Same dependency-free, fake-testable posture as `host-electron`.
- **Not in `@flighthq/sdk`.** It is a host-process adapter the app installs, not app-facing API; the barrel never re-exports it.
- **No rendering, node, or scene-graph code.** A host adapter wires platform capabilities only; the renderer and scene graph are runtime-agnostic and unaffected.
- **No new mobile capabilities defined here.** If Tauri 2 mobile coverage is built, it is a `@flighthq/host-tauri-mobile` sibling (or the future `@flighthq/host-capacitor`), not folded into the desktop adapter.
- **No Rust crate.** Tauri's host is Rust by construction; the Rust port's desktop story is `flighthq-host-winit`/`flighthq-host-sdl` (native wgpu, no WebView). `host-tauri` is intentionally TS-only and recorded as such in the conformance map.
- **No serialization/`-formats` neighbor.** Host adapters parse nothing; image/icon bytes cross the existing seams in Flight's established conventions (data URLs), converted at the boundary.
- **No bundle-size obligation.** Host adapters are explicitly the non-tree-shakable package class; they are installed in the host, not pulled into an app's web bundle, so the bundle-size discipline that governs the SDK packages does not apply here (and `npm run size` does not gate it).

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Tauri 1 vs Tauri 2 target.** Tauri 2 reorganized the API into plugins, added mobile, and changed the permissions model. The `TauriApi` slice should target **Tauri 2** (current, mobile-capable, the live ecosystem), with Tauri 1 explicitly out of scope. Confirm before scaffolding, since it changes nearly every module path in `tauriModule.ts`.
- **Async seam impedance.** Tauri is async-over-IPC end to end; some Flight seams (notably `clipboard` read) were shaped around Electron's synchronous module and then wrapped in `async`. Verify each capability contract is already Promise-based (the Electron host returns Promises even for sync calls) so Tauri introduces no seam change — and where a seam exposes a synchronous accessor, decide whether Tauri caches a last-known value or the seam needs an async variant generalized in `@flighthq/types`.
- **Event-bridge ownership and cleanup.** Tauri's `listen` returns a `Promise<UnlistenFn>` rather than a sync `removeListener`. The window/app backends must track pending-and-resolved unlisten handles to dispose cleanly. Confirm the seam's `dispose*`/`detach*` contract tolerates async unlisten (it returns void today) without leaking if disposal races a still-pending `listen`.
- **Permission/allowlist surfacing.** When a capability is not in the app's `tauri.conf.json` allowlist, the backend returns a sentinel. Is silent-sentinel the right UX, or should there be a one-time `console.warn`/diagnostic so a developer who forgot to allowlist a capability isn't mystified by a no-op? Lean toward a dev-only diagnostic via an optional `@flighthq/log` hook, never a throw.
- **Whether to lift a shared `host-*` test/contract harness.** The cross-backend consistency suite (Silver) and the host-authoring contract (Gold) want shared code across `host-electron`/`host-tauri`. Does that justify a `host-shared` or a `@flighthq/host-contract` test-only package, or should it live under `tests/` at the root? Recommendation: a root test harness first; promote to a package only if a third host materializes.
- **Mobile split timing.** Tauri 2 can target iOS/Android. Build mobile coverage as `host-tauri-mobile` now (closing part of the mobile-host gap the review flags) or wait for `host-capacitor`? Recommendation: keep `host-tauri` desktop-only for Bronze/Silver; revisit the mobile sibling at Gold once the desktop seam is proven and the Tauri-mobile plugin surface is assessed.
- **Sidecar/embedded-Rust-app interplay.** A Tauri app could embed a Flight _Rust_ renderer (via the Rust port) as a sidecar rather than running TS-in-WebView. Is that a `host-tauri` concern at all, or purely a Rust-port deployment recipe? Recommendation: out of scope here — document it as a Rust-port host note, not a TS adapter feature.

## Agent brief

> Create `@flighthq/host-tauri` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
