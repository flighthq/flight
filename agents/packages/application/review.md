---
package: '@flighthq/application'
status: solid
score: 85
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - source (packages/application/src)
  - assessment.md
---

# application — Review

Full re-survey of the live tree (2026-09-02). Supersedes the 2026-08-25 fast-assessment score update (solid 88) whose verdict prose was carried forward from the 2026-07-13 review. Sixteen commits have landed since the 2026-08-25 update, restructuring the Host capability model, the Entity constructor invariant, pointer-lock provenance, and the window close lifecycle. These are significant architectural changes that warrant a detail review rather than a score adjustment.

## Verdict

`solid — 85/100`. The package is architecturally mature: the loop and windowing surfaces are complete, well-tested, and charter-aligned. The score drops from the prior 88 because the re-survey surfaced issues the prior review could not have seen (they shipped after it): a module-scoped mutable singleton (`_pointerLockBackend`) that contradicts the explicit-dependency design constraint, and the absence of a guard module and `explain*` queries across the entire package. The harness half of `ApplicationRenderView` remains unbuilt, and near-zero adoption across examples means the package's primary orchestration mission is incomplete in practice even if the primitives are solid.

## Present capabilities (verified against source)

### Loop (`application.ts` — 420 lines, 19 exported functions)

- **Lifecycle:** `createApplication` (Entity-backed via `createEntity`), `startApplicationLoop(host, app, options?)` over `HasAppLoop & HasAppVisibilityQuery`, `stopApplicationLoop`, `pauseApplicationLoop`/`resumeApplicationLoop` (pause re-seeds `lastTime = -1` to avoid dumping the gap), `stepApplicationLoop(app, deltaTime, options?)` for deterministic headless ticking, `isApplicationRunning`, `disposeApplication` (correct `dispose*`).
- **Fixed timestep:** `stepApplicationLoop` is now self-sufficient with explicit `ApplicationStepOptions` (`fixedTimeStep`, `maxDeltaTime`, `maxUpdatesPerFrame`). Accumulator drains in whole steps emitting `onFixedUpdate(fixedDeltaTime)`; `interpolationAlpha` = fractional remainder; iteration cap flushes residual (spiral guard). Residual carries across calls, including across variable-step interludes (`application.ts:259-269`). Prior review gap 1 is resolved.
- **Metrics:** `deltaTime`/`elapsedTime`/`frameCount` maintained per tick; `getApplicationFrameRate` rolling 60-sample window. `maxDeltaTime` defaults to 250ms.
- **Error isolation:** `invokeWithApplicationErrorHandling` wraps `onFixedUpdate`, `onUpdate`, and `onRender` emission. The triplicated guard from the prior review (gap 3) is now a single internal function used by both `startApplicationLoop` and `stepApplicationLoop` via `applyApplicationStep`.
- **Throttling:** `targetFrameRate` and `backgroundFrameRate` with visibility query from the explicit host.
- **Lifecycle signals:** `enableApplicationLifecycleSignals` allocates the nullable `onActivate`/`onDeactivate`/`onError`/`onFixedUpdate`; `attachApplicationLifecycle(app, win)` pauses/resumes on window deactivate/activate with per-window teardown via a keyed `WeakMap`.
- **Window registry:** `registerApplicationWindow`/`unregisterApplicationWindow`, `getApplicationWindows`/`forEachApplicationWindow`, `getApplicationMainWindow` (null sentinel)/`setApplicationMainWindow`.

### Windowing (`window.ts` — 698 lines, 59 exported functions)

- **Window entity:** `createApplicationWindow` (Entity-backed), full state/control surface: `openWindow`, `closeWindow`, `centerWindow`, `focusWindow`, `hideWindow`/`showWindow`, `maximizeWindow`/`minimizeWindow`/`restoreWindow`, `getWindowBounds` (out-param), position/size/title/icon/opacity/progress/resizable/always-on-top/skip-taskbar/menu-bar/parent/content-protection/shadow/frame-flash/attention.
- **Host capability model:** All window operations take narrow Host trait intersections. The `WindowOperationHost<Operation>` utility type picks exactly the needed method from `WindowBackend`, so a caller provides only the capability it uses — compile-time evidence of availability. This is a significant improvement since the prior review.
- **Attach/detach pairs (10):** close, drop-file, focus, fullscreen, move, orientation, render-context, render-state, resize, visibility. Each is idempotent (re-attach cleans up the prior observer first) and uses the side-table observer registry.
- **Close lifecycle:** `notifyWindowClosed` is the single terminal-close choke point; `_terminalWindows` `WeakSet` ensures idempotent terminal emission; `disposeApplicationWindow` drains observers in `finally` even when a close listener throws. `attachWindow` and `openWindow` re-arm the terminal state and backend reference on reuse.
- **Pointer lock:** `lockApplicationPointer`/`exitApplicationPointerLock` with method-tight outcome types (`InputPointerLockRequestOutcome`/`InputPointerLockExitOutcome`). Successful acquisition pins its exit to the originating backend even if a later caller supplies a different Host.
- **Fullscreen:** `requestApplicationFullscreen`/`exitApplicationFullscreen` delegate to `HasUiFullscreen`.
- **Input preparation:** `prepareElementForInput` delegates to `HasInputTargetPreparation`.
- **Native window attachment:** `attachWindow(host, win, handle, ownership)` with `WindowAttachmentOwnership` distinguishing host-owned vs flight-owned.

