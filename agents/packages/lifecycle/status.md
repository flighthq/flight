---
package: '@flighthq/lifecycle'
updated: 2026-08-30
by: builder2
---

# lifecycle — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/lifecycle/src/`, `packages/types/src/Lifecycle.ts`, and
the `host-*` packages on 2026-08-08. A file:line here is a claim about this tree, not a session.

- **No host implements `LifecycleBackend`.** The name appears in no `host-electron`, `host-tauri`, or
  `host-capacitor` source, so the seam is web-only and its two optional methods are unproven against a
  real OS: `getLaunchKind` is approximated from `PerformanceNavigationTiming.type` and
  `subscribeMemoryWarning` rides Chrome's experimental `memory-pressure` events (`lifecycle.ts:133`,
  `:157-161`), which never fire in a shipping browser. Until a native producer exists, `onMemoryWarning`
  and a true cold/warm distinction are theory.
- **Unknown memory-pressure levels are reported as `'moderate'`** rather than dropped
  (`lifecycle.ts:150-151`). Deliberate — a browser signalling pressure with an unrecognized level is
  still signalling — but it means a listener can be woken by a level Flight does not understand.
- **The four-edge set is undecided.** `AppLifecycle` carries seven signals
  (`types/src/Lifecycle.ts:31-39`) and no `onBackground` / `onForeground`; `onResume` / `onPause` key
  on `'active'` ↔ non-`'active'`, so they fire on both the focus interruption and the full background
  edge. An app that must distinguish them derives it from `onStateChange` itself. Adding the strict
  visibility pair is a user decision, not an implementation task.
- **Idle detection has no owner.** `onUserIdle` / `onUserActive` exist nowhere; the concept needs
  input events, so whether it lives here or in `@flighthq/input` must be settled before either builds
  it.
- **`timeInBackground` is not carried anywhere** — neither the backend nor the saved-state bag
  (`lifecycle.ts:235`) records when the app left `'active'`, so an app that wants elapsed-background
  time must timestamp it in its own `onSaveState` payload.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — Migrated to the explicit Host model. `attachAppLifecycle`, `getAppLifecycleState`,
  `getAppLaunchKind`, `isAppActive` / `isAppBackground` / `isAppInactive`, `hasLifecycleOperation` and
  `explainLifecycleOperation` now take `host: HasSystemLifecycle` and dispatch through
  `host.system.lifecycle`. DELETED: `getLifecycleBackend`, `setLifecycleBackend`,
  `installLifecycleHostBackend`, `explainLifecycleBackend`, `observeLifecycleHostResult`,
  `resetLifecycleBackendForTest`, the `_custom ?? _host ?? _sentinel` chain and its four module
  variables. host-web now publishes `webLifecycleBackend` as a value on `webHost.system.lifecycle`
  instead of installing it, so `enableHostWebLifecycle` is gone too.
  ★ The sentinel went with the resolver, which changes what `explainLifecycleOperation` MEANS:
  `layer: 'sentinel'` now reports that THIS host's provider omits the operation, not that a
  process-wide fallback answered for it. The old tests asserting "nothing installed" had no successor
  state to describe and were rewritten as per-host questions.

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped as **false**: "Debounce /
  coalescing policy tests … the formal invariant test is pending" — the property/fuzz battery landed
  in the 2026-06-25 pass and is in `lifecycle.test.ts` today. Also dropped the score bookkeeping, the
  Rust-crate plan, and the design-rationale essays for `getLaunchKind` and the memory-pressure mapping
  (both now live as durable comments at `lifecycle.ts:85` and `:133-151`, where the code is).
- **2026-06-25** — Four property tests over random transition storms pin the documented split:
  `onStateChange` is raw per notification, `onResume` / `onPause` collapse to the minimal active-edge
  set and stay within one of each other.
- **2026-06-24** — Gold landing: the `'inactive'` state and its edges, `onMemoryWarning`,
  `getAppLaunchKind`, `requestAppBack` with the `cancelSignal` veto, `onSaveState` / `onRestoreState`
  over a per-entity bag, and the three boolean state readers.
