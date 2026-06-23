# Depth Review: @flighthq/application

**Domain**: Application lifecycle / main loop + the windowing host layer (window state, window-control commands, platform event wiring) over a swappable `WindowBackend`.

**Verdict**: solid — 72/100

The package is two sub-domains stitched together: a very thin **application loop/lifecycle** half and a genuinely deep, near-authoritative **windowing** half. The windowing surface is exhaustive and idiomatic; the application/main-loop surface is a stub by comparison. The intended scope in the codebase map ("a main loop, application lifecycle events, and the windowing API") matches what is here, but a mature application-runtime library would carry far more in the loop/lifecycle half than three signals and a bare `requestAnimationFrame`.

## Present capabilities

**Application (`application.ts`)** — minimal but coherent:

- `createApplication` / `disposeApplication` — entity with `onUpdate(deltaTime)`, `onRender`, `onExit` signals.
- `startApplicationLoop` / `stopApplicationLoop` — a single `requestAnimationFrame` loop that emits `onUpdate` (with a measured delta) then `onRender` each frame; idempotent start, clean cancel.
- `attachApplicationExit` / `detachApplicationExit` — `beforeunload` → `onExit` wiring.
- Internal teardown registry (`WeakMap<Application, Map<symbol, cleanup>>`) keeps cleanup closures off the public entity — clean entity/runtime discipline.

**Window (`window.ts`)** — broad and well-shaped:

- Entity + lifecycle: `createApplicationWindow`, `disposeApplicationWindow`, `openWindow(options)`, `closeWindow`, `requestWindowClose` (veto via `cancelSignal(onCloseRequest)`).
- Full state-command surface: `setWindowTitle`, `setWindowPosition`, `setWindowSize`, `setWindowMinimumSize`, `setWindowMaximumSize`, `setWindowResizable`, `setWindowAlwaysOnTop`, `setWindowOpacity`, `setWindowIcon`, `setWindowSkipTaskbar`, `setWindowMenuBarVisible`, `setWindowParent`, `setWindowProgress`, `requestWindowAttention`, `centerWindow`.
- Window state transitions: `minimizeWindow`, `maximizeWindow`, `restoreWindow`, `hideWindow`, `showWindow`, `focusWindow`, `setWindowFullscreen` — each updates entity state, delegates to the backend, and emits the matching signal with change-guarding.
- Bounds + DPI: `getWindowBounds(out)`, `computeWindowDeviceTransform(out)` (alias-safe out-param), `attachWindowRenderState` (sizes canvas backing store + syncs device transform on resize).
- Fullscreen + pointer: `requestApplicationFullscreen`, `exitApplicationFullscreen`, `lockApplicationPointer`.
- Platform event wiring as paired `attach*`/`detach*`: `Resize`, `Focus`, `Visibility` (→ onActivate/onDeactivate), `Close` (beforeunload veto + pagehide), `DropFile`, `Fullscreen`, `Orientation`, `RenderContext` (webglcontextlost/restored), `RenderState`.
- Complete signal set on the entity (onActivate/onDeactivate, onClose/onCloseRequest, onFocusIn/Out, onMaximize/onMinimize/onRestore, onMove, onResize, onFullscreenChanged, onOrientationChanged, onRenderContextLost/Restored, onDropFile).
- `WindowBackend` seam: `getWindowBackend` / `setWindowBackend` / `createWebWindowBackend`, with a complete web default that guards every API (`typeof window`/`document` checks, try/catch around popup move/resize/close, favicon for `setIcon`, no-ops where the browser has no equivalent). This is the documented command-capability pattern done correctly.

## Gaps vs an authoritative application-runtime / windowing library

The windowing half is close to authoritative; the gaps are concentrated in the **application / main-loop / lifecycle** half:

