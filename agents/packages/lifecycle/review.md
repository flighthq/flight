---
package: '@flighthq/lifecycle'
status: solid
score: 82
updated: '2026-09-02'
ingested:
  - status.md
  - charter.md
  - source (packages/lifecycle/src)
  - packages/types/src/Lifecycle.ts
  - packages/types/src/BackendOperationExplanation.ts
  - packages/host-web/src/webLifecycle.ts
  - agents/packages/platform-integration.md
---

# lifecycle — Review

## Verdict

**`solid` — 82/100.** Since the prior review (2026-07-13, 78/solid), the package completed a migration to the explicit Host model: every stateful query now takes `host: HasSystemLifecycle` rather than resolving a process-wide backend through module-scoped `getLifecycleBackend`/`setLifecycleBackend`. Six exports and the `_custom > _host > _sentinel` resolver chain were deleted; the web backend moved from an installed singleton to a value published on `webHost.system.lifecycle` in `@flighthq/host-web`. This is a genuine architectural improvement aligned with the explicit dependency model. The domain surface is unchanged — the same tri-state lifecycle, deduped resume/pause edges, save/restore, memory pressure, launch kind, and vetoable back button — and the property/fuzz test suite survives intact. Held below high-solid by the same open-direction gaps (no before-quit hook, the undecided 4-edge signal set, no native backend proof), plus an eager signal allocation that violates the suite's shared decision.

## Present capabilities (verified against source)

13 exports in `lifecycle.ts` (245 lines), 46 `it()` cases in `lifecycle.test.ts` (601 lines) plus 7 `it()` cases in `lifecycleHost.test.ts` (57 lines). `describe` blocks in `lifecycle.test.ts` are alphabetized 1:1 with all 13 exports.

- **Entity quartet:** `createAppLifecycle` (allocates 7 inert signals), `attachAppLifecycle(host, app)` (idempotent; emits raw `onStateChange` per notification; derives deduped `onResume`/`onPause` on the `'active'` boundary — `inactive<->background` transitions correctly do not re-fire them; emits `onSaveState` with a mutable bag on leaving active and `onRestoreState` with that bag on next resume; wires `subscribeMemoryWarning` when the backend has it), `detachAppLifecycle(app)`, `disposeAppLifecycle(app)` (also clears the saved-state `WeakMap` entry).
- **State queries (host-parameterized):** `getAppLifecycleState(host)`, `isAppActive(host)` / `isAppInactive(host)` / `isAppBackground(host)`. Each reads `host.system.lifecycle.getState()` — no module-level backend resolution.
- **Launch:** `getAppLaunchKind(host)` — delegates to optional `backend.getLaunchKind()`, falls back to `'warm'` for backends omitting it.
- **Back button:** `requestAppBack(app)` — emits `onBackButton`, returns `false` when a listener vetoed via `cancelSignal`. Does not take a host parameter (entity-only; no backend call).
- **Diagnostics (contract-only):** `explainLifecycleOperation(host, operation)` returns `BackendOperationExplanation` with `implemented` (boolean) and `layer` (`'host'` or `'sentinel'`). `hasLifecycleOperation(host, operation)` is the boolean shorthand.
- **Web backend factory (contract-only):** `createWebLifecycleBackend()` — three states over `document.hidden` + `window.focus`/`blur` + `pagehide`/`pageshow`; `getLaunchKind()` from `PerformanceNavigationTiming.type` (`back_forward` -> `'warm'`, all others -> `'cold'`); `subscribeMemoryWarning()` wires experimental `memory-pressure`/`memory-pressure-relieved` window events. SSR-safe throughout (degrades to `'active'` / no-op).

**Export lanes:** public lane (`index.ts`) exports 10 functions, correctly excluding the 3 contract-only items (`createWebLifecycleBackend`, `explainLifecycleOperation`, `hasLifecycleOperation`). `contract.ts` re-exports everything via `export * from './lifecycle'`.

**Host integration:** `host-web/src/webLifecycle.ts` imports `createWebLifecycleBackend` from the contract lane and publishes `webLifecycleBackend` as a const on the system host. No `host-electron`, `host-tauri`, or `host-capacitor` source references `LifecycleBackend`.

**Test depth:** All transition edges including inactive dedup cases, save-restore round-trip, memory delivery + unsubscribe, all four `getLaunchKind` navigation types, veto and no-veto back paths. Four property/fuzz suites (100-200 random trials each) pin the raw-vs-deduped invariants. `lifecycleHost.test.ts` independently verifies per-host independence for the state queries and launch kind — the property the host migration was for.

## Gaps (AAA-depth judgment)

