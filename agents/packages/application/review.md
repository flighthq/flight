---
package: '@flighthq/application'
status: partial
score: 38
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/application/src (application.ts, window.ts, index.ts, *.test.ts)
  - head/packages/types/src (Application.ts, ApplicationWindow.ts)
  - changes.patch (packages/application/* and packages/types/* hunks)
  - charter.md, structural-forks.md, CONTRACT.md
---

# application — Merge Review (integration b2824e3d8 vs approved origin/main eb73c3d74)

This is a **merge gate**, not a survey. The approved floor is `origin/main` (eb73c3d74): a thin loop (`startApplicationLoop` over rAF, `attachApplicationExit`, `dispose/stop`) plus the windowing surface. The candidate is the integration branch's `@flighthq/application`, which rewrites `application.ts` into a full game-loop (fixed timestep, frame-rate caps, background throttle, pause/resume, FPS metrics, lifecycle signals, a `LoopBackend` seam, a multi-window registry) and extends `window.ts` (pointer-lock rework, `onMove` wiring, `getWindowDisplay`, three native-only `WindowBackend` seams, `centerWindow` on open). Judged only on the **delta**.

> A prior survey of this package (score 88, "solid") was written against commit `67dc46d64`, where the matching `@flighthq/types` changes existed. This document re-scores **the integration assembly at b2824e3d8**, which dropped those type changes. The design is the same; the merged artifact is broken.

## Verdict: REJECT for merge as-is — the delta does not compile against the integration branch's own `@flighthq/types`.

The design of the delta is strong and mostly charter-aligned. But the integration **dropped the `@flighthq/types` half of this change**: the application source now imports and produces types that do not exist at b2824e3d8. This is a hard, mechanical merge-blocker, not a taste call.

## Blocking findings (must fix before merge)

### 1. `LoopBackend` and `ApplicationLoopOptions` are imported but undefined in `@flighthq/types` — compile failure.

`b2824e3d8:packages/application/src/application.ts:2`:

```ts
import type { Application, ApplicationLoopOptions, ApplicationWindow, LoopBackend } from '@flighthq/types';
```

Neither `LoopBackend` nor `ApplicationLoopOptions` exists anywhere in the integration head's `@flighthq/types` (no `LoopBackend.ts`; a grep across `head/packages/types/src` returns nothing for either name), and `changes.patch` carries **no** `packages/types/src/Application.ts` / `LoopBackend.ts` / `ApplicationLoopOptions.ts` hunk (the only `packages/types` hunks are FontMetrics, GlyphExtents, Notification, RenderViewport2D, ShapedRun, SpritesheetFormat, TextShaper, index.ts). `ApplicationLoopOptions` appears in exactly one file in the whole head tree — `application.ts` itself. The type-only import resolves to nothing → `tsc -b` fails. Violates the contract's types-first rule (the header layer must carry the shape) and is a flat compile break.

### 2. `createApplication()` returns ten fields that are not on the `Application` interface — compile failure.

`b2824e3d8:packages/application/src/application.ts:53`:

```ts
return {
  deltaTime: 0,
  elapsedTime: 0,
  frameCount: 0,
  interpolationAlpha: 1,
  isRunning: false,
  onActivate: null,
  onDeactivate: null,
  onError: null,
  onExit: createSignal(),
  onFixedUpdate: null,
  onRender: createSignal(),
  onUpdate: createSignal(),
  windows: [],
};
```

The integration head's `Application` interface (`head/packages/types/src/Application.ts`) is byte-identical to base — only `onExit`/`onRender`/`onUpdate`. Every other field (`deltaTime`, `isRunning`, `windows`, `onActivate`, `onFixedUpdate`, …) is an excess property and a type error. The whole loop/lifecycle/registry surface reads and writes `app.isRunning`, `app.windows`, `app.onError`, `app.onFixedUpdate`, `app.deltaTime`, etc., so this is pervasive, not a single literal.

### 3. `window.ts` calls three `WindowBackend` methods the interface does not declare — compile failure.

`b2824e3d8:packages/application/src/window.ts` adds:

```ts
export function setWindowContentProtection(win, enabled) {
  getWindowBackend().setContentProtection(win, enabled);
}
export function flashWindowFrame(win) {
  getWindowBackend().flashWindowFrame(win);
}
export function setWindowHasShadow(win, hasShadow) {
  getWindowBackend().setHasShadow(win, hasShadow);
}
```

The integration head's `WindowBackend` interface (`head/packages/types/src/ApplicationWindow.ts:87–114`) ends at `requestAttention`; it declares no `setContentProtection`/`flashWindowFrame`/`setHasShadow`. The web default `createWebWindowBackend()` adds the three no-op stubs (structurally allowed), but the three `getWindowBackend().<method>(...)` callsites reference members the declared `WindowBackend` does not have → type error. (`onMove`/`onActivate`/`onDeactivate` on `ApplicationWindow` already exist in base, so the `attachWindowMove` wiring is fine — the gap is the backend triplet only.)

> All three share one root cause: the integration assembled the `application` source against a commit (the head docs cite `67dc46d64`) where the matching `@flighthq/types` changes existed, but b2824e3d8 carries the source without those type changes. Either the types hunks were lost in the merge or this slice was staged out of order. The fix is to land the `@flighthq/types` half — `Application` fields, `LoopBackend`, `ApplicationLoopOptions`, the three `WindowBackend` methods — in the **same** merge.

## Non-blocking findings (clean up in the same pass)

- **Dead `LoopState.accumulated` field.** `b2824e3d8:packages/application/src/application.ts:373` declares `accumulated: number`, initialized at line 212 (`accumulated: 0`), and never read again — the live accumulator is `fixedAccumulator`. The comment at line 359 still lists `accumulated` as state. Remove the field and fix the comment ("leave touched files cleaner than you found them").

- **`ApplicationLoopOptions` co-located in `Application.ts` (types-layout drift).** Once the types half lands, the one-concept-per-file convention wants its own `ApplicationLoopOptions.ts`. Minor; flag for the types-layout checker. (Already in the charter's Open directions and the head's own docs.)

## Where the delta is genuinely good (against the 7 standards)

1. **Composition / bedrock — PASS (one watch).** The loop is one coherent subject (timestep + pacing + metrics), not a fusion of unrelated subjects; lifecycle wiring, the registry, and the backend seam are separable exported functions, not config-gated branches in a god-function. The `if (app.onError !== null) try/catch else emit` shape repeats across `tick`, `stepApplicationLoop`, and the fixed-update inner loop — borderline within-unit repetition, but a per-emit guard, not a feature branch, so it does not tax importers. Acceptable.
2. **Naming — PASS.** Full unabbreviated type words (`getApplicationFrameRate`, `setApplicationMainWindow`, `enableApplicationLifecycleSignals`, `stepApplicationLoop`); `get*`/`is*` correct (`isApplicationRunning`, `getApplicationWindows`). The base's misnamed `lockApplicationPointer` (CSS only) is correctly split into a real `lockApplicationPointer` (requests Pointer Lock) + `prepareElementForInput` (the CSS prep) — exactly the charter's stated correction.
3. **Tree-shaking / side-effects — PASS.** No new top-level side effects; `_loopBackend` is lazily constructed via `getLoopBackend()`; the loop starts only on `startApplicationLoop`; listeners attach only via explicit `attach*`. Single root barrel (`index.ts` re-exports `application` + `window`).
4. **Registry vs closed union — N/A.** No new `kind` family; `LoopBackend`/`WindowBackend` are single swappable seams (fork D), the right shape, not a closed switch.
5. **Subject triad / plurality guard — PASS.** No premature `-formats`/`-backend` split; `LoopBackend` mirrors `WindowBackend` in-package, the established pattern.
6. **Contract hygiene — MIXED.** `Readonly<>` on read-only params (`forEachApplicationWindow`, `getApplicationWindows`, `getApplicationFrameRate`); sentinels not throws (`getApplicationMainWindow` → `null`, `getWindowDisplay` → `-1`); `dispose*` correct (detach-to-GC, nothing to free). **But types-first is violated** (findings 1–3): the header layer does not carry the shape the implementation depends on. Decisive breach.
7. **Tests & honesty — PASS in isolation, blocked in aggregate.** `application.test.ts` (~720 lines) is colocated, drives the loop deterministically via `setLoopBackend` with a fake backend, and exercises every new export. Claims match code. But `tsc -b` typechecks `src/*.test.ts`, so findings 1–3 mean the suite cannot compile on this branch — honest, but currently unbuildable.

## Score rationale

The delta is a deliberate, well-named, charter-aligned AAA build-out of the loop and window seams — worth keeping in shape. It scores low (38) only because, **as merged into b2824e3d8**, it does not compile: three independent type dependencies were left behind. A merge gate cannot pass code that fails `tsc`. Land the `@flighthq/types` half and this returns to solid.

## Charter / contract signal

The charter's Open directions already name the design forks this delta touches (phase scheduler, loop-driver placement, `semiFixed`, seams-without-a-native-consumer, the `@flighthq/app` boundary). None are resolved here, and none need to be for a merge — they are the user's gate. The only new contract signal is mechanical: the types-first rule wants a checker that catches an implementation importing a `@flighthq/types` symbol that does not exist; this merge would have been caught by it.