### ApplicationRenderView (`applicationRenderView.ts` — 91 lines, 4 exported functions)

- **Assembly contract:** `createApplicationRenderView(window, renderState, renderTarget, viewport, resize)` links four independently accessible components on an Entity with a runtime holding the resize callback and synchronize closure.
- **Synchronization:** `synchronizeApplicationRenderView` reconciles device-pixel dimensions, viewport, pixel ratio, and device transform from the window authority. `attachApplicationRenderView`/`detachApplicationRenderView` wire/unwire window `onResize` to automatic synchronization.

### Export lanes

- Public lane (`index.ts`): 81 named exports (selective re-export from `contract.ts`).
- Contract lane (`contract.ts`): `export *` from all three source files = 82 exports. `notifyWindowClosed` is contract-only, which is correct — it is an internal choke point other packages may need (e.g., host backends) but not end users.
- `sideEffects: false` declared. Dependencies: `entity`, `signals`, `types` only.

### Tests

- **153 test cases** across 3 colocated test files (59 in `application.test.ts`, 89 in `window.test.ts`, 5 in `applicationRenderView.test.ts`).
- Tests use recording backends (`RecordingWindowBackend`, `RecordingFullscreenBackend`, etc.) and manual loop backends for deterministic control.
- Every exported function has at least one `describe` block; `describe` blocks are alphabetized and mirror exported names.
- The `computeWindowDeviceTransform` aliased-out test (read-before-write) is present.
- Pointer-lock tests cover all five outcome types for both request and exit, including provider pinning and backend defect transparency.
- The headless deterministic stepping contract is pinned by an explicit reproducibility test (`stepApplicationLoop` describe block).

## Gaps

1. **Module-scoped mutable singleton: `_pointerLockBackend`.** `window.ts:685` declares `let _pointerLockBackend: InputPointerLockBackend | null = null`. This is module-scoped mutable state that `lockApplicationPointer` and `exitApplicationPointerLock` reach for — a function-level implicit dependency. The four `WeakMap` side tables (`_applicationObservers`, `_applicationLoopState`, `_lifecycleKeys`, `_mainWindows` in `application.ts`; `_applicationWindowObservers`, `_terminalWindows`, `_windowBackends` in `window.ts`) are keyed by entity identity and are benign, but `_pointerLockBackend` is a global singleton: two independent applications cannot independently lock pointers because there is one module-level slot. The fix is likely to key it by the locked target or application, or pass it explicitly.

2. **No guard module or `explain*` query.** Status.md confirms this and the diagnostics convention census does not list `application`. Several silent sentinels exist without diagnostic twins: `getApplicationMainWindow` returns `null`, `getApplicationFrameRate` returns `0`, and (now removed) `getWindowDisplay` returned `-1`. `enableApplicationGuards` does not exist.

3. **No frame-time jitter metrics.** No `droppedFrames` / min / max / avg frame-time field on `Application`. Status notes this as a `@flighthq/types` addition with in-package math. Unchanged from the prior review.

4. **No deterministic loop backend or headless conformance scene.** Status notes this: `DeterministicLoopBackend` does not exist; `functional/scenes/` carries only `application-render-view.webgl.ts`. `stepApplicationLoop` fills the deterministic headless need for unit tests, but a functional scene would validate the full loop integration path.

5. **`ApplicationRenderView` harness is unbuilt.** The assembly exists and is tested, but the batteries-included harness (composing loop + view so a caller goes from "I have a page" to "running and rendering" in one step) does not. Adoption is near zero: charter documents 39 of 41 examples hand-rolling `requestAnimationFrame`, 0 using `createGlApplicationRenderView`. This is charted as Directed work with open forks (charter Open directions 5, 6, 7) — not in-package work, but it means the package's primary orchestration mission is incomplete.

6. **No `semiFixed` timestep mode.** No `TimestepMode` discriminant exists. `fixedTimeStep === 0` gives variable mode; `> 0` gives accumulator mode. A semi-fixed mode (variable clamped to fixed multiples) is a recognized pattern but not chartered as a requirement — listed for completeness.

7. **No phase scheduler.** `registerApplicationPhase` / `ApplicationPhase` do not exist. Status notes this as an SDK-wide ordering ruling before it is in-package work.

8. **Runtime side tables have not migrated to Entity runtime slots.** `_applicationObservers`, `_applicationLoopState`, and `_mainWindows` are hand-rolled identity maps (`WeakMap<Application, ...>`). Now that `Application` is an Entity, these are candidates for `getRuntime`-based runtime slots, as status.md notes. This is a follow-up from the Entity closure work, not a defect.

