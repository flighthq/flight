---
id: host-capacitor
title: '@flighthq/host-capacitor'
type: new-package
target: host-capacitor
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/host-capacitor.md
  - tools/agents/docs/reviews/breadth/application-platform (breadth review.md
  - tools/agents/docs/reviews/breadth/`tools/agents/docs/reviews/breadth/application-platform.md`) — names `@flighthq/host-capacitor` the highest-value addition for the application/platform perspective: it is the one package whose absence leaves the entire mobile-sensor/haptics/statusbar/share/webcam set web-only on device..md
depends_on: []
updated: 2026-06-23
---

## Summary

The mobile host backend — a `host-<runtime>` adapter that fills Flight's platform-suite `*Backend` seams with native iOS/Android implementations over Capacitor's plugin bridge (the Cordova fallback is a backend detail, not a second package), so the mobile-facing capabilities (sensors, haptics, statusbar, share, webcam, filesystem, notifications, geolocation, clipboard, dialog, ...) work on device instead of web-only.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

Minimum viable — the most-used mobile capabilities, the 20% delivering 80%. These are the seams a developer reaches for in the first hour of building a mobile app, and each maps to a first-party, ubiquitous Capacitor plugin (`@capacitor/haptics`, `@capacitor/share`, `@capacitor/clipboard`, `@capacitor/filesystem`, `@capacitor/geolocation`, `@capacitor/preferences`, `@capacitor/device`, `@capacitor/status-bar`, `@capacitor/app`).

- `createCapacitorHapticsBackend(capacitor): HapticsBackend` — `triggerHapticImpact` → `Haptics.impact({ style })`, `triggerHapticNotification` → `Haptics.notification({ type })`, `triggerHapticSelection` → `Haptics.selectionStart/selectionChanged`, `vibrateDevice` → `Haptics.vibrate({ duration })`. (Maps Flight's `HapticImpactStyle`/`HapticNotificationType` to Capacitor's `ImpactStyle`/`NotificationType`.)
- `createCapacitorShareBackend(capacitor): ShareBackend` — `shareContent` → `Share.share({ title, text, url, files })`, `canShareContent` → `Share.canShare()`.
- `createCapacitorClipboardBackend(capacitor): ClipboardBackend` — `readText`/`writeText`/`hasText` and `readImage`/`writeImage` (data-URL convention) → `Clipboard.read/write`. HTML/RTF/bookmark reads return sentinels (Capacitor clipboard is string/image only).
- `createCapacitorFileSystemBackend(capacitor): FileSystemBackend` — `readTextFile`/`writeTextFile`/`appendTextFile`/`readBinaryFile`/`writeBinaryFile`/`fileExists`/`removeFile`/`makeDirectory`/`readDirectory`/`statFile`/`copyFile`/`renameFile` → `Filesystem.readFile/writeFile/appendFile/stat/readdir/mkdir/deleteFile/copy/rename`; `getFileSystemPath(kind)` maps Flight's `FileSystemPathKind` to Capacitor `Directory` (`Documents`/`Data`/`Cache`/`External`). (`watchPath` deferred to Silver.)
- `createCapacitorGeolocationBackend(capacitor): GeolocationBackend` — `getCurrentGeoPosition` → `Geolocation.getCurrentPosition`, `watchGeoPosition`/`clearGeoWatch` → `Geolocation.watchPosition/clearWatch`, `requestGeolocationPermission` → `Geolocation.requestPermissions`.
- `createCapacitorStorageBackend(capacitor): StorageBackend` — synchronous KV seam over `@capacitor/preferences`. (Note: Preferences is async on device; this needs a design decision — see Open questions.)
- `createCapacitorDeviceBackend(capacitor): DeviceBackend` and `createCapacitorPlatformBackend(capacitor): PlatformBackend` — `getDeviceInfo`/`getSafeAreaInsets` and OS-name/kind/arch/locale/touch → `Device.getInfo`/`Device.getLanguageCode` plus Capacitor `getPlatform()`.
- `createCapacitorStatusBarBackend(capacitor): StatusBarBackend` — `setStatusBarStyle`/`setStatusBarVisible`/`setStatusBarColor`/`setStatusBarOverlaysContent` → `StatusBar.setStyle/show/hide/setBackgroundColor/setOverlaysWebView`.
- `registerCapacitorBackends(capacitor): void` — installs the above via each package's `set*Backend`; skips (leaves web default) any whose plugin is absent or whose platform is web.
- `CapacitorApi` interface (`capacitorModule.ts`) covering exactly the Bronze plugin slices.

