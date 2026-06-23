---
id: host-electron
title: '@flighthq/host-electron'
type: depth
target: host-electron
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/host-electron.md
  - tools/agents/docs/reviews/depth/host-electron.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 80/100. A broad, faithful, well-engineered Electron main-process host adapter that fills fifteen Flight capability seams over an injected `ElectronApi`; held back from "exhaustive" by a handful of real omissions (silently-broken `storage`, application-modal-only dialogs, an inert built-in updater, missing notification close/IPC targeting).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum genuinely-useful version: close the omissions that make the adapter silently wrong or strictly poorer than the web default. These are the four highest-value gaps from the depth review.

- **`createElectronStorageBackend(electron)` + register it** — a file-backed synchronous `StorageBackend` (`getItem`/`setItem`/`removeItem`/`clear`/`key`/`length` per the `@flighthq/storage` seam) over a JSON file in `app.getPath('userData')`. Today an Electron host silently keeps the web/localStorage default, which does not exist in the main process — so `storage` is **broken**, not deferred. This requires widening `ElectronApi.app` with `getPath(name: string): string` and adding `fs` read/write to the injected surface (or a small injected `readFileSync`/`writeFileSync` slice on `ElectronApi`, keeping the package `node:fs`-dependency-free in the same spirit as the `electron`-free design). Register in `registerElectronBackends` via `setStorageBackend`.
- **Thread the modal parent through dialogs** — add an optional `window?: Readonly<ApplicationWindow>` (or window-handle) field to the `DialogBackend` open/save/message/confirm option types in `@flighthq/types` first, then resolve it through `getElectronBrowserWindow(win)` in `electronDialog.ts` so per-window modal dialogs are reachable. The window side-table already exists; this is mostly plumbing once the type field lands.
- **`createElectronUpdaterBackend` honesty** — the built-in Squirrel `autoUpdater` emits no progress and auto-downloads on check, so `downloadUpdate` is a no-op alias and `subscribeDownloadProgress` is permanently inert. Bronze: keep the built-in backend but make the inertness explicit in the API surface (a doc comment is not enough) — return the documented sentinel and ensure the test asserts the inert contract, so callers do not depend on progress under this backend.
- **Notification close/update through the seam** — the `ElectronNotification.close()` method is already in the module type but unused. Add `close`/dismiss to the `NotificationBackend` contract in `@flighthq/types` (keyed by a notification id/tag) and wire it; track shown `Notification` instances in a side `Map<id, ElectronNotification>` so a later `closeNotification(id)` resolves the right one.
- **`withWindow(bw, fn)` helper** — extract the ~20 identical `const bw = _windows.get(win); if (!bw) return; try { … } catch {}` blocks in `electronWindow.ts` into one guard. Pure refactor, no behavior change; halves the file and removes the copy-paste hazard before more methods are added.

### Silver

Competitive and solid — matches what a well-regarded Electron integration layer offers: richer updater, IPC that actually targets renderers, fuller window/dialog/tray/menu coverage, and the secondary capabilities a real desktop app reaches for.