1. **No before-quit/exit hook.** A textbook lifecycle surface includes app-termination: a vetoable `onBeforeExit`/`requestAppExit` (native `before-quit`, web `beforeunload`/`pagehide`-as-final). Nothing here covers it. The boundary question with `@flighthq/application`'s window-close veto (`requestWindowClose`/`onCloseRequest`) remains unsettled. A design decision, not a sweep.
2. **The 4-edge signal set is undecided.** `onResume`/`onPause` key on the `'active'` boundary, so "focus lost but visible" and "fully backgrounded" are indistinguishable without deriving from `onStateChange`. First-class `onForeground`/`onBackground` (and possibly `onActivate`/`onResignActive`) remain the charter's first open direction.
3. **No native backend proof.** The `LifecycleBackend` interface has run only against fakes and the web default. `host-electron` has no lifecycle file; `host-tauri` and `host-capacitor` do not reference it. The two optional methods (`getLaunchKind`, `subscribeMemoryWarning`) are unproven against a real OS: `getLaunchKind` approximates from `PerformanceNavigationTiming.type` and `subscribeMemoryWarning` rides Chrome's experimental `memory-pressure` events, which never fire in a shipping browser.
4. **Eager signal allocation violates the suite shared decision.** The platform-integration shared principles (2026-07-02) state: "Signal opt-in convention should be enforced. Use `enable*Signals` gates -- do not eagerly allocate signals in `create*` functions. Packages violating this should be fixed." `createAppLifecycle()` eagerly allocates all 7 signals. No `enableAppLifecycleSignals` gate exists.
5. **`getAppLaunchKind` fallback asymmetry.** A backend omitting `getLaunchKind` yields `'warm'`; the web backend defaults `'cold'`. The `'warm'` choice is documented as a safe cache-assumption for minimal backends — a recorded rationale, not a surprise — but it remains worth a deliberate bless-or-flip.
6. **Orphan test file.** `lifecycleHost.test.ts` has no corresponding `lifecycleHost.ts` source file. The one-test-file-per-source-file convention is violated. The tests exercise functions from `lifecycle.ts`; they could be a `describe` group within `lifecycle.test.ts` or the source could be split to justify the second file.
7. **Stale `package.json` description.** Still reads "foreground/background lifecycle state and resume/pause/back signals over a swappable web/native backend" — omits the inactive state, memory pressure, save/restore, and launch kind. Sweep-safe.
8. **No diagnostics layer for SSR sentinels.** The web backend degrades silently (returns `'active'`, no-op subscriptions) without an `explain*`/guard seam. Suite-wide gap.
9. **`explainLifecycleOperation` returns `layer: 'sentinel'` for unimplemented operations, but the sentinel was removed.** The status log records: "The sentinel went with the resolver, which changes what `explainLifecycleOperation` MEANS: `layer: 'sentinel'` now reports that THIS host's provider omits the operation, not that a process-wide fallback answered for it." The implementation returns `'sentinel'` when `typeof host.system.lifecycle[operation] !== 'function'`, so `'sentinel'` now means "absent from this host" rather than "answered by a fallback object." The value still satisfies the `BackendOperationExplanation` type, but the semantic drift from the type's doc comments (which describe a literal sentinel object) is worth noting.

Also unbuilt: `timeInBackground` payload on resume, idle/user-inactivity (ownership vs `@flighthq/input` unresolved), the `flighthq-lifecycle` Rust crate.

## Charter contradictions

None found. The "What it is" paragraph matches source after accounting for the host migration (the listed verbs `createAppLifecycle`/`attachAppLifecycle`/`detachAppLifecycle`/`disposeAppLifecycle` are all present). The charter cites "highest suite review score (58)" — a reference to the June merge-gate number, now superseded twice. Not a contradiction, but stale. The 2026-07-02 Decision ("no specific issues to fix") predates the eager-signal and orphan-test findings but those are not bugs. The save-state bag remains the mutable `Record<string, unknown>` the charter's open direction 4 asks to have confirmed — still awaiting blessing, faithfully implemented.

The charter still references the "event-capability shape" with "`LifecycleBackend`" and "swappable" — accurate after the host migration, since the backend is still swappable (different hosts carry different backends), just no longer via an ambient setter.

## Contract & docs fit

- **Envelope:** front matter valid. `crate: flighthq-lifecycle` declared; no Rust crate exists (cross-worktree conformance gap, suite-wide).
- **Types-first:** fully satisfied. `Lifecycle.ts` declares `AppLifecycleState`, `AppLaunchKind`, `AppMemoryPressure`, `LifecycleBackend`, `AppLifecycle`, `LifecycleOperation`. `BackendOperationExplanation` is a shared type in its own file. `HasSystemLifecycle` is in `Host.ts`. All with doc comments.
- **Export lanes:** correct. Public lane is curated (10 functions); contract lane is the full surface (13 via star re-export). Intra-SDK import from host-web uses `@flighthq/lifecycle/contract`.
- **`sideEffects: false`:** satisfied. No top-level registrations, listeners, or timers. Two `WeakMap`s at module bottom are allocation-only (no side effects at import).
- **Naming:** full unabbreviated names throughout (`AppLifecycle`, `getAppLifecycleState`, `attachAppLifecycle`, etc.).
- **`package.json` description:** stale (gap 7).
- **Package map line** (`agents/packages/map.md`, `agents/packages/catalog.md`): not checked in this review.

## Candidate open directions

Carried from charter (all still live):
- The 4-edge signal set (`onBackground`/`onForeground` vs derived from `onStateChange`).
- Memory-warning ownership (here vs `power`-adjacent).
- Idle/user-inactivity ownership vs `@flighthq/input`.
- State-restoration payload shape blessing (the mutable `Record<string, unknown>` bag).
- `timeInBackground` (ms-in-background payload on resume).

New from this review:
- The before-quit/exit hook and its lifecycle-vs-application boundary (gap 1).
- The `'warm'` fallback bless-or-flip for backends omitting `getLaunchKind` (gap 5).
- Whether `explainLifecycleOperation` should return a different `layer` value now that the literal sentinel object no longer exists (gap 9) — or whether the current `'sentinel'` meaning ("this host does not implement the operation") should be formally blessed as the post-migration semantic.
- Whether the eager signal allocation should be converted to an `enableAppLifecycleSignals` gate per the suite shared decision (gap 4).
