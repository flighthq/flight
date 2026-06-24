---
package: '@flighthq/lifecycle'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# lifecycle — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/lifecycle

**Session date**: 2026-06-24 **Previous score**: 88/100 (Silver+) **Estimated new score**: 92/100 (Gold)

## Implemented APIs (cumulative)

### Type files in @flighthq/types

- `/packages/types/src/AppLaunchKind.ts` — `AppLaunchKind = 'cold' | 'warm'` string-kind type.
- `/packages/types/src/AppMemoryPressure.ts` — `AppMemoryPressure = 'normal' | 'moderate' | 'critical'` string-kind type.

### Updated types in @flighthq/types

`Lifecycle.ts` — extended with:

- `LifecycleBackend.getLaunchKind?()` — optional backend method returning `AppLaunchKind`.
- `LifecycleBackend.subscribeMemoryWarning?(listener)` — optional backend memory-pressure subscription.
- `AppLifecycle.onMemoryWarning` — signal carrying `AppMemoryPressure` level.
- `AppLifecycle.onSaveState` — signal carrying a mutable `Record<string, unknown>` bag for listeners to populate before backgrounding.
- `AppLifecycle.onRestoreState` — signal carrying the previously saved state bag on warm resume.

### Exported functions in @flighthq/lifecycle

All functions exported from `packages/lifecycle/src/lifecycle.ts`:

- **`attachAppLifecycle(app)`** — subscribes to the active backend; derives `onResume`/`onPause` edges from state transitions; wires `subscribeMemoryWarning` when backend supports it; emits `onSaveState` on leaving active and `onRestoreState` on next resume. Idempotent.
- **`createAppLifecycle()`** — allocates an `AppLifecycle` entity with all 7 inert signals.
- **`createWebLifecycleBackend()`** — builds the default web backend. Implements:
  - Three-state lifecycle over `document.visibilitychange` + `window.focus`/`blur` + `pagehide`/`pageshow`.
  - `getLaunchKind()` — approximates cold/warm via `PerformanceNavigationTiming.type`: `'back_forward'` → `'warm'` (bfcache restore = frozen JS heap thawed, the closest web analog of a warm-resume), all others → `'cold'`.
  - `subscribeMemoryWarning()` — wires the experimental `'memory-pressure'` / `'memory-pressure-relieved'` window events (Chrome origin trial / behind flags as of 2026). Maps `pressure === 'critical'` → `'critical'`, `'moderate'` → `'moderate'`, relieved → `'normal'`. Degrades to no-op when events are not supported.
  - Degrades cleanly to `state 'active'` + no-op subscribe in SSR/jsdom contexts.
- **`detachAppLifecycle(app)`** — stops delivery; safe to call when not attached.
- **`disposeAppLifecycle(app)`** — detaches and clears the saved state bag from the WeakMap.
- **`getAppLaunchKind()`** — delegates to `backend.getLaunchKind()` when present; returns `'warm'` as fallback for legacy backends without the optional method.
- **`getAppLifecycleState()`** — synchronous state reader from the active backend.
- **`getLifecycleBackend()`** — returns the active backend, lazily creating the web default if none is installed.
- **`isAppActive()`** — `state === 'active'`.
- **`isAppBackground()`** — `state === 'background'`.
- **`isAppInactive()`** — `state === 'inactive'`.
- **`requestAppBack(app)`** — emits `onBackButton` and returns `false` when a listener vetoed via `cancelSignal(app.onBackButton)`, `true` otherwise. Mirrors the `requestCloseWindow`/`onCloseRequest` veto contract.
- **`setLifecycleBackend(backend | null)`** — installs a native host backend or resets to the web fallback.

### Test coverage

39 tests in `lifecycle.test.ts`, covering:

- All state transitions including `inactive` edge: `active→inactive` (fires `onPause`), `inactive→active` (fires `onResume`), `inactive→background` (no double-fire of `onPause`).
- `onSaveState` fires on leaving active; saved bag passed to `onRestoreState` on resume.
- `onMemoryWarning` delivered from backend's `subscribeMemoryWarning`.
- All three boolean conveniences (`isAppActive`, `isAppBackground`, `isAppInactive`).
- `requestAppBack` — veto case (listener calls `cancelSignal`), no-veto case, emission.
- `getAppLaunchKind` — backend without `getLaunchKind` returns `'warm'`; backend with it delegates.
- `createWebLifecycleBackend().getLaunchKind()` — `'cold'` for empty entries, `'warm'` for `back_forward`, `'cold'` for `reload`, `'cold'` for `navigate`.
- `createWebLifecycleBackend().subscribeMemoryWarning()` — fires `'critical'` on `memory-pressure` event with critical detail, `'moderate'` with moderate detail, `'normal'` on `memory-pressure-relieved`, and stops after unsubscribe.
- `attachAppLifecycle` idempotence (re-attach tears down prior subscription).
- `detachAppLifecycle` safe when not attached; stops delivery.
- `disposeAppLifecycle` detaches and stops delivery.
- `setLifecycleBackend(null)` falls back to web backend.

## Deferred items and why

### Genuinely cross-package or native-host scope

- **Full native backend reach** (`@flighthq/host-electron`): the `LifecycleBackend` seam is stable and feature-complete. The Electron adapter belongs in `host-electron`. Electron surfaces: `app 'activate'/'browser-window-blur'/'browser-window-focus'`, `process.on('low-memory-notification')` for memory warnings, `getLaunchKind` via process start time heuristic.
- **`flighthq-lifecycle` Rust crate**: the TS seam is now stable; the Rust port belongs in the `rust` worktree. The seam maps cleanly — `LifecycleBackend` trait with `get_state`/`subscribe` + optional `get_launch_kind`/`subscribe_memory_warning`, signals per the Rust signal model, native default backend in `host-winit`/`host-sdl`.