- **`createElectronUpdaterBackend` (electron-updater variant)** — a second factory, `createElectronUpdaterAutoBackend(autoUpdater)` (typed against a local `ElectronUpdaterApi` interface, _not_ a hard `electron-updater` dependency, mirroring the `ElectronApi` injection design), where `downloadUpdate` and `subscribeDownloadProgress` are real. Keep the built-in factory for zero-dep hosts; let the consumer choose which to register. This is the "-formats"-style neighbor pattern applied to a backend tier: a richer adapter behind the same `UpdaterBackend` seam.
- **Renderer-targeted IPC** — make the inert `send`/`invoke` real. The main side needs a `webContents` target; expose `createElectronIpcBackendForWindow(electron, win)` (or thread the target window through the `IpcBackend` send/invoke signatures in `@flighthq/types`) so main→renderer `send` and `invoke` over `ipcMain.handle` work. Also support `invoke` _handlers_ on the main side (`ipcMain.handle`) so a renderer can call into Flight, not only push to it. Surface the receive-only-by-default limitation in signatures, not just a comment.
- **Dialog completeness** — `showCertificateTrustDialog`, `showErrorBox` (a `messageError` convenience), and the `properties` set Electron supports but Flight doesn't yet thread (`showHiddenFiles`, `createDirectory`, `promptToCreate`, `dontAddToRecent`, `treatPackageAsDirectory`). Add the corresponding optional fields to the dialog option types in `@flighthq/types` first.
- **Window backend depth** — wire the OS events still missing from the entity round-trip: `show`/`hide` (visibility), `enter-html-full-screen`, `moved` vs `move` debounce, `closed` (distinct from `close`, fires after destroy — clean up the `WeakMap` entry there too), `ready-to-show`. Add command coverage for `setVisibleOnAllWorkspaces`, `setHasShadow`, `setBackgroundColor`, `setContentProtection`, `setKiosk`, `setRepresentedFilename` (macOS), `setOverlayIcon` (Windows), `setVibrancy`/`setBackgroundMaterial`. Add `getElectronWindowId(win): number` and the reverse `getApplicationWindowForId(id): ApplicationWindow | null` so menu/tray click handlers can resolve back to the originating window.
- **Tray maturation** — `setPressedImage`, `setImage` (live icon swap), `displayBalloon` (Windows), `setIgnoreDoubleClickEvents`, `getBounds` (for popover positioning), and `mouse-enter`/`mouse-leave`/`balloon-click` events forwarded through the tray-event seam. Allow more than one subscriber (the current single-subscriber funnel is a limitation — route through signals or a listener list).
- **Menu depth** — `before-input-event`/accelerator-only items, separators and `role`-only items fully mapped, `sublabel`/`toolTip`/`icon` per item, `menu.closePopup`, and `popupContextMenu` resolving on **dismissal** (Electron's `menu-will-close` / the `popup` callback) so the documented leaked-Promise hazard is gone.
- **`createElectronPowerBackend` events** — `on-ac`/`on-battery`, `lock-screen`/`unlock-screen`, `shutdown`, `speed-limit-change`, and `getSystemIdleTime`/`getSystemIdleState` (Electron _can_ serve these from `powerMonitor` even though instantaneous battery level cannot). Keep `batteryLevel: -1`/`isLowPower: false` as honest sentinels.
- **`createElectronScreenBackend` cursor + nearest** — `getCursorScreenPoint`, `getDisplayNearestPoint(point)`, `getDisplayMatching(rect)`, plus `colorDepth`/`rotation`/`internal`/`touchSupport` fields on the display descriptor (extend the `Screen` descriptor type in `@flighthq/types`).
- **`createElectronShellBackend` completeness** — `writeShortcutLink`/`readShortcutLink` (Windows), and a real `beep` already present — add `openPath` error-string propagation (Electron returns a non-empty string on failure; surface it as a sentinel rather than swallowing).
- **`registerElectronBackends` options object** — `registerElectronBackends(electron, options)` where `options` selects the updater variant, supplies the storage path, and lets a host opt out of specific seams it wants to keep on the web/native default. Today it is all-or-nothing.

### Gold

Authoritative / production-grade — the canonical Electron adapter for Flight, with exhaustive seam coverage, full error handling, lifecycle correctness, and a test/conformance posture that proves every backend matches its `@flighthq/types` contract.

- **Exhaustive `ElectronApi` audit against the seams** — every `@flighthq/types` host `*Backend` method that an Electron main process _can_ serve has a real implementation; every one it _cannot_ serve returns the documented sentinel **and** is asserted to do so in tests. Produce a committed coverage table (seam method → Electron call → sentinel-if-unavailable) so the adapter's exact fidelity is auditable, paralleling the Rust conformance/divergence map but for the seam boundary.
- **Full app/process layer** — `createElectronAppBackend` reaching `getPath`/`setPath` for every standard dir, `getAppMetrics`, `getGpuInfo`/`getGpuFeatureStatus`, `setLoginItemSettings`/`getLoginItemSettings` (launch-at-login), `setUserTasks`/`setJumpList` (Windows), recent-documents (`addRecentDocument`/`clearRecentDocuments`), `setActivationPolicy` (macOS), and the full `onActivate`/`onOpenFile`/`onOpenUrl`/`onSecondInstance`/`onWillQuit`/`onBeforeQuit`/`onWindowAllClosed` event set with correct Electron argument adaptation and veto support (`event.preventDefault`).
- **Window veto + lifecycle correctness** — `onCloseRequest` veto threaded through Electron's `close` event `preventDefault` (the seam supports close-with-veto; the adapter must honor it), `WeakMap` cleanup on `closed`, and re-attachment safety if `open` is called twice. Multi-window stress-tested.
- **Clipboard exhaustive** — custom formats (`read`/`write` with a format string), `availableFormats()`, `readFindText`/`writeFindText` (macOS find-pasteboard), and image read/write that round-trips `ImageSource` (the codebase's pixel buffer) rather than only data-URL strings — a near-zero-copy path where possible.
- **`electron-updater` backend to full fidelity** — channel/allowPrerelease/allowDowngrade config, `differentialDownload` progress, signature verification surfacing, staged rollout, and the complete event set (`update-cancelled`, `download-progress` with bytes/percent/bytesPerSecond) all mapped to the `UpdaterBackend` contract.
- **Error handling & robustness pass** — every async backend method has defined behavior on rejection (sentinel, never an unhandled rejection across the seam); every `try/catch` distinguishes "window destroyed" (expected) from real errors (surface via the package's error convention, not silent swallow). No leaked listeners: every `subscribe*`/`on*` returns a working unsubscribe and is leak-tested.
- **Protocol/deep-link completeness** — `setAsDefaultProtocolClient` with args/path on Windows, `removeAsDefaultProtocolClient`, the second-instance argv parsing path for Windows deep links (where the URL arrives via `onSecondInstance`, not `open-url`), and `onOpenUrl` unified across macOS `open-url` and Windows argv.
- **Test & docs to AAA** — colocated unit tests already exist for every file; Gold adds: a fake `ElectronApi` test harness exhaustive enough to drive every method, sentinel-contract assertions for every unavailable path, listener-leak assertions, and an integration test that runs `registerElectronBackends` and verifies each `set*Backend` was called with a conforming object. Document the host-adapter contract (what's real, what's sentinel, which optional dependency unlocks what) in the package — the one place a host author needs.
- **Seam-gap upstreaming** — any capability discovered missing from `@flighthq/types` during the above (notification close/tag, dialog modal-parent, IPC target, richer screen/display fields) is added to the header layer first and reflected across _all_ host backends (web default, future `host-tauri`/`host-capacitor`), not patched locally — keeping the seam the single source of truth.

## Sequencing & effort

Recommended order, with dependencies and items to surface.

1. **Bronze first, in this order** (each is small and independent except where noted):
   - `withWindow` refactor — zero dependencies, pure cleanup, do it before any window additions so later work lands in the cleaner shape.
   - **Storage backend** — highest value (fixes a latent bug). **Cross-package decision to surface:** it needs `app.getPath` + a file-IO slice on `ElectronApi`. Decide whether file IO is injected on `ElectronApi` (consistent with the `electron`-free design) or whether `host-electron` may take a `node:fs` dependency (the codebase map says `fs` is "out of scope here — a future node-fs injection"). This is a design-decision item for the user, not an autonomous choice.
   - **Dialog modal parent**, **notification close**, **updater honesty** — each needs a small `@flighthq/types` change first (the header is the design surface). Land the type change, then the adapter, then the test. These touch `@flighthq/dialog`, `@flighthq/notification`, `@flighthq/updater` type contracts — coordinate so the web default backends and the seam stay consistent.

2. **Silver** builds directly on Bronze. Do the **electron-updater neighbor backend** and **renderer-targeted IPC** first (they unlock the most professional use); then the window/tray/menu/power/screen depth, which is mostly additive method coverage once `withWindow` and the id-lookup helpers exist. The `registerElectronBackends(electron, options)` reshape should land near the end of Silver, once the updater-variant and per-seam opt-out it selects exist.

3. **Gold** is largely a fidelity-and-robustness campaign rather than new features: the exhaustive seam-coverage audit, error-handling pass, leak tests, and the optional-dependency-backed full updater/clipboard. The big cross-package item is **seam-gap upstreaming** — fixing each discovered gap in `@flighthq/types` and propagating it to every host backend.

**Dependencies on other packages:** every functional addition above is gated on a `@flighthq/types` seam change _first_ (header-layer rule). The capability packages owning those seams (`@flighthq/storage`, `dialog`, `notification`, `updater`, `ipc`, `screen`, `tray`, `power`, `app`) must keep their web-default backends in lockstep with each new seam method, so changes are inherently cross-package — they are not local to `host-electron`.

**Rust parity:** **N/A by design.** `host-electron` is in the conformance map's excluded set (no substrate in the box; Rust hosts are `host-winit`/`host-sdl`/`host-web`). The Gold obligation is seam fidelity to `@flighthq/types`, which _does_ have a Rust mirror — so any seam change made for `host-electron` must also be expressible in `flighthq-types` and serviceable by the Rust hosts, even though no `flighthq-host-electron` crate exists.

**Items to surface to the user before acting:**

- The `node:fs` vs injected-file-IO decision for the storage backend (the map currently defers `fs`).
- Whether to take an optional `electron-updater` peer concept (injected, like `electron`) or keep the built-in Squirrel backend as the only updater.
- Confirmation that adding modal-parent/notification-close/IPC-target fields to the shared seams is wanted (they widen the contract for _all_ host backends, including web and future native hosts).

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/host-electron` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
