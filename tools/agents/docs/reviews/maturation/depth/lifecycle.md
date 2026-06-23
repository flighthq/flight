# Maturation Roadmap: @flighthq/lifecycle

**Current verdict**: solid — 72/100. A well-formed, idiomatic event-capability cell that faithfully covers foreground/background state and resume/pause/back signals, but missing the secondary-but-canonical states and events (true `'inactive'`, memory warnings, cold-start vs. resume, vetoable back) that separate a "foreground/background flag" from a full lifecycle library.

The package today is three files: `AppLifecycle` (entity of four signals) + `LifecycleBackend` (`getState`/`subscribe`) in `@flighthq/types`, and the `create`/`attach`/`detach`/`dispose` + `get`/`set`/`createWeb*Backend` quartet over a web visibility/pagehide backend. Every additive item below stays inside the cellular model: new signals on the entity, new readers, or new optional backend methods — all tree-shakable, all over the same swappable `LifecycleBackend` seam.

## Bronze

The minimum viable upgrade: produce the state the type already promises, and add the boolean conveniences that bring it in line with its siblings. Small, mechanical, high-value.

- **Produce the declared `'inactive'` state on the web backend.** Wire `window.focus`/`window.blur` (and `document.visibilitychange`) so the backend yields `'active'` (visible + focused), `'inactive'` (visible, not focused — app switcher, other-window focus, control-center overlay), and `'background'` (`document.hidden`). The three-state model becomes real in practice, not just in the type. This is the single highest-value fix from the depth review.
- **`isAppActive(): boolean` and `isAppBackground(): boolean`** convenience readers (and `isAppInactive(): boolean` for symmetry), matching the sibling `isNetworkOnline()` pattern so callers stop comparing `getAppLifecycleState()` against string literals. Free functions reading `getLifecycleBackend().getState()`.
- **Document `onResume`/`onPause` derivation semantics precisely.** They already key on `'active'` ↔ non-`'active'`; once `'inactive'` is produced, confirm and test that `active→inactive` fires `onPause` and `inactive→active` fires `onResume` (interruption is treated as a pause), and that `onStateChange` is "raw change, not deduped." Add a note in the entity doc.
- **Test the new state transitions**: web focus/blur paths, the `inactive` derivation in both directions, and the new boolean readers — colocated in `lifecycle.test.ts`, `describe` blocks alphabetized to mirror exports.

## Silver

Competitive and solid — covers the canonical lifecycle concerns a professional app reacts to across web, mobile, and desktop hosts, with cross-backend consistency.

- **`onMemoryWarning(level)` signal** with an `AppMemoryPressure` string-kind type (`'normal' | 'moderate' | 'critical'`, defined in `@flighthq/types`) — the abstraction of iOS `didReceiveMemoryWarning` and Android `onTrimMemory`. Backend grows an optional `subscribeMemoryWarning?(listener)`; the web backend wires `navigator.deviceMemory`-gated heuristics where available and degrades to no-op (sentinel) otherwise. The app's canonical cue to drop caches.
- **Cold-start vs. warm-resume distinction.** Add `getAppLaunchKind(): AppLaunchKind` (`'cold' | 'warm'` string-kind in `@flighthq/types`) and an `onResume` payload carrying `timeInBackground` (ms, `-1` when unknown). Drives cache-invalidation and re-auth decisions, the core reason apps consult lifecycle. Implemented by tracking the last-background timestamp in the entity runtime; the backend stays raw.
- **Vetoable / handled back button.** Give `onBackButton` a handled contract mirroring the windowing API's `onCloseRequest`: emit, then check whether a listener consumed it via `cancelSignal`. Add `requestAppBack(app): boolean` (returns `false` when a listener consumed the event, else the host performs default navigation/exit), and make the back signal payload carry the cancellable flag. Reuse the exact `Signal` cancellation mechanism `application/window.ts` uses so the seam is consistent across the SDK.
- **State-restoration hooks.** `onSaveState(out)` and `onRestoreState(state)` signals — the moment to persist/restore UI state across a backgrounded process kill (Android `onSaveInstanceState`, iOS state restoration). Plain-data payload (a `Readonly<Record<string, unknown>>`-shaped bag or an `out`-param struct); no storage coupling — the app owns where bytes go.
- **`enableAppLifecycleSignals(app)` grouping** if any of the above carry per-listener cost beyond plain signal allocation, per the `enable*` opt-in convention; otherwise document that the entity's signals are all zero-cost-until-connected.
- **Backend feature-detection sentinels.** Optional backend methods (`subscribeMemoryWarning`, back-button subscribe, launch-kind) must be truly optional; `getState`/`subscribe` stay required. Web backend returns sentinels (no-op unsubscribe, `-1`, `'warm'`) where the capability is absent, never throwing.

## Gold

