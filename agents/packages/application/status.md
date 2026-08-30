---
package: '@flighthq/application'
updated: 2026-08-29
by: builder5
---

# application — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/application/src/` and `packages/types/src/` on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **No guard module and no `explain*` query.** `packages/application/src/` is four source files
  (`application.ts`, `window.ts`, `applicationRenderView.ts`, `contract.ts`); there is no
  `enableApplicationGuards.ts`, and `application` does not appear in the enabler census in
  [diagnostics](../../conventions/diagnostics.md). Several silent sentinels below have no diagnostic
  twin.
- **`getWindowDisplay` is a permanent `-1`** (`window.ts:466-468`) — a bare `return -1` with no
  backend delegation. The multi-monitor lookup is `@flighthq/screen`'s data; native backends can only
  fill it once the seam routes through `WindowBackend`. Sentinel with no `explain*`.
- **`attachWindowMove` hooks `'resize'` as a proxy for a move** (`window.ts:104`). It reads back real
  `window.screenX/screenY` (`:93-98`), so the position is accurate when it fires — but a move with no
  resize never fires. The limitation is browser-imposed; the seam is ready for a native backend.
- **No phase scheduler.** `registerApplicationPhase` / `ApplicationPhase` do not exist anywhere in
  `packages/`. Named loop phases overlap with how `tween`, `input`, and `render` self-schedule on
  `onUpdate`, so this is an SDK-wide ordering ruling before it is work.
- **No deterministic loop backend.** The `LoopBackend` seam is in place and `stepApplicationLoop`
  drives it, but no `DeterministicLoopBackend` exists; there is no headless conformance functional
  scene either (`functional/scenes/` carries only `application-render-view.webgl.ts`).
- **No `semiFixed` timestep mode.** No `TimestepMode` discriminant exists; `fixedTimeStep === 0`
  (variable) and `> 0` (accumulator) are the only two modes.
- **No frame-time jitter metrics.** No `droppedFrames` / min / max / avg frame-time field exists on
  `Application` — the rolling 60-sample FPS buffer behind `getApplicationFrameRate` is the whole
  metric surface. Adding fields is a `@flighthq/types` change; the loop-side math is in-package.
- **`ApplicationRenderView` is under an open proposal.**
  [`agents/render-view-model.md`](../../render-view-model.md) is **unratified** and would extract a
  windowless `RenderView` into `@flighthq/render`, changing `applicationRenderView.ts:36`'s window
  parameter. Nothing in the tree acts on it; do not build toward it as settled.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-29** — Pointer-lock request/exit now return method-tight reason outcomes and transfer or
  clear exact provider provenance only on `ok`; Web observes modern/legacy settlement without silent
  unknown-target acquisition. `ApplicationWindow` and `createApplicationWindow` now satisfy the
  Entity constructor invariant; the separate `Application` notice remains open.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Biggest false claim dropped: the parked
  "`ApplicationLoopOptions.ts` own-file split is cross-boundary work in `@flighthq/types`" — the file
  landed and `packages/types/src/ApplicationLoopOptions.ts` exists today. Also dropped: the
  "pre-existing type errors in `easing`/`text`" note (`TextInputState.caretColor` is present at
  `packages/types/src/TextInputState.ts:22`) and the `@flighthq/device-formats` tsconfig complaint
  (no such package, and no reference in `tsconfig.base.json` / `tsconfig.build.json`).
- **2026-06-25** — Added the aliased-`out` test for `computeWindowDeviceTransform` and a deterministic
  fixed-delta `stepApplicationLoop` test pinning the headless-stepping contract.
- **2026-06-24** — Second loop pass: fixed-timestep accumulator with `interpolationAlpha` and
  `maxUpdatesPerFrame`, tick-error routing to `onError`, `backgroundFrameRate` cap, rolling FPS, the
  six-function multi-window registry, and `attachApplicationLifecycle` auto-pause wiring.
- **2026-06-24** — First loop pass: `LoopBackend` seam with `createWebLoopBackend`,
  pause/resume/step, `targetFrameRate` cap, and the `getWindowDisplay` /
  `setWindowContentProtection` / `flashWindowFrame` / `setWindowHasShadow` window seams.