### Silver

Competitive/solid — broad capability coverage, edge cases, and the permissions story that mobile capabilities gate on.

- `createCapacitorNotificationBackend(capacitor): NotificationBackend` — `showNotification` → `LocalNotifications.schedule`, `requestNotificationPermission` → `LocalNotifications.requestPermissions`, `isNotificationSupported`, and the inbound `onNotificationClick`/`onNotificationAction` over `LocalNotifications.addListener('localNotificationActionPerformed', ...)`. (Push via `@capacitor/push-notifications` exposed as a distinct backend wiring if the `notification` seam grows a push tier; otherwise Gold.)
- `createCapacitorWebcamBackend(capacitor): WebcamBackend` — `takeWebcamPhoto`/`pickWebcamImage` → `Camera.getPhoto({ source: Camera | Photos })`, `requestWebcamPermission` → `Camera.requestPermissions`. `recordWebcamVideo` returns `null` unless a video-capable plugin is injected (see Open questions).
- `createCapacitorSensorsBackend(capacitor): SensorsBackend` — accelerometer/gyro/orientation over `@capacitor/motion` (`Motion.addListener('accel'|'orientation', ...)`), plus `requestSensorsPermission` (iOS 13+ `DeviceMotionEvent.requestPermission`). Feeds `attachSensors`/`detachSensors`.
- `createCapacitorNetworkBackend(capacitor): NetworkBackend` — connectivity status + online/offline signals over `@capacitor/network` (`Network.getStatus`/`addListener('networkStatusChange')`), wired to the `network` event capability's `attach*`/`detach*`.
- `createCapacitorLifecycleBackend(capacitor): LifecycleBackend` — active/inactive/background, resume/pause, **Android back button** over `@capacitor/app` (`App.addListener('appStateChange'|'pause'|'resume'|'backButton')`).
- `createCapacitorKeyboardBackend(capacitor): SoftKeyboardBackend` — on-screen keyboard visibility/height over `@capacitor/keyboard` (`Keyboard.addListener('keyboardWillShow'|'keyboardWillHide')`), feeding the `keyboard` event capability.
- `createCapacitorDialogBackend(capacitor): DialogBackend` — `showMessageDialog`/`showConfirmDialog`/`showPromptDialog` over `@capacitor/dialog` (`Dialog.alert/confirm/prompt`). File open/save (`showOpenFileDialog`/`showSaveFileDialog`) map to `Camera`/`Filesystem`/share-sheet on mobile, or return sentinels where there is no native file picker.
- `createCapacitorShellBackend(capacitor): ShellBackend` — `openExternalUrl` → `App.openUrl`/`Browser.open`; `revealInFolder`/`moveToTrash`/`beep` return sentinels (no mobile equivalent).
- **Permissions across capabilities.** Each capability factory wires its plugin's `checkPermissions`/`requestPermissions` into the seam's `request*Permission` function and returns `false`/sentinel on denial; document the iOS `Info.plist` / Android manifest usage-string requirements per capability.
- **`watchPath`** filesystem watching where the platform supports it; otherwise a polling fallback or sentinel-no-op.
- **Platform-detection guards.** A shared `isCapacitorNativePlatform(capacitor)` helper so `registerCapacitorBackends` can skip web (where the web defaults are already correct) and per-capability factories can degrade per OS (iOS vs Android capability differences).
- **`CapacitorApi`** widened to the full Silver plugin slice, still minimal and structural.

### Gold

Authoritative/AAA/production — exhaustive seam coverage for every mobile-serviceable capability, every factory unit-tested against a fake Capacitor, documented, and verified to honor the host-adapter contract.

