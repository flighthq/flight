---
id: application
title: '@flighthq/application'
type: depth
target: application
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/application.md
  - tools/agents/docs/reviews/depth/application.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 72/100. A robust, near-authoritative _windowing_ library bolted to a _stub_ main loop; the windowing half is essentially done while the application/loop/lifecycle half is a thin `requestAnimationFrame` wrapper.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable application loop — frame-safety, run-state, and the small windowing-contract gaps the depth review already flagged. This is the 20% that makes the package usable for a real app without the caller reimplementing the loop.

Types first in `@flighthq/types` (`Application.ts`):

- Extend the `Application` entity with read-only frame metrics fields written by the loop, not the caller: `elapsedTime: number` (total seconds since first tick), `frameCount: number`, `deltaTime: number` (last clamped frame delta), and `isRunning: boolean`. Keep them on the entity as plain data; do not expose getters that hide them.
- Add `ApplicationLoopOptions` (`Readonly`): `{ maxDeltaTime?: number; targetFrameRate?: number }` — passed to `startApplicationLoop`.

Loop behavior in `application.ts`:

- **Max-delta clamp.** Clamp the per-frame delta to `maxDeltaTime` (default ~0.25s) before emitting `onUpdate`, killing the huge first delta after a backgrounded tab restores. This is a correctness fix, not a feature.
- **`pauseApplicationLoop(app)` / `resumeApplicationLoop(app)`** — stop emitting update/render without tearing down the rAF registration; `resume` re-seeds `lastTime` so the resumed frame has a sane delta (no accumulated gap dumped into `onUpdate`).
- **`isApplicationRunning(app): boolean`** — sentinel-style query off the entity `isRunning` flag.
- **`stepApplicationLoop(app, deltaTime): void`** — drive one update+render tick manually with a caller-supplied delta. The single most valuable Bronze addition: enables unit tests, fixed-step simulation, and any non-rAF/native host to pump the loop without touching internals.
- **`targetFrameRate` throttle** — when set, skip `onUpdate`/`onRender` until the accumulated time reaches the frame interval (simple cap; the accumulator/fixed-timestep model is Silver). Sentinel: `targetFrameRate <= 0` or unset → run free at display refresh.

Windowing contract gaps (small, close them now):

- **Apply `WindowOptions.center` in `openWindow`** so the typed option actually centers on open (currently only `centerWindow` does) — fix the typed-but-ignored contract.
- **`attachWindowMove(win, element)` / `detachWindowMove(win)`** — the `onMove` signal and `setWindowPosition` already emit it, but nothing reads OS/screen-originated moves. Add the listener half to complete the `attach*`/`detach*` symmetry (web: best-effort via screen-position polling/`screen` events where available, no-op otherwise).
- **Resolve `lockApplicationPointer` naming/behavior mismatch.** It sets CSS touch/select properties, not Pointer Lock. Rename to `prepareElementForInput(element)` (honest name) and add a real `lockApplicationPointer(element): Promise<void>` over `requestPointerLock` / `exitApplicationPointer()` as a distinct capability.

Cleanup (reduces public surface, no capability lost):

- **Drop the alias exports** `createWebApplication`, `createAppWindow`, `createWebWindow`, `AppWindow` and delete `webApplication.ts` / `webWindow.ts` (plus their test files). They duplicate canonical names and violate the "globally unique exported name" rule. Bronze because every later tier should build on the canonical names only.

### Silver

Competitive with a good app-runtime/game-loop library. A real timestep model, a backend seam for the loop (mirroring `WindowBackend`), auto-pause integration, and multi-window management.

Types first in `@flighthq/types`:

- **`LoopBackend` interface** + a `LoopBackendKind` string identifier-style seam, mirroring `WindowBackend`: `{ requestFrame(callback): handle; cancelFrame(handle): void; now(): number }`. This is the asymmetry fix — the loop becomes host-portable like windowing instead of hard-wired to `requestAnimationFrame`.
- **`TimestepMode`** as a `*Kind` string union contract: `'variable'` | `'fixed'` | `'semiFixed'`. Plain string, registry-friendly, serializable.
- Extend `ApplicationLoopOptions` with `{ timestepMode?: TimestepMode; fixedTimeStep?: number; maxUpdatesPerFrame?: number }`.
- Add a `FixedUpdate` signal payload carrying the fixed step, and an `interpolationAlpha: number` field on `Application` for interpolated render.

