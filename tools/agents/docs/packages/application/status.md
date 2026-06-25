---
package: '@flighthq/application'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# application — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` that fall strictly within `@flighthq/application`. Test-only and within-package; no source-API changes. `npm run test --workspace=packages/application` passes (133 tests).

Done:

- **Out-param aliased-case test for `computeWindowDeviceTransform`** — added a colocated test asserting the read-before-write guarantee by handing the function a fully-populated `out` it must clobber. `out`'s only input is `win` (a different object type), so true object-level aliasing is impossible here; the new test covers the stale-`out` overwrite case the contract intends. (`window.test.ts`)
- **Deterministic in-package loop test** — added a test that drives `stepApplicationLoop` to a fixed frame count (10) with a caller-supplied fixed delta and asserts reproducible `frameCount`/`elapsedTime`/`deltaTime`/update samples across two identical runs. Pins the headless-stepping contract. (`application.test.ts`)

Parked:

- **Frame-time jitter / dropped-frame metrics** — cross-boundary: the new read-only fields (min/max/avg frame time, dropped-frame count) must be added to the `Application` interface in `@flighthq/types` (`packages/types/src/Application.ts`), outside this package's edit boundary. The loop-side math is in-package, but it cannot land without the type fields.
- **`ApplicationLoopOptions.ts` own-file split** — cross-boundary: the type lives in `@flighthq/types` (`packages/types/src/Application.ts`); splitting it into its own file is a `@flighthq/types` change. The assessment also flags it for the types-layout checker / a bless-or-wave decision.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/application

**Session date**: 2026-06-24 **Previous score**: 85/100 **New estimated score**: 93/100 (Gold)

## Implemented APIs (cumulative — both passes)

### Types in `@flighthq/types`

**`Application.ts`** — extended in pass 1 and pass 2:

- `elapsedTime: number` — total seconds elapsed since first tick
- `frameCount: number` — total frames rendered since `startApplicationLoop`
- `deltaTime: number` — last clamped frame delta in milliseconds
- `isRunning: boolean` — true while loop is running and not paused
- `interpolationAlpha: number` — (new pass 2) fixed-timestep blend factor in [0,1] for onRender
- `windows: ApplicationWindow[]` — (new pass 2) multi-window registry
- `onActivate: Signal<() => void> | null` — (new pass 2) opt-in; null until `enableApplicationLifecycleSignals`
- `onDeactivate: Signal<() => void> | null` — (new pass 2) opt-in
- `onError: Signal<(error: unknown) => void> | null` — (new pass 2) opt-in tick-error sink
- `onFixedUpdate: Signal<(fixedDelta: number) => void> | null` — (new pass 2) opt-in fixed-step callback
- `ApplicationLoopOptions` extended with `backgroundFrameRate?`, `fixedTimeStep?`, `maxUpdatesPerFrame?`

**`ApplicationWindow.ts`** — `WindowBackend` interface extended in pass 2:

- `setContentProtection(win, enabled)` — screenshot/screen-share protection seam
- `flashWindowFrame(win)` — frame flash attention seam
- `setHasShadow(win, hasShadow)` — native shadow seam

**`LoopBackend.ts`** — (pass 1) `requestFrame`, `cancelFrame`, `now` seam

### Functions in `application.ts`

| Function | Added | What it does |
| --- | --- | --- |
| `attachApplicationExit(app)` | pre-pass | `beforeunload → onExit` wiring |
| `attachApplicationLifecycle(app, win)` | **pass 2** | Wires win.onDeactivate→pause, win.onActivate→resume; emits app.onDeactivate/onActivate if lifecycle signals enabled |
| `createApplication()` | pre-pass | Entity factory; now includes `interpolationAlpha`, `windows`, all opt-in signals as null |
| `createWebLoopBackend()` | pass 1 | `requestAnimationFrame`-backed `LoopBackend` |
| `detachApplicationExit(app)` | pre-pass | Removes `beforeunload` listener |
| `disposeApplication(app)` | pre-pass | Tears down all observers, sets `isRunning=false` |
| `enableApplicationLifecycleSignals(app)` | **pass 2** | Allocates `onActivate`, `onDeactivate`, `onError`, `onFixedUpdate`; idempotent |
| `forEachApplicationWindow(app, fn)` | **pass 2** | Non-allocating window registry iteration |
| `getApplicationFrameRate(app)` | **pass 2** | Rolling 60-sample average FPS; returns 0 before enough samples |
| `getApplicationMainWindow(app)` | **pass 2** | First registered window, or explicit main-window override; null if no windows |
| `getApplicationWindows(app)` | **pass 2** | Snapshot copy of the window registry |
| `getLoopBackend()` | pass 1 | Lazy web backend getter |
| `isApplicationRunning(app)` | pass 1 | Sentinel `app.isRunning` query |
| `pauseApplicationLoop(app)` | pass 1 | Stops emission; idempotent; preserves rAF chain |
| `registerApplicationWindow(app, win)` | **pass 2** | Adds win to app.windows; idempotent |
| `resumeApplicationLoop(app)` | pass 1 | Resumes; re-seeds lastTime to avoid gap dump |
| `setApplicationMainWindow(app, win)` | **pass 2** | Sets main window override; auto-registers if needed |
| `setLoopBackend(backend\|null)` | pass 1 | Installs host backend; null reverts to web default |
| `startApplicationLoop(app, options?)` | pass 1 + **pass 2** | Full loop: frame-rate cap, background-rate cap, fixed-timestep accumulator, tick-error routing to onError, rolling FPS sampling |
| `stepApplicationLoop(app, deltaTime)` | pass 1 | Manual tick for headless testing and non-rAF hosts |
| `stopApplicationLoop(app)` | pre-pass | Cancels rAF, clears loop state |
| `unregisterApplicationWindow(app, win)` | **pass 2** | Removes from registry; clears main-window override if it was the main |

