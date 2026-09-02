---
package: '@flighthq/screen'
status: developing
score: 62
updated: 2026-09-02
ingested:
  - source (screen.ts — 300 lines, 27 exported functions)
  - tests (screen.test.ts — 167 lines)
  - contract.ts, index.ts
  - package.json
  - charter.md
  - status.md (updated 2026-08-08, partially stale after R3)
  - assessment.md (pre-R3)
  - types surface (Screen.ts, ScreenChangeEvent.ts, ScreenMode.ts, ScreenSignals.ts, ScreenColorSpace.ts, ScreenOrientation.ts, Host.ts)
  - platform-integration.md shared principles
---

# screen — Review (live-tree survey, 2026-09-02)

Post-R3 review. Screen R3 landed 2026-08-29: the ambient `ScreenBackend` singleton, `getScreenModes`, `refreshScreens`, `onScreenChange`, `onScreenDetailPermissionChange`, `enableScreenSignals`, and all direct-subscription convenience functions were removed. The package now delegates every host interaction through explicit Host witness types (`HasScreenQuery`, `HasScreenChange`, `HasScreenDetails`, `HasScreenPermissionChange`) — a four-slot group in `HostScreenCapabilities` where each slot is optional, and functions declare the narrowest witness they need. Web implementation ownership moved to `host-web`.

## Verdict

**developing — 62/100.** The API shape is clean and well-aligned with Flight conventions after R3. Twenty-seven exports cover enumeration, spatial lookup, coordinate conversion, mode derivation, signal wiring, and multi-monitor upgrade — all through explicit Host witnesses with no ambient state. The architecture is sound. The score is held back by test depth: 27 of 29 `describe` blocks contain only a single `'is exported'` existence check. Every pure-logic function in the package — the four coordinate converters, the three spatial lookup algorithms, the geometry extractors — has zero behavioral assertions. The spatial algorithms (overlap, containment, nearest-center-distance) are the most complex code in the package and the most amenable to unit testing, yet nothing validates their math. Status.md's Open section is also partially stale, referencing pre-R3 line numbers for issues that moved to `host-web`.

## Present capabilities

**Factory (4):** `createScreenInfo` (25-field Entity with sentinels: `-1` for unknown numerics, `''` for label, `'unknown'` for touchSupport), `createScreenMode` (Entity), `createScreenPermissionChange` (Entity with signal), `createScreenSignals` (Entity with three signals).

**Enumeration (3):** `getScreens(host, out)`, `getPrimaryScreen(host, out)`, `getScreenById(host, id, out)` — all delegate to `HasScreenQuery`. `getScreenById` returns `null` on miss (sentinel, not throw).

**Spatial lookup (5):** `getScreenNearestPoint` (point-in-screen containment, else center-distance), `getScreenContainingRect` (largest-overlap area, else nearest-by-center), `getScreenNearestRect` (fully-contains, else nearest-by-center — distinct semantics per charter Decision 2026-07-02), `getScreenCursorPosition` (delegates to host), `getScreenCursorScreen` (cursor position resolved to nearest screen).

**Geometry extraction (3):** `getScreenBounds`, `getScreenWorkArea`, `getScreenCurrentMode` (derives synthetic `ScreenMode` from `ScreenInfo` fields).

**Coordinate conversion (4):** `dipToScreenPoint`, `dipToScreenRect`, `screenToDipPoint`, `screenToDipRect` — all use out-parameter pattern, alias-safe (each line reads its own coordinate before writing).

**Event signals (6):** `attachScreenSignals`/`detachScreenSignals`/`disposeScreenSignals` (wires `HasScreenChange.subscribe` into `ScreenSignals` with three-kind dispatch: `ScreenAdded`, `ScreenRemoved`, `ScreenMetricsChanged`), `attachScreenPermissionChange`/`detachScreenPermissionChange`/`disposeScreenPermissionChange` (wires `HasScreenPermissionChange.subscribe` into `ScreenPermissionChange.onChange`). Subscriptions tracked in module-scoped `WeakMap`s. `dispose*` functions detach then `clearSignal` every member.

**Multi-monitor upgrade (2):** `requestScreenDetails(host)`, `getScreenDetailPermission(host)` — both delegate to `HasScreenDetails`.

## Gaps

1. **Test suite is almost entirely export-existence stubs.** Of 29 `describe` blocks, 27 test only `expect(fn).toBeTypeOf('function')`. Only `screen entities` (entity creation, signal attach/detach/dispose) and `screen queries` (host delegation, current mode derivation) exercise behavior — 5 behavioral assertions total for 27 exported functions and ~180 lines of implementation logic. The coordinate conversion functions, spatial algorithms, geometry extractors, `getScreenById` null-return path, and `getScreenCursorScreen` are entirely untested beyond existence. The pre-R3 test suite had ~970 lines of behavioral coverage; the R3 migration cut the tests to stubs without replacing the behavioral coverage that applies to the remaining pure-logic functions.

2. **Multiple query functions allocate a fresh `ScreenInfo[]` on every call.** `getScreenById`, `getScreenContainingRect`, `getScreenNearestRect`, and `getScreenNearestPoint` each create `const screens: ScreenInfo[] = []` and call `getScreens(host, screens)`. For hot-path usage (e.g., cursor tracking calling `getScreenCursorScreen` on every pointer move), this allocates per call. A module-scoped scratch array or a caller-supplied buffer would eliminate this.

