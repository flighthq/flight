---
package: '@flighthq/application'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/application.md
  - source
  - changes.patch
---

# application — Review

## Verdict

`solid — 88/100`. The package is two sub-domains under one roof: a now-mature **application loop/lifecycle** half and a near-authoritative **windowing** half. The bundle reviewed (`builder-67dc46d64`) closes essentially every loop/lifecycle gap the prior depth review flagged at 72/100 — frame-rate control, max-delta clamp, fixed-timestep accumulator, pause/resume, run-state, `stepApplicationLoop`, a `LoopBackend` seam, FPS metrics, a multi-window registry, opt-in lifecycle signals, tick-error routing — and resolves the two naming/behavior mismatches the depth review called out (the `lockApplicationPointer` mis-name and the redundant `createWebApplication`/`AppWindow` aliases). The worker's self-estimate of 93/100 (Gold) is close but slightly generous: the remaining gap is not "a few deferred Gold items" so much as the package still being a hand-written web-loop + web-window-backend whose host-portability is promised by seams that have no native consumer yet, plus a handful of small correctness/idiom nits below. I score it 88 — the strongest non-`authoritative` band, held back from `authoritative` by the seam-without-consumer asymmetry and the open phase/timestep design questions the charter has not settled.

## Present capabilities

Grounded in `67dc46d64:packages/application/src/` and the three types files (`packages/types/src/Application.ts`, `ApplicationWindow.ts`, `LoopBackend.ts`).

**Application loop / lifecycle (`application.ts`)** — the half that grew:

- Entity factory `createApplication` minting `onUpdate`/`onRender`/`onExit` plus the new fields `deltaTime`, `elapsedTime`, `frameCount`, `interpolationAlpha`, `isRunning`, `windows[]`, and the four null-by-default opt-in signals (`onActivate`/`onDeactivate`/`onError`/`onFixedUpdate`).
- `startApplicationLoop(app, options?)` — a single closure (`tick`) implementing: max-delta clamp (`maxDeltaTime`, default 250 ms), frame-rate cap (`targetFrameRate`), background throttle (`backgroundFrameRate` gated on `!_isApplicationVisible()`), the classic fixed-timestep accumulator (`fixedTimeStep` + `maxUpdatesPerFrame` spiral-of-death drain + `interpolationAlpha`), rolling 60-sample FPS buffer, and per-emit tick-error routing to `onError` when allocated.
- Run-state + continuity: `pauseApplicationLoop` / `resumeApplicationLoop` (re-seeds `lastTime=-1` and zeroes the accumulators on resume so the pause gap is not dumped into the next delta), `isApplicationRunning`, `stopApplicationLoop`, and per-app loop state kept in a `WeakMap` off the entity.
- `stepApplicationLoop(app, deltaTime)` — manual headless/non-rAF tick that shares the clamp + error-routing path.
- `LoopBackend` seam: `getLoopBackend` / `setLoopBackend` / `createWebLoopBackend` (`requestAnimationFrame`/`performance.now` wrapper), mirroring `WindowBackend`. This is the asymmetry the depth review wanted closed — the loop is now host-abstracted like the window layer.
- Multi-window registry: `registerApplicationWindow` / `unregisterApplicationWindow` / `forEachApplicationWindow` (non-allocating) / `getApplicationWindows` (snapshot) / `getApplicationMainWindow` / `setApplicationMainWindow`, with the main-window override in a side `WeakMap`.
- `enableApplicationLifecycleSignals` (idempotent allocator) and `attachApplicationLifecycle(app, win)` wiring `win.onDeactivate→pause`, `win.onActivate→resume`, keyed per-window in `_lifecycleKeys` so one app can manage several windows' lifecycles.
- `attachApplicationExit` / `detachApplicationExit` and `disposeApplication` — the internal `WeakMap<Application, Map<symbol, cleanup>>` teardown registry keeps cleanup closures off the public entity.

**Windowing (`window.ts`)** — broad and idiomatic, essentially as the depth review described, now with:

