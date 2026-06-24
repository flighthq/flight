---
package: '@flighthq/lifecycle'
status: solid
score: 86
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/lifecycle.md
  - reviews/maturation/depth/lifecycle.md
  - source
  - changes.patch
---

# Review: @flighthq/lifecycle

Evidence: `incoming/builder-67dc46d64/head/packages/lifecycle/` (source + tests) and the bundle `changes.patch`. Types verified in `head/packages/types/src/{Lifecycle,AppLaunchKind,AppMemoryPressure}.ts`.

## Verdict

**solid — 86/100.** A well-formed, idiomatic event-capability cell that has closed nearly every gap the prior depth review (solid — 72/100) cited: the declared `'inactive'` state is now genuinely produced, the boolean conveniences exist, and the full Silver surface — `onMemoryWarning`, `getAppLaunchKind`, vetoable `requestAppBack`, and `onSaveState`/`onRestoreState` — is implemented and tested. The status doc's claimed jump to ~92 is close but slightly optimistic: it scores against a maturation roadmap, not the charter, and the package's North star / Boundaries are still blank, so the "is this the right surface" questions (4-edge signal set, idle ownership, memory-warning home) remain genuinely open rather than resolved. What is built is correct and clean; what separates it from authoritative is now mostly user-decision and cross-package proof, not missing within-cell work.

The status doc is **verified against the diff**: every exported function, type, and test it claims is present in `head/`, and the `changes.patch` shows exactly the lifecycle.ts + lifecycle.test.ts + two new types delta it describes. No drift between claim and code.

## Present capabilities

The full event-capability quartet plus a feature-rich backend seam, all grounded in `head/packages/lifecycle/src/lifecycle.ts`:

- **Entity + delivery quartet** — `createAppLifecycle()` allocates seven inert signals; `attachAppLifecycle` / `detachAppLifecycle` / `disposeAppLifecycle` manage delivery. `attach` is idempotent (calls `detach` first, lifecycle.ts:21); `detach` is safe unattached; `dispose` detaches and additionally clears the `_savedState` WeakMap (lifecycle.ts:178-181) — a correct `dispose*` (no non-GC resource to free, so not `destroy*`).
- **Three-state model now real, not just typed.** The web backend wires `window.focus`/`blur` in addition to `visibilitychange` + `pagehide`/`pageshow`, and `getState()` yields `'background'` (`document.hidden`), `'inactive'` (visible, not focused), `'active'` (visible + focused) (lifecycle.ts:92-95). This closes the single highest-value gap from the depth review — the `'inactive'` state was previously declared-but-never-produced.
- **Derived edges with documented dedup semantics.** `onResume`/`onPause` key on `'active'` ↔ non-`'active'`; the `active→inactive` interruption fires `onPause`, `inactive→background` does not re-fire. The contract is spelled out in the `attachAppLifecycle` doc comment (lifecycle.ts:15-19) and asserted by three transition tests including the no-double-fire case (lifecycle.test.ts:85-97).
- **Boolean conveniences** — `isAppActive` / `isAppBackground` / `isAppInactive` (lifecycle.ts:204-217), matching the sibling `isNetworkOnline` pattern; each tested true/false.
- **`onMemoryWarning(level)`** over a new `AppMemoryPressure = 'normal' | 'moderate' | 'critical'` string-kind type. Backend method `subscribeMemoryWarning?` is optional; `attachAppLifecycle` wires it only when present (lifecycle.ts:45-51). Web backend maps the experimental `memory-pressure` / `memory-pressure-relieved` events, degrading to a no-op unsubscribe in SSR (lifecycle.ts:132-163).
- **`getAppLaunchKind()`** over a new `AppLaunchKind = 'cold' | 'warm'` type. Delegates to `backend.getLaunchKind?()`, falling back to `'warm'` for backends lacking the optional method (lifecycle.ts:187-190). Web backend approximates via `PerformanceNavigationTiming.type` (`'back_forward'` → `'warm'`, else `'cold'`), falling back to `'cold'` when `performance` is absent.
- **Vetoable back button.** `requestAppBack(app)` emits `onBackButton` and returns `false` when a listener called `cancelSignal` (lifecycle.ts:224-227). This is a **verified 1:1 reuse** of the `requestCloseWindow`/`onCloseRequest` idiom — `application/window.ts:553-554` is character-identical (`emitSignal(...); return ...data?.cancelled !== true`), so the SDK has one veto idiom, not two.
- **State-restoration hooks.** `onSaveState` fires on leaving active with a mutable `Record<string, unknown>` bag listeners populate; the bag is stashed in `_savedState` and replayed through `onRestoreState` on the next resume (lifecycle.ts:30-41). No storage coupling — the app owns persistence. Tested round-trip (lifecycle.test.ts:154-174).
- **Backend seam** — `getLifecycleBackend()` (lazy web default; there is always a backend), `setLifecycleBackend(backend | null)`, `createWebLifecycleBackend()`. Loose state (`_backend`, `_savedState`, `_subscriptions`) sits at the file bottom per style.
- **Tests** — 39 specs covering every export, the three-state transitions in both directions, save/ restore round-trip, memory-warning delivery + unsubscribe, launch-kind for each navigation type, the veto path, idempotent re-attach, and SSR-safe no-throw paths. `describe` blocks alphabetized to mirror exports.

## Gaps

Measured against an authoritative application-lifecycle library (Capacitor `App`, Android `Lifecycle`, iOS `scenePhase`/`UIApplication`, Electron app events). What remains is now mostly secondary or cross-package:

- **No `timeInBackground` on `onResume`.** The maturation roadmap's Silver item paired cold/warm launch with an `onResume` payload carrying ms-in-background (`-1` when unknown). Only the binary `getAppLaunchKind()` shipped; the "how long were we away" signal that drives cache-TTL decisions is absent. The entity already tracks the save edge, so the last-background timestamp is cheap to add — this is a real but small gap, not a design fork.
- **No first-class `onBackground`/`onForeground` (and `onActivate`/`onResignActive`) edges.** Apps that must treat "focus lost" differently from "fully backgrounded" still re-derive it from `onStateChange`. This is the depth review's and status doc's flagged Gold item — it needs a user decision on whether the 4-edge set is worth the surface, so it is correctly _not_ built.
- **No in-box native producer for the back button or memory warning.** `onBackButton` has no web emitter (web has no hardware back); `subscribeMemoryWarning` rides experimental, behind-flags events that effectively never fire in shipping browsers. Both signatures are present without a reliably firing producer until a native host (`host-electron`/`host-capacitor`) fills the seam — defensible for the seam, but it means two of the seven signals are unexercised by the only shipped backend.
- **No idle / user-inactivity** (`onUserIdle`/`onUserActive`). Deliberately deferred pending an ownership decision against `@flighthq/input` (overlaps input events).
- **No debounce/coalescing property tests.** `onStateChange` is documented "raw, not deduped" and the edge derivation is unit-tested, but there are no fuzz/property tests over rapid blur/focus storms (a Gold item).
- **No `flighthq-lifecycle` Rust crate** and **no native-backend proof.** Both are correctly out of this worktree's scope (Rust port / `host-*`), but they are what the Gold tier requires.

## Charter contradictions

**None** — the charter's North star, Boundaries, and Decisions are all `TODO` stubs, so there is no stated principle for the code to violate. The "What it is" line (foreground/background/active-inactive state + resume/pause/back across web and native) is faithfully realized. Because the charter is silent on everything else, the scoring falls back to the codebase-map AAA standard (per the rubric rule), and the open questions below are surfaced rather than judged.

## Contract & docs fit

Lives up to the contract cleanly:

- **Types-first** — `AppLifecycleState`, `LifecycleBackend`, `AppLifecycle`, and the two new `AppLaunchKind` / `AppMemoryPressure` string-kind types all live in `@flighthq/types` and are exported from its barrel (verified at index.ts:9,13). No cross-package types inline in the package.
- **Full unabbreviated names** — every export carries the full type word (`attachAppLifecycle`, `getAppLifecycleState`, `getAppLaunchKind`, `requestAppBack`); `is*` for booleans; exports alphabetized.
- **Sentinels, not throws** — `getAppLaunchKind` returns `'warm'` for backends without the method; web backend returns no-op unsubscribes and `'active'`/`'cold'` in SSR; nothing throws for expected absence.
- **Single root export** (`index.ts` → `export * from './lifecycle'`), `"sideEffects": false`, no top-level registration or listener wiring — delivery is opt-in via `attachAppLifecycle`. Backend is lazily created on first `getLifecycleBackend()`, not at module load.
- **Rust mirror** — `crate: flighthq-lifecycle` is declared and the seam (`LifecycleBackend` trait + optional methods, signals, `set_/get_lifecycle_backend`, native default in `host-winit`/`host-sdl`) maps cleanly; the port is correctly deferred to the `rust` worktree.

Candidate doc revisions (user's gate, not mine):

- **Package Map line is now stale-by-omission.** `tools/agents/docs/index.md`'s `@flighthq/lifecycle` entry reads "app active/inactive/background, resume/pause, back button" — it predates `onMemoryWarning`, `onSaveState`/`onRestoreState`, and launch-kind. Worth widening to "…back button, memory-warning, save/restore-state, and cold/warm launch."
- **`enableAppLifecycleSignals` convention.** The Silver roadmap asked whether the entity's signals carry per-listener cost warranting an `enable*` opt-in. They do not (plain `createSignal()`), so the charter should record that the signals are zero-cost-until-connected rather than leaving the question implicit — a one-line Decision candidate.

## Candidate open directions

Questions the (stub) charter does not answer that this review had to assume against — each a candidate for the charter's Open directions. These align with structural fork F (thin-by-design vs under-built):

- **Is the 4-edge signal set in scope?** Decide whether first-class `onBackground`/`onForeground` (and `onActivate`/`onResignActive`) are worth the surface, or whether deriving from `onStateChange` is the blessed answer. This is the single largest "is the surface complete" question.
- **Where does memory-warning live?** Keep `onMemoryWarning` in `lifecycle`, or move it to a `@flighthq/power`-adjacent home? The depth review notes it "rides alongside background/foreground" in most platform abstractions; the lean is to keep it here, but the boundary is uncharted (fork A: source-data vs participation isn't it, but the home question is real).
- **Idle-detection ownership** — `lifecycle` vs `@flighthq/input` for `onUserIdle`/`onUserActive`. Resolve before anyone builds it.
- **State-restoration payload shape.** `onSaveState` uses a mutable `Record<string, unknown>` bag, not the alternative `out`-param struct the roadmap floated. Confirm the bag is the blessed shape and that the app (not lifecycle) owns the storage call, so the cell stays dependency-light.
- **Is `timeInBackground` wanted?** Cheap to add and canonical for cache-TTL/re-auth — but it is a surface addition the charter has not asked for. Surface it rather than assume.