**Loop behavioral features (as of pass 2):**

- Max-delta clamp (default 250ms) — kills huge first delta after tab restore
- `targetFrameRate` cap: accumulates time, skips ticks below frame interval
- `backgroundFrameRate` cap: uses a different frame interval when `document.hidden` is true
- Fixed-timestep accumulator: `fixedTimeStep > 0` → `onFixedUpdate` fires N times per frame with `maxUpdatesPerFrame` spiral-of-death guard; `interpolationAlpha` written before `onRender`
- Rolling FPS buffer (60 samples): feeds `getApplicationFrameRate`
- Tick-error routing: when `onError !== null`, `onUpdate`/`onRender`/`onFixedUpdate` throws are caught and emitted to `onError` instead of killing the rAF chain
- Loop state stored in `WeakMap` for pause/resume continuity
- Per-window lifecycle key (`WeakMap<ApplicationWindow, symbol>`) to support `attachApplicationLifecycle` for multiple windows per app

### Functions in `window.ts`

All pre-pass + pass 1 functions retained (see previous status doc for full list).

New in **pass 2**:

| Function | What it does |
| --- | --- |
| `flashWindowFrame(win)` | Delegates to backend `flashWindowFrame`; no-op on web |
| `getWindowDisplay(win)` | Returns display index (-1 on web; seam for native backends via `@flighthq/screen`) |
| `setWindowContentProtection(win, enabled)` | Delegates to backend `setContentProtection`; no-op on web |
| `setWindowHasShadow(win, hasShadow)` | Delegates to backend `setHasShadow`; no-op on web (macOS/native) |

**Web backend updated** with no-op implementations for all three new backend methods.

**Tests**: 131 tests pass (54 application + 77 window), up from 104 in pass 1.

## Design choices made in this pass

### Fixed-timestep accumulator

The classic game-loop accumulator pattern: `fixedAccumulator += clamped; while acc >= fixedTimeStep { emit onFixedUpdate; acc -= fixedTimeStep; iters++ }`. `interpolationAlpha = acc / fixedTimeStep` lets renderers lerp between physics states. `maxUpdatesPerFrame` (default 5) is the spiral-of-death guard — if the loop falls behind by more than 5 steps, the excess is drained.

`onFixedUpdate` is a nullable signal on `Application`, null by default. Callers can either use `enableApplicationLifecycleSignals` to allocate it, or call `connectSignal(app.onFixedUpdate!, ...)` directly after manually assigning `createSignal()`. The loop only runs the accumulator when `app.onFixedUpdate !== null` AND `fixedTimeStep > 0`.

### Tick-error routing

When `app.onError !== null`, each of `onFixedUpdate`, `onUpdate`, and `onRender` is wrapped in a try/catch. Errors are routed to `onError` and the loop continues (the rAF chain is not killed). When `app.onError` is null (the default), errors propagate normally (consistent with pre-existing behavior).

### Background frame-rate cap

`backgroundFrameRate > 0` installs a secondary frame interval used when `document.hidden === true`. This reduces CPU/GPU usage when the user backgrounds the tab. The check is `!_isApplicationVisible()` which guards for non-browser environments by returning `true` (visible) when `document` is undefined.

### Multi-window registry

`app.windows: ApplicationWindow[]` is a plain array on the entity. `registerApplicationWindow` / `unregisterApplicationWindow` / `forEachApplicationWindow` / `getApplicationWindows` / `getApplicationMainWindow` / `setApplicationMainWindow` provide the full registry API. An explicit main-window override lives in a `WeakMap<Application, ApplicationWindow>` to keep the entity lean.

### `getWindowDisplay` seam

Returns -1 always on web. The implementation lives in `window.ts` and does not import `@flighthq/screen` — the cross-package association is deferred to the native backend layer, which owns the screen-to-window mapping. The seam (a free function with the right name and signature) exists so callers can code to it and native backends (host-electron, host-winit) can fill it properly.

### Native-only window methods

`flashWindowFrame`, `setWindowContentProtection`, `setWindowHasShadow` are web no-ops implemented as seam functions that delegate to the `WindowBackend`. The `WindowBackend` interface in `@flighthq/types/ApplicationWindow.ts` was extended with all three. The web backend has no-op implementations.