- Full state-command surface (`setWindowTitle`/`Position`/`Size`/`MinimumSize`/`MaximumSize`/ `Resizable`/`AlwaysOnTop`/`Opacity`/`Icon`/`SkipTaskbar`/`MenuBarVisible`/`Parent`/`Progress`, `requestWindowAttention`, `centerWindow`) and state transitions (`minimize`/`maximize`/`restore`/`hide`/`show`/`focus`/`setWindowFullscreen`), each change-guarded and signal-emitting.
- New native-only seam functions added this pass: `setWindowContentProtection`, `flashWindowFrame`, `setWindowHasShadow` (each web no-op, delegating to the three new `WindowBackend` methods), and `getWindowDisplay` (returns `-1` on web — a typed seam for `@flighthq/screen`-backed native hosts).
- Bounds/DPI: `getWindowBounds(out)`, `computeWindowDeviceTransform(out)` (alias-safe: reads `win.devicePixelRatio` into a local before writing `out`), `attachWindowRenderState`.
- Real Pointer Lock: `lockApplicationPointer` now calls `element.requestPointerLock()` (handles the promise-vs-undefined return), paired with the new `exitApplicationPointerLock`; the old CSS-prep behavior moved to the honestly-named `prepareElementForInput`. This resolves the depth review's name/behavior mismatch.
- Paired `attach*`/`detach*` event wiring (Resize, Focus, Visibility, Close+veto, DropFile, Fullscreen, Orientation, RenderContext, RenderState, Move) and a complete `createWebWindowBackend` that guards every API with `typeof window/document` checks and try/catch around popup ops.
- `openWindow` now applies the `center` option (after backend open) — closing the depth review's `WindowOptions.center` contract gap.

**Tests**: 60 `it` in `application.test.ts` (24 describe blocks, alphabetized, mirroring exports incl. fixed-timestep and tick-error-routing groups), 77 in `window.test.ts` (61 describe blocks). Coverage is broad and tracks the new surface.

## Gaps

The windowing half is near-authoritative; the residual gaps are concentrated where the charter has not yet ruled, plus seams whose only implementation is the web/no-op default:

- **Seams without a native consumer.** `LoopBackend`, the three new `WindowBackend` methods, and `getWindowDisplay` are all shaped correctly but realized only by the web default (no-op / `-1`). Their host-portability is asserted, not exercised — no `host-winit`/`host-electron` fills them in this bundle. This is by design (the conformance/native consumer lives elsewhere), but it is why the package reads as "solid" rather than "authoritative": the portability claim is untested end-to-end.
- **Phase scheduler absent.** No named loop phases (`input`/`fixedUpdate`/`update`/`lateUpdate`/ `render`/`postRender`) with priority ordering. `tween`, `input`, and `render` each self-schedule on `onUpdate` today; a mature runtime loop owns ordering. The status doc correctly flags this as an SDK-wide design decision, not a within-package gap.
- **Only `'fixed'` and pure-variable timestep modes.** `fixedTimeStep===0` (variable) and `fixedTimeStep>0` (accumulator) are covered; a `semiFixed` mode (variable capped at a max, no interpolation) and a `TimestepMode` discriminant are not present.
- **No deterministic/record-replay loop backend.** The `LoopBackend` seam admits one, but no `DeterministicLoopBackend` (seeded clock) exists — the headless conformance story for Rust parity is unbuilt.
- **No frame-time jitter / dropped-frame metrics.** Only rolling average FPS via the 60-sample buffer; min/max/avg frame time and dropped-frame counts (standard in profiler overlays) are not exposed.
- **`attachWindowMove` is a web proxy.** It hooks `'resize'` and reads `window.screenX/Y` as a stand-in for OS move events — unavoidable on web, but the real move event needs a native backend.
- **No application-level error sink without opt-in.** `onError` exists but is null unless `enableApplicationLifecycleSignals` runs; with it null the loop rethrows (consistent with prior behavior, but there is no uncaught-error hook a host could always rely on).

## Charter contradictions