- **No frame-rate control.** No target FPS, no frame cap, no throttle when hidden. The loop runs free at display refresh with no way to request 30/60/120 or an unlocked mode. OpenFL/Lime expose a frame rate; this has none.
- **No timestep model.** Only a single variable-delta `onUpdate`. A mature loop offers fixed-timestep update + interpolated render (the classic accumulator), a max-delta clamp to avoid the spiral-of-death on tab-restore, and often a separate logic vs render tick. None present — and `deltaTime` is unclamped, so a backgrounded tab returns a huge first delta.
- **No pause/resume or run-state.** No `pauseApplicationLoop`/`resumeApplicationLoop`, no `isApplicationRunning`, no auto-pause on window deactivate/visibility-hidden (the window half _detects_ visibility but the loop ignores it).
- **No elapsed-time / frame metrics.** No total elapsed time, frame counter, or measured FPS exposed — standard in game/app runtimes.
- **Thin lifecycle.** Only `onExit`. No app-level `onActivate`/`onDeactivate`/`onResume`/`onLowMemory`/`onError`/uncaught-error hook at the application tier (window-level activate/deactivate exist, but the _application_ lifecycle is just exit). The map assigns deeper app identity/control to `@flighthq/app`, so some of this is missing-by-design, but a self-standing application loop would still own pause-on-blur and an error/tick-exception hook.
- **No headless/manual stepping.** No `stepApplicationLoop(delta)` for tests, fixed-step simulation, or non-rAF hosts; the only driver is `requestAnimationFrame`, so a native/headless host cannot pump the loop without reimplementing it.
- **`startApplicationLoop` hard-depends on `requestAnimationFrame`** with no backend seam, unlike windowing which is fully backend-abstracted. The loop is web-only where the window layer is host-portable — an asymmetry for a package whose stated job is "bridging platform events."
- **Multi-window management is implied but not provided.** The `WindowBackend` takes a target window per call (good), but there is no application-level window registry, no "main window," no `getApplicationWindows`/`forEachWindow`, and `openWindow` reconfigures the passed entity rather than minting one. Multi-window is left entirely to the caller.
- **Window minor gaps:** no `onMove`/position-change _listener_ wiring (the signal exists and `setWindowPosition` emits it, but no `attachWindowMove` reads OS/screen moves on web); no `getWindowDisplay`/multi-monitor association (deferred to `@flighthq/screen`, reasonable); `WindowOptions.center`/`frame`/`transparent` are typed but `center` is not applied in `openWindow` (only `centerWindow` does it) and `frame`/`transparent` are native-only by design.

## Naming / API-shape notes

- Naming is consistent and self-identifying: every function carries the full type word (`setWindowMaximumSize`, `computeWindowDeviceTransform`, `attachWindowRenderState`). Verbs follow the house rules (`create*`/`dispose*`, `attach*`/`detach*`, `set*`/`get*`, `request*`).
- The `attach*`/`detach*` + internal-`WeakMap` teardown pattern is clean, idempotent, and keeps the public entity lean — matches the entity/runtime convention and the platform-suite event-capability shape.
- `lockApplicationPointer` is mis-named for what it does: it sets CSS touch/select/tap-highlight properties on an element, not Pointer Lock API (`requestPointerLock`). Either rename to reflect "prepare element for input" or implement actual pointer lock — currently a naming/behavior mismatch and an authoritative gap (no real pointer-lock/capture).
- `index.ts` exports several alias names (`createWebApplication`, `createAppWindow`, `createWebWindow`, `AppWindow`). These duplicate the canonical `createApplication`/`createApplicationWindow`/`ApplicationWindow` and dilute the "globally unique exported name" rule — the aliases add public surface for no clear gain.
- `webApplication.ts` / `webWindow.ts` exist solely to host those aliases; they add files without adding capability.
- `openWindow` applies the `center` option neither via the backend nor `centerWindow`, a small contract gap between `WindowOptions` and behavior.

## Recommendation

Treat the package as two domains and raise the weaker one. The windowing layer is essentially authoritative and should mostly be left alone (close the small `openWindow.center` and `attachWindowMove` gaps; resolve the `lockApplicationPointer` naming/behavior mismatch).

The application/main-loop layer is where the depth is missing and should be brought to AAA within this domain:

1. Add frame-rate control (target FPS / unlocked) and a max-delta clamp on `onUpdate`.
2. Add a fixed-timestep + interpolated-render option (accumulator) alongside the current variable loop.
3. Add `pauseApplicationLoop`/`resumeApplicationLoop`, run-state query, and a `stepApplicationLoop(delta)` for headless/manual driving, with the rAF driver behind a small loop backend so native/headless hosts can pump it (mirroring `WindowBackend`).
4. Expose elapsed time / frame count / measured FPS on the `Application` entity.
5. Add an application-level tick-error / uncaught-error hook and optional auto-pause on window deactivate.
6. Drop the redundant `createWebApplication`/`createAppWindow`/`createWebWindow`/`AppWindow` aliases (and their wrapper files) in favor of the canonical names.

As-is it is a robust _windowing_ library bolted to a _stub_ main loop; closing the loop/lifecycle gaps would move it from "solid" to "authoritative."