Loop capabilities in `application.ts`:

- **Fixed-timestep + interpolated render (accumulator loop).** `onUpdate` becomes the variable tick; add **`onFixedUpdate(fixedDelta)`** signal driven by the accumulator, with `maxUpdatesPerFrame` clamping to prevent the spiral-of-death, and `interpolationAlpha` exposed for `onRender` to blend. This is the canonical game-loop pattern and the headline Silver feature.
- **`getApplicationFrameRate(app): number`** — measured FPS (rolling average), distinct from the _target_.
- **Loop backend seam functions:** `getLoopBackend()` / `setLoopBackend(backend | null)` / `createWebLoopBackend()` — exact mirror of the window-backend trio, so native/headless hosts register a driver instead of relying on rAF. `stepApplicationLoop` (Bronze) becomes the natural manual driver behind a no-rAF backend.
- **Auto-pause integration.** `attachApplicationLifecycle(app, win)` — wire window `onDeactivate`/visibility-hidden to optional auto-pause and `onActivate` to resume, closing the depth-review gap where the window _detects_ visibility but the loop ignores it. Opt-in via an `enable*`-style attach, not default behavior.
- **Application-level lifecycle signals** (the loop-owned subset; deep app identity stays in `@flighthq/app`): add `onActivate`, `onDeactivate`, `onError(error)` to the `Application` entity via an `enableApplicationLifecycleSignals(app)` group, keeping the cost opt-in.
- **Tick-error hook.** Wrap `onUpdate`/`onRender` emission so a thrown handler routes to `onError` (or a supplied policy) instead of silently killing the rAF chain — currently a single throw stops the whole loop.