- **Every mobile-serviceable seam filled**, including the long tail: `createCapacitorAppBackend(capacitor): AppBackend` (app identity name/version/locale, `onActivate`/`onOpenFile`/`onOpenURL` via `@capacitor/app` `appUrlOpen`, single-instance is desktop-only and sentinels), `createCapacitorScreenBackend(capacitor): ScreenBackend` (display/scale via `Device`/`ScreenOrientation`), and push-notification tier if the `notification` seam adopts one.
- **Cordova fallback path.** A `CapacitorApi` member or sibling factory that bridges to `cordova.plugins.*` for projects still on Cordova, proving the seam is "Capacitor/Cordova" as the breadth review framed it — without a second package.
- **Exhaustive fake-Capacitor test suite.** One `capacitor<Capability>.test.ts` per factory plus `capacitorRegister.test.ts`, driven by a hand-written fake `CapacitorApi` (mirroring host-electron's `electron*.test.ts` files). Every factory tested for: happy path, plugin-absent → `null`/skip, plugin-throws → sentinel, permission-denied → `false`/sentinel, and web-platform → web-default-preserved. `npm run exports:check` green (every export colocated-tested).
- **iOS + Android capability matrix documented** — which seams realize on which OS, what `Info.plist` / `AndroidManifest.xml` entries each requires, and which gracefully sentinel. A README in the package (this is an adapter, so package-level docs are appropriate even under the no-proactive-docs rule, mirroring host-electron's role description).
- **`registerCapacitorBackends` granularity** — same shape as `registerElectronBackends`: bulk install, but each `createCapacitor*Backend` independently usable, and `set*Backend(null)` reverts any single capability to its web default.
- **Conformance with the Rust port's host layer** noted: the Rust `host-*` crates are native/winit/SDL, not Capacitor; this package is the TS-side mobile host, so no Rust crate mirrors it (record in the conformance map as a TS-only host, like `host-electron`).
- **`npm run packages:check` / `api` / `check` green**, side-effect-free verified, not in the `@flighthq/sdk` barrel.

## Boundaries

- **Not re-exported from `@flighthq/sdk`.** Like `host-electron`, this is a host adapter installed in the mobile shell, not app-facing API. Apps import capability functions from the capability packages; they call `registerCapacitorBackends` once at startup.
- **No hard Capacitor dependency.** The `capacitor` surface is injected and typed against the local `CapacitorApi`. The package must build and test with zero `@capacitor/*` packages installed.
- **Desktop-only seams are out of scope:** `menu`, `tray`, `shortcut`, multi-`window`/windowing, `updater`, `ipc`, `protocol` registration. These belong to `host-electron`/`host-tauri`; on mobile they sentinel or are simply not registered. (Deep links arrive via `app`'s `appUrlOpen`, not `protocol`.)
- **Web is not this package's job.** Every capability already ships a web default; on the web platform `registerCapacitorBackends` is effectively a no-op and leaves those defaults in place.
- **Not a renderer or a GPU host.** Unlike the Rust `host-*` crates, this fills only platform-capability seams; rendering on Capacitor uses Flight's existing web renderers inside the WebView.
- **One package per runtime family.** Cordova is a backend detail inside `CapacitorApi`, not a separate `host-cordova` package, to avoid duplicating the entire seam map. (Revisit only if the surfaces diverge enough to make the shared `CapacitorApi` dishonest.)

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Sync `storage` over async Preferences.** `StorageBackend` is the synchronous KV seam (web backend over `localStorage`). Capacitor `Preferences` is async on device. Options: (a) hydrate the whole store into an in-memory cache at register time and write-through asynchronously (matches the sync contract, risks staleness across processes); (b) leave `storage` to the web default (localStorage works in the WebView) and not register a Capacitor storage backend at all. Lean toward (b) for Bronze unless a native-persistence requirement forces (a).
- **Video recording in `webcam`.** Capacitor `Camera` is photo/pick only; `recordWebcamVideo` has no first-party plugin. Sentinel to `null`, or accept a community video plugin through `CapacitorApi` as an optional member?
- **Local vs push notifications.** The `notification` seam is currently local-notification-shaped. Should push (`@capacitor/push-notifications`: token registration, foreground/background handlers) be a tier of the same seam, or does it warrant a separate `@flighthq/pushnotification` capability (a question for application-platform, not this adapter)?
- **Capacitor plugin packaging.** Capacitor plugins are normally singletons imported per-plugin (`import { Haptics } from '@capacitor/haptics'`), not grouped under one module like `electron`. The `CapacitorApi` "one member per plugin" shape requires the consumer to assemble the object (`registerCapacitorBackends({ haptics: Haptics, share: Share, ... })`). Confirm this assembly call is acceptable, or offer per-capability `createCapacitor*Backend(plugin)` that each take a single plugin (closer to Capacitor's import idiom) with `registerCapacitorBackends` as the convenience aggregator.
- **Permission UX ownership.** The breadth review also flags a missing unified `@flighthq/permission`. If that lands, this adapter should route through it rather than wiring each plugin's `requestPermissions` into per-capability `request*Permission` functions. Until then, per-capability is the only path.
- **Platform-difference reporting.** When a seam realizes on iOS but sentinels on Android (or vice versa), should the factory return `null` (skip, fall back to web default) or a partial backend that sentinels the unsupported methods? Consistency with how `host-electron` handles macOS-only `dock` suggests partial backends with sentinel methods.

## Agent brief

> Create `@flighthq/host-capacitor` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