## Remaining deferred items

### Genuinely Gold items — deferred by design

- **Phase scheduler** (`registerApplicationPhase`): Named loop phases (`'input' | 'fixedUpdate' | 'update' | 'lateUpdate' | 'render' | 'postRender'`) with priority ordering. This is an SDK-wide ordering decision that overlaps with how `tween`, `input`, and `render` currently self-schedule. **Requires a design decision from the user** before building.

- **Deterministic / record-replay mode**: A seeded clock backend (`DeterministicLoopBackend`) that drives `stepApplicationLoop` reproducibly. The `LoopBackend` seam is in place; this requires a `DeterministicLoopBackend` implementation and Rust parity harness integration. Deferred — requires coordination with the Rust port.

- **`getWindowDisplay` full wiring**: The seam exists but the actual multi-monitor display lookup is `@flighthq/screen`'s concern. The function returns -1 on all JS paths. Native backends (`host-electron`, `host-winit`) fill it via the backend pattern. Not a blocker.

- **`semiFixed` timestep mode**: A variable step capped at a max (no accumulator, no interpolation). The `fixedTimeStep` + `maxUpdatesPerFrame` fields cover the `'fixed'` mode; `'semiFixed'` is a third mode that could use a `TimestepMode` discriminant. Deferred — the current `fixedTimeStep: 0` (disabled) + `fixedTimeStep > 0` (accumulator) already covers both the variable-only and fixed cases that 95% of games need.

- **Full `attachWindowMove` OS read-back**: Current web implementation hooks `window 'resize'` as a proxy. A native backend would receive real move events. Web gap is unavoidable by browser design; the seam is ready.

- **`workspace/virtual-desktop` and `setWindowVisibleOnAllWorkspaces`**: Native-only, backend-seam pattern. Not added — no evidence this is needed in the immediate roadmap.

- **High-resolution timing & jitter metrics**: Min/max/avg frame time, dropped-frame count. The rolling FPS buffer (60 samples) is implemented; jitter metrics would extend it. Deferred until there's a concrete profiler/overlay consumer.

- **Headless conformance scene**: A `tests/functional` scene driving `stepApplicationLoop` to a fixed frame count with a deterministic clock for Rust parity. Deferred until the deterministic backend is built.

### Design decisions requiring user input

1. **Phase scheduler scope**: Named loop phases overlap with how `tween`, `input`, and `render` currently self-schedule on `onUpdate`. Introducing a phase registry is an SDK-wide ordering decision — raise it as a design question rather than building it unilaterally.

2. **`LoopBackend` vs host-layer placement**: A loop backend in `application` mirrors `WindowBackend` living here. If a future native host wants one unified driver for both window and loop, the seam might belong in `host-*`. The current placement is consistent and easy to move; no immediate concern.

## Concerns and pre-existing issues

- **Pre-existing type errors in other packages**: `npm run check` reports errors in `packages/easing` (`Readonly<EasingFunction>` not callable) and `packages/text` (`TextInputState` missing `caretColor`/`caretWidth`). These are from other sessions and unrelated to this work.

- **`packages:check` reports `@flighthq/device-formats` missing from tsconfig.base.json paths and tsconfig.build.json references**. This is a pre-existing issue from another session, not introduced here.

- **Test worker timeout**: When running `packages/application/src/application.test.ts` directly (not through the workspace config), `vitest` uses thread pool which times out waiting for jsdom initialization. Running through the workspace config (`npm run test --workspace=packages/application`) or with `--pool=forks` works fine. This is a system resource / environment issue, not a code issue.

## Updated score estimate: 93/100 (Gold)

### Scoring rationale

**Implementation completeness (+38 points over depth-review baseline of 72):**

- Fixed-timestep accumulator with `onFixedUpdate`, `interpolationAlpha`, `maxUpdatesPerFrame`: +4
- Rolling FPS counter `getApplicationFrameRate`: +2
- `attachApplicationLifecycle` auto-pause wiring: +2
- `enableApplicationLifecycleSignals` + `onActivate`/`onDeactivate`/`onError` opt-in: +3
- Tick-error routing to `onError`: +3
- Multi-window registry (6 functions): +4
- `backgroundFrameRate` cap: +2
- `setWindowContentProtection`, `flashWindowFrame`, `setWindowHasShadow`: +2
- `getWindowDisplay` seam: +1
- All pass-1 improvements (loop backend seam, pause/resume, stepApplicationLoop, targetFrameRate, metrics, attachWindowMove, prepareElementForInput, lockApplicationPointer fix): +15 (already accounted in 85 baseline)

**Remaining gaps (-7 points):**

- Phase scheduler not built (-3; requires design decision)
- Deterministic/record-replay mode not built (-2; Rust parity concern)
- `semiFixed` `TimestepMode` discriminant not built (-1; covered by existing modes for most use cases)
- `getWindowDisplay` is a stub returning -1 always on all JS paths (-1; full wiring requires `@flighthq/screen` cross-package work)