Multi-window management (the depth review's "implied but not provided" gap):

- **`createApplicationWindow` mints, `openWindow` opens** — keep the current entity-reconfigure path but add an application-level registry: `registerApplicationWindow(app, win)`, `unregisterApplicationWindow(app, win)`, `getApplicationWindows(app): readonly ApplicationWindow[]`, `getApplicationMainWindow(app): ApplicationWindow | null`, `setApplicationMainWindow(app, win)`.
- **`forEachApplicationWindow(app, fn)`** — iteration without allocating the array in hot paths.

Windowing depth polish:

- **`getWindowDisplay` association** stub that defers to `@flighthq/screen` (cross-package; see Sequencing) so multi-monitor placement has a seam even before `screen` is wired.

### Gold

Authoritative / AAA — exhaustive coverage, performance, full error handling, and 1:1 Rust-port parity. Nothing a domain expert would find missing in an application-runtime + windowing library.

Loop / scheduling depth:

- **`semiFixed` timestep** (variable step capped at a max, no interpolation) completing the `TimestepMode` set, plus **frame pacing / vsync-aware scheduling** options and a **background frame-rate** cap (`backgroundFrameRate`) applied automatically when deactivated.
- **Phase scheduler:** ordered loop phases (`'input' | 'fixedUpdate' | 'update' | 'lateUpdate' | 'render' | 'postRender'`) as a `*Kind`-keyed registry, so subsystems (input, tween, render) attach to named phases with priority instead of racing on a single `onUpdate`. Free-function registration: `registerApplicationPhase(app, phaseKind, callback, priority)`.
- **Deterministic / record-replay mode** — a seeded clock backend that makes `stepApplicationLoop` fully reproducible, supporting conformance fingerprinting and the Rust parity harness.
- **High-resolution timing & jitter metrics** on the entity: min/max/avg frame time, dropped-frame count, exposed for profilers.

Windowing exhaustiveness:

- **Real `attachWindowMove` on every backend**, plus `onMaximize`/`onMinimize`/`onRestore` _listeners_ reading OS-originated state changes (today these signals are emitted only by our own setters — Gold reads them back from the OS via the backend `subscribe*` pattern).
- **`WindowOptions.frame` / `transparent`** honored by native backends (web no-op by design), and `setWindowContentProtection`, `setWindowHasShadow`, `flashWindowFrame` — the long tail Electron/Tauri expose.
- **Workspace/virtual-desktop and `setWindowVisibleOnAllWorkspaces`** native hooks behind the backend.

Quality bar:

- **Full edge-case + error tests**: alias-safe out-params already covered; add accumulator spiral-of-death, pause/resume delta continuity, max-delta clamp, backend swap mid-loop, multi-window registry teardown on `disposeApplication`, and tick-error isolation.
- **Headless conformance scene** in `tests/functional` driving `stepApplicationLoop` to a fixed frame count (deterministic clock) so the loop is fingerprintable.
- **1:1 Rust-port parity** — `flighthq-application` crate mirroring the `LoopBackend`/`WindowBackend` traits (`set_loop_backend`, `set_window_backend`), the accumulator loop, and the `host-winit`/`host-sdl`/`host-web`/`capture` drivers each implementing the loop-frame seam. The native default loop backend is `native`/std (per the Rust host-layer flip), web backend is the wasm instrument.
- **API docs** for the timestep model, the loop-backend seam, and the pause/visibility integration — the three areas where misuse is easiest.

## Sequencing & effort

Recommended order (each step unblocks the next):

1. **Bronze cleanup + windowing contract gaps first** (low effort, ~0.5 day). Drop the four aliases and their files, apply `center` in `openWindow`, add `attachWindowMove`, split `lockApplicationPointer`. Pure surface-tidying and small fixes; do it before adding loop code so later work builds on canonical names only.
2. **Bronze loop safety** (low–medium, ~1 day). Max-delta clamp, `pauseApplicationLoop`/`resumeApplicationLoop`, `isApplicationRunning`, `stepApplicationLoop`, basic `targetFrameRate` cap, and the `Application` metrics fields. `stepApplicationLoop` is the keystone — land it early because it makes everything else testable.
3. **Silver `LoopBackend` seam** (medium, ~1 day). Define the trait in `@flighthq/types`, refactor `startApplicationLoop` onto `getLoopBackend()`/`createWebLoopBackend()`. This is the asymmetry fix and a prerequisite for the Rust port and headless hosts.
4. **Silver fixed-timestep/accumulator + measured FPS + tick-error hook** (medium–high, ~2 days). The substantive feature work; depends on the metrics fields (step 2) and benefits from the backend seam (step 3) for deterministic tests.
5. **Silver multi-window registry + auto-pause/lifecycle signals** (medium, ~1–1.5 days). Registry is self-contained; auto-pause depends on the pause API (step 2) and the window visibility signals (already present).
6. **Gold** (large, ongoing). Phase scheduler, deterministic clock, native windowing long tail, conformance scene, and Rust parity. Treat as the genuine frontier after Silver lands.

Dependencies on other packages / types:

- **`@flighthq/types` is the gate for every tier** — `Application` field additions, `ApplicationLoopOptions`, `LoopBackend`, `TimestepMode`, and the lifecycle signal payloads must land in the header layer before implementation, per the design rules.
- **`@flighthq/signals`** — new `onFixedUpdate`, `onActivate`/`onDeactivate`/`onError` go through the existing signals dependency; gate them behind `enableApplicationLifecycleSignals` so cost stays opt-in.
- **`@flighthq/screen`** — `getWindowDisplay`/multi-monitor association is genuinely cross-package; surface as a seam in Silver, full wiring is a `screen`-package concern (deferred by design in the current map).
- **`@flighthq/app`** — deep app identity/control (quit, single-instance, activate-on-file-open) is owned there by the map. Keep `application` to _loop-owned_ lifecycle (pause-on-blur, tick-error). The `onActivate`/`onDeactivate`/`onError` added here are the loop's view, not duplicates of `@flighthq/app`'s app-process events — flag this boundary explicitly to avoid drift.

Cross-package / design-decision items to surface to the user before acting autonomously:

- **`LoopBackend` seam placement.** A loop backend in `application` is consistent with `WindowBackend` living here, but if a future native host wants one driver for both, consider whether the loop frame-seam belongs in the `host-*` layer instead. Decide before step 3.
- **Phase scheduler scope (Gold).** Named loop phases overlap conceptually with how `tween`, `input`, and `render` currently self-schedule on `onUpdate`. Introducing a phase registry is an SDK-wide ordering decision, not an `application`-local one — raise it as a design question rather than building it unilaterally.
- **Removing the alias exports** is technically a public-API change; pre-release status (no consumers) makes it safe, but confirm no example/tool imports `createWebApplication`/`AppWindow` before deleting (`npm run api` shows them only here, but grep examples first).

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

> Build `@flighthq/application` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