Authoritative / AAA — the canonical reference for application lifecycle, with exhaustive coverage, full native-backend reach, and 1:1 Rust-port parity.

- **Full native backend reach proven through `@flighthq/host-electron`** (and future `host-capacitor`/`host-tauri`): Electron `app` `'activate'`/`'browser-window-blur'`/`'browser-window-focus'`/`render-process-gone`, and the documented Android back-button + `onTrimMemory` + iOS `scenePhase`/memory-warning mappings, each implemented as a `createElectron*` / native backend filling the same `LifecycleBackend` seam. Demonstrates the seam is not web-shaped.
- **`onBackground`/`onForeground` first-class signals** distinct from `onResume`/`onPause`, so apps that need the strict visible/hidden edge (independent of focus interruptions) have it without re-deriving from `onStateChange`. Plus `onActivate`/`onResignActive` for the focus edge — the full four-edge set apps on different platforms expect.
- **Idle / user-inactivity timeout** (`onUserIdle(durationMs)` / `onUserActive()`) over an optional backend, or an explicit decision (surfaced to the user) that idle detection belongs in `@flighthq/input` instead — resolve and record the boundary.
- **Debounce / coalescing policy** documented and tested: rapid pagehide/pageshow or blur/focus storms collapse to the minimal correct edge set; `onStateChange` is explicitly "raw, not deduped" while `onResume`/`onPause`/`onBackground`/`onForeground` are deduped edges. Property/fuzz tests over transition sequences.
- **Exhaustive edge-case + error coverage**: SSR/jsdom absence of `document`/`window`, backend swap while attached (re-subscribe), double-attach idempotence under all new signals, `out`-param alias safety for `onSaveState`, and missing-capability sentinels for every optional backend method.
- **`flighthq-lifecycle` Rust crate** mirroring the seam 1:1: `AppLifecycle` (signals), `LifecycleBackend` trait with `get_state`/`subscribe` + optional `subscribe_memory_warning`/back/launch-kind, the `set_lifecycle_backend`/`get_lifecycle_backend` pair, native default backend (winit/SDL window focus/visibility events) gated behind the `native` feature, and `host-web` wasm fill. `AppLifecycleState`/`AppLaunchKind`/`AppMemoryPressure` mirrored in `flighthq-types`. Paired conformance scene in `flighthq-functional` if a visual/headless oracle applies (likely an assertion-ported unit conformance rather than a render scene, since lifecycle has no pixels).
- **Docs**: a short capability doc covering the state machine (the `active`/`inactive`/`background` graph and which edges fire which signals), the backend-author contract (what a native host must report vs. may omit), and the cache-drop/re-auth/state-restoration usage patterns.

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Bronze first — cheap and self-contained.** Produce `'inactive'` (web focus/blur), add the three boolean readers, tighten `onResume`/`onPause` semantics and tests. No other package or new type needed (`AppLifecycleState` already lists `'inactive'`). ~Half a day. This alone closes the most-cited depth-review gap.
2. **Silver, types-first per the header rule.** Define `AppLaunchKind`, `AppMemoryPressure`, the back-button cancellable payload, and the state-restoration payload in `@flighthq/types` **before** implementing. Then: (a) memory warning, (b) cold/warm launch + `timeInBackground`, (c) vetoable back button — reusing the `cancelSignal` mechanism from `application/window.ts`, so coordinate with whoever owns the signal-cancellation contract to keep it identical, (d) save/restore hooks. Each is an independent additive signal + optional backend method; ~2–3 days total.
3. **Gold last, and partly cross-package.** The native-backend proofs depend on `@flighthq/host-electron` (and the not-yet-built mobile hosts) — gate Gold's native items on those existing rather than blocking lifecycle on them. The Rust crate depends on `flighthq-types`, `flighthq-signals`, and a host crate (`host-winit`/`host-sdl`) for the native default; sequence it after the TS seam is final so the port mirrors a stable surface.

Cross-package / design-decision items to surface to the user:

- **Memory-warning home.** Whether `onMemoryWarning` belongs in `lifecycle` or a future `@flighthq/memory`/`@flighthq/power`-adjacent cell. The depth review notes it "rides alongside background/foreground" in most platform abstractions; recommend keeping it here but flag the boundary.
- **Idle detection home.** `onUserIdle`/`onUserActive` may overlap `@flighthq/input`. Decide ownership before building (Gold item) — do not implement autonomously.
- **State-restoration vs. `@flighthq/storage`.** `onSaveState`/`onRestoreState` deliberately carry plain data and do not persist anything; confirm the app (not lifecycle) owns the storage call, so the cell stays dependency-light.
- **Signal-cancellation contract reuse.** The vetoable back button must use the same `cancelSignal`/`data.cancelled` pattern as `application`'s `onCloseRequest`; if that pattern is being reshaped anywhere, land that first to avoid two divergent veto idioms.