None — the charter (`What it is` aside) is a stub (`North star`, `Boundaries`, `Decisions`, `Open directions` all `TODO`), so there is nothing concrete for the code to contradict. The one-line `What it is` ("Application lifecycle / main loop + the windowing host layer … over a swappable `WindowBackend`") matches the code exactly. The Package Map entry in `index.md` likewise matches.

## Contract & docs fit

**Lives up to the contract — well:**

- **Types-first.** `Application`, `ApplicationLoopOptions`, `ApplicationWindow`, `WindowBackend`, `LoopBackend`, `WindowBounds`, `WindowOptions` all live in `@flighthq/types`; the package defines no cross-package types inline. New seam methods were added to the `WindowBackend` interface in types, not bolted on locally.
- **Full unabbreviated names**, house verbs throughout (`create*`/`dispose*`, `attach*`/`detach*`, `set*`/`get*`/`request*`, `enable*` for the opt-in signal group). `lockApplicationPointer` → `prepareElementForInput` rename is exactly the "leave it cleaner" + honest-naming rule applied.
- **Sentinels not throws** (`getWindowDisplay` → `-1`, `getApplicationMainWindow` → `null`, `closeWindow`/`requestWindowClose` → `bool`). No error-wrapping types.
- **Single root export** (`index.ts` is a clean two-line barrel — the redundant `webApplication.ts`/ `webWindow.ts` alias files the depth review flagged are gone), `"sideEffects": false`, no top-level side effects (backends lazily created on first `get*Backend`).
- **`out`-param + alias safety:** `computeWindowDeviceTransform` and `getWindowBounds` take `out`; the former reads inputs into a local first.
- **Rust mirror present** (`crate: flighthq-application`).

**Candidate contract / docs revisions (user's gate, not the reviewer's):**

- **`ApplicationLoopOptions` is co-located in `types/src/Application.ts`**, not its own file. The types-layout convention is "one concept per file, filename = type name." This is a minor drift — `ApplicationLoopOptions` and `LoopBackend` are arguably one loop-config concept, but the convention would put `ApplicationLoopOptions.ts` alongside `Application.ts`. Flag for the types-layout checker, not necessarily a defect.
- **Out-param aliased-case test missing.** The contract says out-param functions must test the aliased case (`out` === an input). `computeWindowDeviceTransform`'s test uses a distinct `out` only; the function is in fact alias-safe, so this is a test-coverage gap, not a behavior bug.
- **Package Map line is accurate** and needs no revision; the depth-review file at `reviews/depth/application.md` is now superseded by this review and can be retired per the migration table in `index.md`.

## Candidate open directions

The charter is a stub, so the following are assumptions this review had to make — each is a question for the charter's `Open directions`/`Decisions`:

- **Phase scheduler — SDK-wide or out of scope?** Named loop phases with priority overlap with how `tween`/`input`/`render` self-schedule. This is the single biggest unresolved design fork and cannot be settled within the package. (Cross-package; surface, do not act.)
- **Where does the loop driver live long-term — `application` or `host-*`?** `LoopBackend` mirrors `WindowBackend` living here, but a native host wanting one unified window+loop driver might pull the seam into `host-*`. The status doc raises this; the charter should rule.
- **Is `semiFixed` / a `TimestepMode` discriminant in scope**, or are variable + fixed the blessed set? Decides whether the deferred third mode is a gap or a non-goal.
- **Deterministic/record-replay loop** — is reproducible headless stepping an `application` responsibility (a `DeterministicLoopBackend`) or purely a Rust-conformance-harness concern? Touches the parity instrument.
- **Multi-window scope.** The registry exists, but "main window," child/modal relationships (`setWindowParent`), and per-window render-state wiring imply a multi-window app model the charter has not described. Where does `application`'s window management end and `host-*`/`@flighthq/app`'s process-level concerns begin?
- **Boundary with `@flighthq/app` and the platform suite.** App-level `onActivate`/`onDeactivate` exist here and also conceptually in `@flighthq/app`/`@flighthq/lifecycle`. The charter should draw the line so the same lifecycle event is not modeled in two packages.
