# Breadth Review: Application & OS-Platform Integration Developer

**Lens:** One sentence — I build a desktop/mobile application on Flight and need the full OS-integration surface (app/window lifecycle, windowing, and every platform capability: clipboard, dialogs, filesystem, notifications, shell, menu, tray, shortcuts, screen, storage, device, share, haptics, geolocation, statusbar, network/power/lifecycle/keyboard/sensors, app/protocol/updater/ipc, and host adapters) to ship without ever falling out of the SDK.

**Coverage: 86/100**

## What a complete SDK owes this perspective

An application/platform developer expects the SDK to be a complete escape-hatch-free host shell, not just a renderer with a few conveniences bolted on. Concretely:

- **App + window lifecycle.** Create an application, run a main loop, open/size/position/state windows, listen to focus/resize/visibility/close-with-veto, multi-window, fullscreen, drag-and-drop of files onto a window.
- **Process/identity layer.** App name/version/locale, quit/relaunch/focus, single-instance lock + second-instance handoff, dock/taskbar badge and menu, open-file/activate events.
- **The "native bridge" suite.** Clipboard, native file/message dialogs, filesystem, OS notifications, shell (open URL/path, reveal, trash, beep), native menus + context menus, system tray, global shortcuts, screen/display enumeration, persistent key/value storage.
- **Device & sensors.** Device/OS identity, screen scale/safe-area, battery/power, network connectivity, geolocation, accelerometer/gyro/orientation, haptics, on-screen keyboard, status bar (mobile).
- **App-distribution plumbing.** Auto-updater lifecycle, custom URI scheme / deep-link handler, IPC for split-process hosts, share sheet, webcam/photo.
- **Host adapters.** A pluggable backend seam so a native runtime (Electron, Tauri, Capacitor, a C/C++ shell) fills the capabilities, with a web default so everything works in the browser.

A mature SDK should make the common app — a windowed desktop tool or a packaged mobile app — buildable end to end without the developer touching `electron`/`tauri` APIs directly except via a thin registration call.

## Well covered

This is the strongest-covered perspective in the SDK; the platform suite is unusually deliberate and complete.

- **App + window lifecycle is real, not stubbed.** `@flighthq/application` provides `ApplicationWindow` with size/position/state plus a full `attach*`/`detach*` web-event wiring set (resize, focus, visibility, fullscreen, orientation, **drop-file**, render-context/state) and window-control commands (center, close-with-veto, focus, fullscreen). `@flighthq/app` covers identity (name/version/locale), control (quit/relaunch/focus), single-instance lock + release, and the dock/badge story (`setAppBadgeCount`, dock badge/menu/bounce). The split between per-window (`application`) and per-process (`app`) concerns is the right cut.
- **The full native-bridge suite exists as named packages.** Every capability an Electron/Tauri developer reaches for is present: `clipboard`, `dialog`, `filesystem`, `notification`, `shell`, `menu` (+ context menu + `onMenuSelect`), `tray`, `shortcut`, `screen`, `storage`. None are stubs — `filesystem` exposes ~17 functions, `dialog` ~8, `menu` covers application menu, context menu, templates, and selection events.
- **Consistent backend-seam architecture.** Command capabilities uniformly expose `get*Backend`/`set*Backend`/`createWeb*Backend`; event capabilities (`network`, `power`, `lifecycle`, `keyboard`, `sensors`) expose a signal entity with `create*`/`attach*`/`detach*`/`dispose*`. This is the single most important thing for this perspective — it means "Electron support" is one backend, not a coupling, and every API has a web fallback. The pattern is applied with no exceptions across the suite.
- **Device & sensor breadth.** `device`, `platform`, `screen`, `power`, `network`, `lifecycle`, `keyboard` (SoftKeyboard), `sensors`, `geolocation`, `haptics`, `statusbar`, `share`, `webcam` are all present — this covers the mobile story, not just desktop.
- **App-distribution plumbing.** `updater` (auto-update lifecycle as an event capability), `protocol` (deep links / `onOpenURL`), and `ipc` (`sendIpcMessage`/`invokeIpc`/`onIpcMessage`) close the packaged-app loop that most graphics SDKs simply omit.
- **A concrete host adapter ships.** `@flighthq/host-electron` implements the window/app/dialog/clipboard/menu/tray/shortcut/screen/power/notification/shell/protocol/updater/ipc seams (17 `electron*` modules), with the `electron` module injected (`registerElectronBackends(electron)`) so the adapter carries no hard dependency and stays testable. This proves the seam works against a real runtime.