### Deliberate Gold-tier design decisions not autonomously resolvable

- **`onBackground`/`onForeground` first-class signals** distinct from `onResume`/`onPause`: these would provide the strict visible/hidden edge (independent of focus interruptions). Deferred — would add surface area and has some semantic overlap with current pair; needs user decision on whether the 4-edge set (`onActivate`/`onResignActive`/`onBackground`/`onForeground`) is worth it.
- **Idle / user-inactivity** (`onUserIdle`/`onUserActive`): overlaps with `@flighthq/input` semantically. Deferred per maturation notes — do not implement autonomously; resolve ownership first.
- **Debounce / coalescing policy tests**: property/fuzz tests over rapid transition sequences (blur/focus storms). Gold-tier; `onStateChange` is documented as "raw, not deduped" while `onResume`/`onPause` are deduped edges — the formal invariant test is pending.

## Design choices made this session

### Web `getLaunchKind` via `PerformanceNavigationTiming.type`

The `PerformanceNavigationTiming.type` field is the best available web signal for distinguishing cold vs. warm app launch:

- `'back_forward'` is returned when the browser restored the page from its back/forward cache (bfcache). In bfcache, the JS heap is literally frozen in memory and thawed on restore — this is the closest the web has to a native "warm process resume". Caches (image caches, state) are still valid; a re-auth decision is appropriate.
- All other types (`'navigate'`, `'reload'`, `'prerender'`) represent a fresh page lifecycle even if the user considers it a "return visit" — the process is equivalent to cold from the app's perspective.
- Falls back to `'cold'` when `performance` is unavailable (SSR/jsdom).
- The fallback in `getAppLaunchKind()` when a backend does not implement `getLaunchKind` is `'warm'` (conservative: assume caches may be valid). The web backend now always implements the method, so the fallback is only exercised by legacy or minimal backends.

### Web `subscribeMemoryWarning` via experimental `memory-pressure` events

No cross-browser, stable memory pressure API is widely deployed as of 2026. The implementation wires:

- `'memory-pressure'` window event (Chrome origin trial / behind flags): carries `{ detail: { pressure: 'critical' | 'moderate' | ... } }`. Maps to `AppMemoryPressure` by string comparison; unknown values fall through to `'moderate'` rather than being silently dropped.
- `'memory-pressure-relieved'` window event (companion event): maps to `'normal'`.
- Defensive: uses standard `addEventListener`/`removeEventListener`. In browsers where these event types are not supported, the listeners register but never fire — the behavior is a no-op, which is correct (no false memory warnings, no throws, clean unsubscribe).
- The `subscribeMemoryWarning` method is now implemented on the web backend (rather than absent/undefined), which means `attachAppLifecycle` will always wire it when used with the default backend. The no-op fallback behavior (events never fire in unsupporting browsers) is correct — it just means `onMemoryWarning` is never emitted, which is the right behavior when the platform doesn't signal pressure.

### Fallback for unknown memory-pressure detail

When `memory-pressure` fires with an unrecognized `detail.pressure` value (not `'critical'` or `'moderate'`), the implementation maps it to `'moderate'` rather than silently ignoring it. The reasoning: a browser emitting a memory pressure event with an unknown pressure level is still signaling pressure — silently dropping it would mean the app never responds to a real signal. `'moderate'` is the conservative response (release low-priority caches) rather than `'critical'` (release everything), so the false-negative cost of being wrong is bounded.

## Remaining design decisions needing user input

- **`onBackground`/`onForeground` vs. `onResume`/`onPause`**: decide whether the strict visibility-edge signals are needed alongside the active/inactive-edge pair. Currently `onResume` and `onPause` are keyed on `'active'` ↔ non-`'active'`, meaning they fire on both the focus-interruption edge (`active→inactive`) and the full-background edge (`active→background`). An app that wants to respond differently to "focus lost" vs. "fully backgrounded" must subscribe to `onStateChange` and derive this itself. Adding first-class `onBackground`/`onForeground` would close this gap; the cost is two more signals and the complexity of documenting when each fires.
- **Idle detection ownership**: `@flighthq/lifecycle` vs. `@flighthq/input`. The `onUserIdle`/`onUserActive` concept (no user input for N seconds) is a lifecycle-adjacent concern but requires access to input events. Decide which package owns it before implementing.

## Updated score estimate

**92/100 (Gold)**

Score rationale:

- All canonical lifecycle states are now produced and tested including `'inactive'` (+4 from first pass).
- All Silver-tier capabilities are fully implemented: `onMemoryWarning`, `getAppLaunchKind`, `requestAppBack` veto, `onSaveState`/`onRestoreState`, boolean convenience readers.
- Web backend now implements both optional methods (`getLaunchKind`, `subscribeMemoryWarning`) rather than leaving them absent — the web backend is now a full-featured reference implementation, not a minimal skeleton.
- 39 tests covering all exported functions including the new web backend capabilities.
- Remaining -8 points: no first-class `onBackground`/`onForeground` signals (needs user decision), no native backend proof (needs `host-electron`), no Rust crate (separate worktree), no idle detection (needs ownership decision), no fuzz/property tests over transition sequences.
