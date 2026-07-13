---
package: '@flighthq/application'
status: solid
score: 88
updated: 2026-07-13
ingested:
  - status.md
  - source (packages/application/src)
  - packages/types/src/Application.ts
  - packages/types/src/ApplicationLoopOptions.ts
  - packages/types/src/LoopBackend.ts
  - packages/types/src/ApplicationWindow.ts
  - charter.md
---

# application — Review

Survey of the live tree (2026-07-13). This **supersedes** the 2026-06-25 merge-gate review (`reject — 38/100`), whose three blocking findings are all resolved in-tree:

1. `LoopBackend` and `ApplicationLoopOptions` now exist as their own files in `@flighthq/types` (`LoopBackend.ts`, `ApplicationLoopOptions.ts`) — the one-concept-per-file split the merge review asked for, not just a co-located landing.
2. The `Application` interface carries the full loop surface (`deltaTime`, `elapsedTime`, `frameCount`, `interpolationAlpha`, `isRunning`, `windows`, and the opt-in nullable `onActivate`/`onDeactivate`/`onError`/`onFixedUpdate` signals).
3. `WindowBackend` declares the `setContentProtection`/`flashWindowFrame`/`setHasShadow` triplet (`ApplicationWindow.ts:116-121`).

The non-blocking cleanup also landed: the dead `LoopState.accumulated` field is gone (only `fixedAccumulator` remains), and the Package Map line in `agents/index.md` now describes the full loop + windowing surface. The package compiles and its 139 tests (61 loop + 78 window) are colocated and passing per status.

## Verdict

`solid — 88/100`. A deliberate, charter-aligned AAA build-out of the two chartered subjects. The **loop** (22 exports): start/stop/pause/resume plus deterministic headless `stepApplicationLoop`, fixed-timestep accumulator with `interpolationAlpha` and a `maxUpdatesPerFrame` spiral-of-death guard, `targetFrameRate` + `backgroundFrameRate` throttling keyed off document visibility, `maxDeltaTime` clamping, rolling-average FPS (`getApplicationFrameRate`, 60-frame window), opt-in lifecycle signals (`enableApplicationLifecycleSignals`), an `onError` sink that isolates listener failures, a multi-window registry with main-window selection, and a three-method `LoopBackend` seam (`requestFrame`/`cancelFrame`/`now`) with a lazy web rAF default. The **windowing** surface (61 exports): full state/control (open/close/center/focus/hide/show/maximize/minimize/restore, bounds, min/max size, position, title, icon, opacity, progress, always-on-top, skip-taskbar, menu-bar, parent, resizable, content protection, shadow, frame flash, attention, display lookup), ten attach/detach event pairs, fullscreen + a correctly-split pointer-lock (`lockApplicationPointer` requests Pointer Lock; `prepareElementForInput` does the CSS prep), and a `WindowBackend` seam whose web default fills every method. Held below 90 by the loop-metrics gap, the `stepApplicationLoop`/fixed-mode asymmetry, and the undecided decomposition forks the charter itself flags.

## Present capabilities (verified against source)

- **Loop core:** `createApplication`, `startApplicationLoop(app, options?)` over `ApplicationLoopOptions` (`maxDeltaTime`, `targetFrameRate`, `backgroundFrameRate`, `fixedTimeStep`, `maxUpdatesPerFrame`), `stopApplicationLoop`, `pauseApplicationLoop`/`resumeApplicationLoop`, `stepApplicationLoop(app, deltaTime)` for deterministic headless ticking, `isApplicationRunning`.
- **Fixed timestep:** accumulator drains in whole steps emitting `onFixedUpdate(fixedDeltaTime)`, `interpolationAlpha` = fractional remainder for render blending, iteration cap flushes the accumulator (spiral guard) (`application.ts:263-281`).
- **Metrics:** `deltaTime`/`elapsedTime`/`frameCount` maintained per tick and per step; `getApplicationFrameRate` rolling average.
- **Lifecycle:** `enableApplicationLifecycleSignals` allocates the nullable signals; `attachApplicationLifecycle(app, win)` pauses/resumes the loop on window deactivate/activate with per-window teardown via a keyed WeakMap; `attachApplicationExit`/`detachApplicationExit`; `disposeApplication` (correct `dispose*` — detach to GC).
- **Registry:** `registerApplicationWindow`/`unregisterApplicationWindow`, `getApplicationWindows`/`forEachApplicationWindow`, `getApplicationMainWindow` (`null` sentinel)/`setApplicationMainWindow`.
- **Seams:** `getLoopBackend`/`setLoopBackend`/`createWebLoopBackend`; `getWindowBackend`/`setWindowBackend`/`createWebWindowBackend` — both lazy, both fully filled on web, native-only methods as documented no-ops.
- **Hygiene:** sentinels not throws (`getWindowDisplay` → `-1`, `getApplicationMainWindow` → `null`); `Readonly<>` on read-only params; no top-level side effects; deps only `signals` + `types`; exports alphabetized in both files; out-param `computeWindowDeviceTransform` has the stale-`out` overwrite test the contract wants.

## Gaps

1. **`stepApplicationLoop` is variable-mode only.** It forces `interpolationAlpha = 1` and never drains the fixed accumulator or emits `onFixedUpdate` (`application.ts:312-337`), so fixed-timestep behavior cannot be driven deterministically headless — the one loop feature `step` cannot reproduce. Whether `step` should honor an active fixed-mode loop state (or take options) is a small design call, not a sweep item.
2. **No frame-time jitter / dropped-frame metrics** (min/max/avg frame time, dropped-frame count). Parked in status as cross-boundary — the read-only fields belong on the `Application` interface in `@flighthq/types`. The loop-side math is in-package and ready to receive them.
3. **Repeated `onError` guard shape.** The `if (app.onError !== null) try/catch else emit` block is written out three times (tick, `stepApplicationLoop`, fixed inner loop). A per-emit guard not a feature branch, so it doesn't tax importers, but it is within-unit repetition a shared internal helper would fold.
4. **No `semiFixed` timestep / phase scheduler** — chartered open directions, deliberately unbuilt; listed for completeness, not as debt.

## Charter contradictions

None substantive. The charter's "What it is" stats are stale — it says 70 exports / 133 tests; the tree now has 83 exports (22 loop + 61 window, the `WindowBackend` triplet and friends having landed) and 139 tests. The 2026-07-02 Decisions are all satisfied: the "missing types" false alarm is confirmed moot (types exist and are correct), dead `accumulated` is removed, and the decomposition posture (evaluate, don't split prematurely) remains an open direction, not a violation.

## Contract & docs fit

- Types-first now satisfied, including the layout convention (`LoopBackend.ts` / `ApplicationLoopOptions.ts` as own files).
- Package Map line in `agents/index.md` is accurate — charter Open direction 4 ("Package Map update") is done and can be retired at the next direction session.
- The merge review's suggested checker — catch an implementation importing a `@flighthq/types` symbol that does not exist — remains a good `packages:check` candidate; this package was the motivating case.

## Candidate open directions

- Windowing extraction (`@flighthq/window`, 61 exports) and loop extraction (`@flighthq/loop`, 22 exports) — the charter's own forks 1–2; the surfaces are coherent and may be bedrock as-is. Needs a bedrock-test ruling, not code.
- Fixed-update support in `stepApplicationLoop` (gap 1) — small API-design call.
- Jitter/dropped-frame metrics fields on `Application` (gap 2) — cross-boundary types addition, then in-package math.