## Gaps & missing capabilities

- **Only one host adapter exists.** `host-electron` is the lone concrete backend. The map names `host-tauri` and `host-capacitor` as "future siblings," but until at least one mobile host (Capacitor) and one lighter desktop host (Tauri) exist, the mobile-facing packages (`haptics`, `sensors`, `statusbar`, `geolocation`, `webcam`, `keyboard`, `share`) are seam-only on native — they work on web but have no realized native backend. For a "ship a mobile app" claim this is the biggest hole.
- **No permissions capability.** Geolocation, notifications, webcam, and (mobile) filesystem all gate on OS permission grants. `notification` has a permission concept and `geolocation` implies one, but there is no unified `@flighthq/permission` to query/request/observe permission state across capabilities. An app developer expects one place to drive the permission UX.
- **No in-app-purchase / store / entitlements.** Any packaged mobile or desktop-store app needs IAP, receipt validation, or licensing. Nothing here. This is squarely in the "ship an app" target and absent.
- **No audio session / media-session control.** `media` handles playback channels, but there is no OS-level media-session integration (lock-screen transport controls, now-playing metadata, audio focus/interruption on mobile). An app that plays audio in the background needs this.
- **No biometric / secure-credential capability.** `storage` is plaintext key/value over localStorage; there is no `@flighthq/biometrics` (Touch/Face ID) and no secure keychain/credential store. Apps handling auth tokens expect a secure-storage seam distinct from `storage`.
- **Drag-and-drop is inbound only.** `application` wires file _drop_ onto a window, but there is no drag-_out_ (starting a native drag of app content to the OS) and no clipboard-driven file/image drag story beyond text/HTML in `clipboard`.
- **No global/system-level input beyond shortcuts.** `shortcut` covers global hotkeys, but there is no global mouse/key hook or accessibility-style input capability — niche, but some desktop tools rely on it.
- **Updater/protocol/ipc have no second host to validate the seam.** Like the host-adapter gap: these seams are only exercised by Electron, so their shape is effectively single-host-tested.

## Missing or too-thin packages I would expect

- **`@flighthq/host-capacitor`** (or `host-cordova`) — the missing mobile host. Without it the entire mobile-sensor/haptics/statusbar/share/webcam set is web-only on device. Highest-value addition for this perspective.
- **`@flighthq/host-tauri`** — a second desktop host to prove the seams are not Electron-shaped (the SDK's own stated goal) and to give a lighter-weight desktop target.
- **`@flighthq/permission`** — unified permission query/request/observe across geolocation, notifications, webcam, sensors, and filesystem. Currently scattered per-capability or absent.
- **`@flighthq/purchase`** (in-app purchase / store / entitlements) — required for shipping store apps; entirely missing.
- **`@flighthq/biometrics`** and/or a secure-credential seam — Touch/Face ID + keychain, distinct from plaintext `storage`.
- **`@flighthq/mediasession`** — OS now-playing / lock-screen transport controls and audio-focus/interruption, complementing `media`.
- **`@flighthq/contacts` / `@flighthq/calendar`** (lower priority) — common mobile-app integrations not yet represented; reasonable as future cells given the suite's ambitions.
- Consider widening **`clipboard`** to images/files and **`application`** to drag-_out_, rather than new packages.

## Verdict

From the application/platform perspective this is the SDK's most mature surface and it largely "hangs together." The app/window lifecycle is fully realized, the native-bridge suite is broad and consistent, and the uniform backend-seam pattern (with a working `host-electron`) is exactly the architecture an app developer wants — it lets the same code run on web and be lifted onto a native host by registration alone. The breadth of named packages (clipboard through sensors, updater/protocol/ipc) is well beyond what most graphics SDKs attempt and clearly aims at the stated "no escape hatch" goal.

The deductions are about _realization_ and a few whole capabilities, not architecture: only one host adapter ships, so the mobile half of the suite is currently seam-only on device; and four capability areas an app developer reliably needs — permissions, in-app purchase, secure/biometric storage, and OS media-session — are missing. Closing the host-adapter gap (especially a Capacitor mobile host) and adding a permissions seam would move this from "excellent skeleton" to "ship-ready," pushing coverage into the 90s.
