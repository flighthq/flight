---
package: '@flighthq/application'
crate: flighthq-application
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# application — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/application` is two sub-domains under one roof, bound by a shared lifecycle:

- **Application loop / lifecycle** — the optional main loop and run-state for an app: `createApplication`, `startApplicationLoop`/`stop`/`pause`/`resume`/`stepApplicationLoop`, the `onUpdate`/`onRender`/`onExit` callbacks, frame-rate control, max-delta clamp, the fixed-timestep accumulator with interpolation, FPS metrics, opt-in lifecycle signals (`onActivate`/`onDeactivate`/`onError`/`onFixedUpdate`), and a swappable `LoopBackend` (web default over `requestAnimationFrame`/`performance.now`).
- **Windowing host layer** — `ApplicationWindow` plus the full window-control command surface (title/position/size/min-max/resizable/always-on-top/opacity/icon/skip-taskbar/menu-bar/parent/progress, attention, center), state transitions (minimize/maximize/restore/hide/show/focus/fullscreen), paired `attach*`/`detach*` web event wiring, multi-window registry, pointer-lock, bounds/DPI, and native-only seams — all over a swappable `WindowBackend` (web default).

Where it ends vs neighbors: a **single window's** lifecycle and the **app's own loop** live here. **Process-level / host-shell** identity (quit/relaunch/single-instance, dock/badge, `onActivate`/`onOpenFile`) is `@flighthq/app`; **OS-event** capabilities (`@flighthq/lifecycle`, `@flighthq/screen`, `@flighthq/power`) own their respective signals; and concrete **runtime adapters** (`host-winit`, `host-electron`, `host-web`) fill the `WindowBackend`/`LoopBackend` seams. `application` defines the seam and the web default; it is not itself a host.

## North star (proposed)

_Inferred from the design and the SDK-wide forks — edit freely._

- **Opt-in, side-effect-free.** Nothing runs until the caller invokes it: no loop starts, no listeners attach, no backend is constructed at module load. `start*`/`attach*`/`enable*`/`get*Backend` are explicit entry points; the package stays `"sideEffects": false`.
- **Seam, then web default.** Every host-dependent capability is a `*Backend` trait in `@flighthq/types` with a web/no-op default in-package; native hosts replace it via `set*Backend`. Web backends guard every API and return sentinels (`-1`/`null`/`false`/no-op) when unavailable rather than throwing.
- **Plain data over runtime objects.** `Application` and `ApplicationWindow` are plain entities with data fields; internal state (loop state, lifecycle keys, teardown closures, main-window override) lives in side `WeakMap`s, not on the public entity. Types are defined in `@flighthq/types` first.
- **Idiomatic verbs and honest names.** House verbs throughout (`create*`/`dispose*`, `attach*`/`detach*`, `enable*` for opt-in signal groups, `request*`); a function's name matches its behavior (the `lockApplicationPointer`→`prepareElementForInput` correction).
- **Portable, native-first seams.** The loop and window seams are shaped for a native production host, not for the web instrument; `out`-param functions are alias-safe; allocation is explicit. (Proposed — confirm native-first is the intended posture for this package, per the Rust port's stance.)

## Boundaries (proposed)

**In scope:**

- The app main loop and run-state (variable + fixed timestep, frame-rate caps, background throttle, pause/resume, manual step, FPS metrics).
- A single window's state, control commands, event wiring, bounds/DPI, and pointer-lock.
- The multi-window **registry** (register/unregister/iterate/main-window) as the app's own bookkeeping of the windows it drives.
- The `WindowBackend` and `LoopBackend` seams plus their web defaults.
- Opt-in application lifecycle signals and their wiring to a window's activate/deactivate.

**Non-goals (proposed):**

- Concrete native hosts — `host-winit`/`host-electron`/`host-web` own those (this package only defines the seam + web default).
- Process/shell-level identity and control — `@flighthq/app` (quit/relaunch, single-instance, dock badge, `onOpenFile`).
- OS-originated event domains owned elsewhere — `@flighthq/lifecycle`, `@flighthq/screen`, `@flighthq/power`, `@flighthq/menu`/`tray`.
- Rendering — `application` wires a render state to a window (`attachWindowRenderState`) but owns no draw path.

## Decisions

None blessed yet.

## Open directions

Every question below comes from `review.md` (the charter was a stub, so the review had to assume these) plus the SDK-wide structural forks that touch this package. Each needs your ruling.

- **Phase scheduler — SDK-wide or out of scope?** Named loop phases (`input`/`fixedUpdate`/`update`/`lateUpdate`/`render`/`postRender`) with priority ordering, vs. the current model where `tween`/`input`/`render` each self-schedule on `onUpdate`. The single biggest unresolved fork; cross-package, cannot be settled inside this package. (Relates to structural-fork C — a hot function/loop that should own ordering rather than leaving consumers to self-schedule.)
- **Where does the loop driver live long-term — `application` or `host-*`?** `LoopBackend` mirrors `WindowBackend` living here, but a native host wanting one unified window+loop driver might pull the seam into `host-*`. (Structural-fork D — runtime-backend seam placement.)
- **`semiFixed` / a `TimestepMode` discriminant — in scope, or are variable + fixed the blessed set?** Decides whether the deferred third timestep mode is a gap or a non-goal.
- **Deterministic / record-replay loop backend — `application`'s responsibility or the Rust-conformance harness's?** The `LoopBackend` seam admits a `DeterministicLoopBackend` (seeded clock), but none exists; this touches the parity instrument and the headless conformance story.
- **Multi-window scope.** The registry exists, but "main window," child/modal relationships (`setWindowParent`), and per-window render-state wiring imply a multi-window app model the charter has not described. Where does `application`'s window management end and `host-*` / `@flighthq/app`'s process-level concerns begin?
- **Boundary with `@flighthq/app` and the platform suite.** App-level `onActivate`/`onDeactivate` exist here and also conceptually in `@flighthq/app` / `@flighthq/lifecycle`. The charter should draw the line so the same lifecycle event is not modeled in two packages.
- **Seams without a native consumer.** `LoopBackend`, the three new `WindowBackend` methods (`setWindowContentProtection`/`flashWindowFrame`/`setWindowHasShadow`), and `getWindowDisplay` are realized only by the web default. Is shipping a seam ahead of its native fill the accepted posture, or should a `host-*` consumer land alongside before such seams are blessed? (Structural-fork D, and the "authoritative requires an exercised seam" bar.)
- **Uncaught-error hook.** `onError` is null unless `enableApplicationLifecycleSignals` runs; with it null the loop rethrows. Should there be an always-on uncaught-error sink a host can rely on, or is opt-in-only the blessed behavior?
- **Frame-time jitter / dropped-frame metrics.** Only rolling-average FPS is exposed today. Are min/max/avg frame time and dropped-frame counts (standard in profiler overlays) in scope?
- **Types-layout drift (contract revision, your gate).** `ApplicationLoopOptions` is co-located in `types/src/Application.ts` rather than its own `ApplicationLoopOptions.ts`. Confirm whether the one-concept-per-file rule should split it or whether loop-config is one concept with `LoopBackend`.