3. **`copyScreenInfo` uses `Object.assign(dst, src)`.** This copies all own enumerable properties, including the `EntityRuntimeKey` symbol. After the copy, `dst[EntityRuntimeKey]` points to `src`'s runtime object. For `ScreenInfo` this is likely harmless (no subsystems attach to screen runtime slots), but it diverges from the Entity identity contract — the `out` entity silently adopts the source's runtime. A field-by-field copy that skips the runtime key would be safer.

4. **`_scratchPoint` is shared mutable module state.** `getScreenCursorScreen` writes to `_scratchPoint` then passes it to `getScreenNearestPoint`. Not reentrant-safe if called recursively (e.g., from within a signal handler). Low practical risk, but the scratch point could be function-local to eliminate the hazard.

5. **No display-mode enumeration.** `getScreenCurrentMode` derives a synthetic mode from `ScreenInfo`. No `getScreenModes` or `getScreenNativeMode` exists. The `ScreenMode` type seam is ready; a real payload needs a native backend. Acknowledged in status.md.

6. **Status.md Open section is partially stale.** Three of four items reference pre-R3 line numbers (`screen.ts:331`, `:128-135`, `:189`, `:289`, `:296`, `:549-553`, `:348`) and describe issues — subscribe-before-upgrade ordering, `ScreenInfo.id` array-index instability, cursor tracking listener leak — that moved to `host-web` with R3. Only item 4 (no display-mode enumeration) still applies to this package.

## Charter contradictions

None. Both charter Decisions (distinct `getScreenNearestRect` semantics, test divider comments removed) are implemented and verified in the current source. The three Open directions (web-derivable fields, stable-id contract, screen-vs-device boundary) are still appropriate and unresolved.

## Contract & docs fit

- **Two-lane exports:** `contract.ts` re-exports all of `screen.ts`; `index.ts` selectively re-exports 27 named functions from `contract.ts`. Both lanes correct.
- **`sideEffects: false`:** declared in `package.json`; verified — no module-level side effects, only `WeakMap` declarations and a scratch point at file bottom.
- **Dependencies:** `@flighthq/entity`, `@flighthq/signals`, `@flighthq/types` — correct and minimal.
- **Types in `@flighthq/types`:** all types (`ScreenInfo`, `ScreenMode`, `ScreenSignals`, `ScreenPermissionChange`, `ScreenChangeEvent`, `ScreenChangedMetrics`, `ScreenChangeKind`, `ScreenColorSpace`, `ScreenOrientation`, `ScreenPermissionState`, `ScreenQueryBackend`, `ScreenChangeBackend`, `ScreenDetailsBackend`, `ScreenPermissionChangeBackend`, `HasScreenQuery`, `HasScreenChange`, `HasScreenDetails`, `HasScreenPermissionChange`) live in `@flighthq/types`. No types defined inline in the implementation package.
- **Naming:** all function names use full unabbreviated type name (`Screen`, not `Scr`). `get*` prefix on getters. `create*` on factories. `attach*`/`detach*`/`dispose*` lifecycle verbs.
- **`Readonly<>` on inputs:** applied to `ScreenInfo`, `Vector2Like`, `RectangleLike` parameters.
- **Out-parameter pattern:** used throughout; all conversion functions return `out`.
- **Sentinel returns:** `getScreenById` returns `null` on miss; `createScreenInfo` uses `-1` for unknown numerics, `''` for unknown strings, `'unknown'` for `touchSupport`.
- **Alphabetical ordering:** exported functions alphabetized (case-insensitive). Test `describe` blocks alphabetized and mirror export names.
- **No TODOs or divider comments** in source or test files.
- **Explicit dependency model:** every host-touching function takes its witness (`HasScreenQuery`, `HasScreenChange`, etc.) as the first argument. No singletons, no module-scoped backend state.
- **Platform-integration shared principles:** matches the `create*`/`attach*`/`detach*`/`dispose*` event pattern. Signal creation is eager in `createScreenSignals` (allocates three signals immediately), but this is the purpose-built signals factory — the opt-in boundary is the call to `createScreenSignals` itself, not an `enable*Signals` gate on a broader entity.

## Candidate open directions

- **Behavioral tests for pure-logic functions.** The coordinate converters, spatial algorithms (`getScreenContainingRect`, `getScreenNearestRect`, `getScreenNearestPoint`), and geometry extractors are pure functions with well-defined inputs and outputs. A multi-screen mock host exercising overlap, containment, nearest-fallback, and scale-factor math would bring the score up substantially.
- **Reduce per-call allocation in query functions.** A module-scoped scratch array (or caller-provided buffer) for `getScreenById`/`getScreenContainingRect`/`getScreenNearestRect`/`getScreenNearestPoint` would eliminate garbage on hot paths.
- **Field-by-field `copyScreenInfo`.** Replace `Object.assign` to avoid carrying `EntityRuntimeKey` from source to destination.
- **Update status.md Open section.** Drop the three items that moved to `host-web`; keep or rephrase the mode-enumeration item for this package.
- **Web-derivable sentinel fields** (`monochrome`, `dpi`, `depthPerComponent`): decide whether to derive in `host-web` or leave sentinel until native — charter Open direction, still pending.
- **Stable-id contract for `ScreenInfo.id`** across hot-plug — charter Open direction, applies to host backends rather than this package post-R3.
