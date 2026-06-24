---
package: '@flighthq/application'
updated: 2026-06-24
basedOn: ./review.md
---

# application — Assessment

Possible changes, sorted by whether they are sweep-safe (within-package, non-design-decision) or need coordination/decision. Design forks and cross-package boundaries live in the charter's Open directions, not here. `Approved` is frozen on your verbal blessing only.

The bundle reviewed (`builder-67dc46d64`) already landed essentially all of the prior depth roadmap's Bronze and Silver tiers — max-delta clamp, pause/resume, `stepApplicationLoop`, the `LoopBackend` seam, fixed-timestep accumulator, measured FPS, multi-window registry, opt-in lifecycle signals, tick-error routing, the `lockApplicationPointer`/`prepareElementForInput` split, the alias-export cleanup, and the `WindowOptions.center` / `attachWindowMove` contract closures. What remains is the Gold frontier plus a few small correctness/coverage nits. The depth roadmap (`reviews/maturation/depth/application.md`) is absorbed by this assessment and can be retired per the migration table in `index.md`.

## Recommended

Sweep-safe: within `@flighthq/application` (or its own types file), no cross-package coupling, no breaking change, no open design decision. Safe to bless as a batch.

- **Out-param aliased-case test for `computeWindowDeviceTransform`** — the function is alias-safe (reads `win.devicePixelRatio` into a local before writing `out`), but its test uses a distinct `out` only. The contract requires the aliased case (`out` === an input) to be tested. Test-only coverage gap.
- **Frame-time jitter / dropped-frame metrics** — extend the loop's existing rolling 60-sample buffer to also expose min/max/avg frame time and a dropped-frame count as read-only `Application` fields (written by the loop, like `deltaTime`/`frameCount`). Standard profiler-overlay data; self-contained loop math
  - entity fields, no seam or design decision.
- **Deterministic in-package loop test** — a colocated test that drives `stepApplicationLoop` to a fixed frame count with a caller-supplied delta and asserts reproducible metrics/accumulator state. Cheap, within-package, and it pins the headless-stepping contract that the Rust-parity harness later leans on. (The full `tests/functional` conformance scene + fingerprint is the cross-package half — see Backlog.)
- **`ApplicationLoopOptions.ts` own-file split** — the type is co-located in `types/src/Application.ts`; the types-layout convention is one concept per file, filename = type name. Minor drift, mechanical to fix, within `@flighthq/types`. (Flag for the types-layout checker; bless or wave as one loop-config concept with `LoopBackend`.)

## Backlog

Parked: needs cross-package coordination, a native consumer, or a charter ruling on an Open direction.

- **Phase scheduler** — named ordered loop phases (`input`/`fixedUpdate`/`update`/`lateUpdate`/`render`/ `postRender`) as a `*Kind`-keyed registry with priority. The single biggest unresolved fork: it overlaps with how `tween`/`input`/`render` self-schedule on `onUpdate` today, so it is an SDK-wide ordering decision, not an `application`-local one. Surface to the charter's Open directions; do not act.
- **`semiFixed` mode + `TimestepMode` discriminant** — completes the timestep set, but whether `variable`
  - `fixed` is the blessed set or a third mode is in scope is a charter ruling. Parked on that decision.
- **Seams without a native consumer** — `LoopBackend`, the three new `WindowBackend` methods (`setWindowContentProtection`/`flashWindowFrame`/`setWindowHasShadow`), and `getWindowDisplay` are shaped correctly but realized only by the web/no-op default. Exercising the portability claim end-to-end needs a `host-winit`/`host-electron` fill — cross-package, lives outside `application`.
- **Deterministic / record-replay `LoopBackend` + conformance scene** — a seeded-clock backend and a `tests/functional` fingerprint scene. The within-package step test is Recommended above; the reproducible-fingerprint half is coupled to the Rust parity instrument and the capture harness — cross-package, and partly a charter ruling on whether record-replay is an `application` responsibility.
- **Real `attachWindowMove` + OS-readback listeners** — the web `attachWindowMove` is a `screenX/Y` proxy on `'resize'`; true OS move/maximize/minimize/restore _read-back_ needs a native backend's `subscribe*`. Cross-package (native host).
- **Native windowing long tail** — `WindowOptions.frame`/`transparent`, workspace/virtual-desktop hooks, `setWindowVisibleOnAllWorkspaces`. The seams are web no-ops by design; realizing them needs a native backend. Cross-package.
- **Always-on uncaught-error hook** — `onError` is null unless `enableApplicationLifecycleSignals` runs, and the loop otherwise rethrows. Whether a host should always have an uncaught-tick sink (independent of the opt-in signal group) is an error-policy design question for the charter, not a sweep.
- **Loop-driver placement (`application` vs `host-*`)** — `LoopBackend` mirrors `WindowBackend` living here, but a native host wanting one unified window+loop driver might pull the seam into `host-*`. Charter Open direction; decide before any native fill.
- **Multi-window model + `@flighthq/app` boundary** — the registry exists, but main-window override, child/modal (`setWindowParent`), per-window render-state wiring, and app-level `onActivate`/`onDeactivate` (also conceptually in `@flighthq/app`/`@flighthq/lifecycle`) imply a model the charter has not drawn. Where `application`'s window management ends and process-level concerns begin is a charter ruling.
- **Rust crate `flighthq-application`** — 1:1 port mirroring the `LoopBackend`/`WindowBackend` traits, the accumulator loop, and the host-driver loop-frame seam. Start after the TS API stabilizes (post the Open-direction decisions); coupled to the host crates and the parity harness.

## Approved

_Frozen on verbal approval only. None yet._