## Charter contradictions

1. **North star 2 — "swappable backends" via Host slots.** The loop surface has fully migrated to the explicit Host model (`HasAppLoop`, `HasAppVisibilityQuery`). The windowing surface now uses `WindowOperationHost<Operation>` for point operations, and `Has*Subscription` traits for event attachment. The `WindowBackend` type still exists as the capability union, but functions no longer rely on a stored-backend singleton — they take the host at the call site. This is a positive evolution that satisfies the charter's North star more completely than the prior review found. **No contradiction; the charter's note about `*Backend` seam "pending migration" is now stale and could be updated.**

2. **Charter "What it is" statistics.** Charter says "70 exports across 2 source files, 133 tests." The tree now has 82 exported functions across 3 source files (application.ts, window.ts, applicationRenderView.ts) and 153 test cases. The charter text should be refreshed. This is a minor staleness, not a contradiction.

3. **Explicit dependency constraint vs `_pointerLockBackend`.** The codebase map says "No `set*Backend` singletons, no module-scoped mutable state that functions reach for." `_pointerLockBackend` at `window.ts:685` is a `let` that `lockApplicationPointer` writes and `exitApplicationPointerLock` reads — module-scoped mutable state two functions reach for. It exists for a legitimate provenance-tracking reason (exit through the backend that acquired the lock), but the mechanism contradicts the stated design constraint. The `WeakMap` side tables keyed by entity identity are idiomatic Flight (analogous to runtime slots); the global `let` is not.

## Contract & docs fit

### Package conformance

- **Types-first:** All types (`Application`, `ApplicationWindow`, `ApplicationLoopOptions`, `ApplicationStepOptions`, `LoopBackend`, `WindowBackend`, `ApplicationRenderView`, `ApplicationRenderViewResize`, and the many `Has*` host traits) live in `@flighthq/types`. The implementation exports functions only. Satisfied.
- **Export lanes:** Two blessed lanes (`.` and `./contract`), no subpath exports. Public lane is a selective re-export; contract lane is `export *`. Satisfied.
- **Side-effect-free:** `sideEffects: false` declared. No top-level registrations, listeners, or mutations. Satisfied.
- **Entity invariant:** `createApplication` and `createApplicationWindow` both use `createEntity`. `createApplicationRenderView` uses `createEntity` and `createEntityRuntime`. Satisfied (recently landed per status 2026-08-29).
- **Naming:** Full unabbreviated type names in all exported functions. Globally unique names. Satisfied.
- **Sentinels not throws:** `getApplicationMainWindow` returns `null`, `getApplicationFrameRate` returns `0`, `attachWindow` returns `boolean`. No throws for expected failures. Satisfied.
- **`Readonly<>`:** Applied on parameters where appropriate (`Readonly<ApplicationLoopOptions>`, `Readonly<ApplicationStepOptions>`, `Readonly<ApplicationWindow>` on read-only params, `Readonly<WindowOptions>`). Satisfied.
- **Out-param safety:** `computeWindowDeviceTransform` reads `win` before writing `out`. Tested for stale-value overwrite. Satisfied.
- **`dispose*` vs `destroy*`:** `disposeApplication` and `disposeApplicationWindow` detach observers to release to GC. No GPU resources, so no `destroy*`. Correct usage.

### Contract/docs revision candidates

- **Charter "What it is" numbers** (70 exports / 2 files / 133 tests) are stale — should read 82 exports / 3 source files / 153 tests.
- **Charter North star 2** references `*Backend` seam "pending migration" for windowing — the migration has substantially landed with the `WindowOperationHost<Operation>` pattern and `Has*` trait injection. The note is stale.
- **Prior review (this file, as of 2026-08-25)** references `getWindowDisplay` returning `-1` and a `getWindowBackend`/`setWindowBackend`/`createWebWindowBackend` seam — both removed (commit `3cca7a65a` "remove absent display lookup" and the host-injection refactor). These are no longer in the tree.
- **Assessment Directed item 5** ("Complete the Entity constructor invariant") is fully landed per status 2026-08-29 — both `Application` and `ApplicationWindow` now use `createEntity`. This should be marked LANDED.

## Candidate open directions

1. **`_pointerLockBackend` singleton vs explicit dependency.** Should pointer-lock provenance be keyed per-application or per-target rather than held in a module-scoped `let`? The current shape works for a single-application context but breaks the explicit-dependency constraint and would fail if two independent `Application` instances needed independent pointer-lock sessions.

2. **Guard module.** The diagnostics convention requires an `enableApplicationGuards` function and `explain*` queries for silent sentinels. Neither exists. This is documented in status but has no charter direction.

3. **Frame-time jitter metrics fields.** Carried forward from the prior review. Requires a `@flighthq/types` addition before in-package math.

4. **Deterministic loop backend.** A `DeterministicLoopBackend` and/or headless conformance functional scene would validate the full loop path outside unit tests.
