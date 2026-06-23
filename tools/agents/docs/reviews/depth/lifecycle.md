# Depth Review: @flighthq/lifecycle

**Domain**: Application lifecycle — foreground/background/active-inactive state and the resume/pause/back-button transition events that an app reacts to (pause audio, throttle the loop, flush state, handle the Android back button) across web and native hosts.

**Verdict**: solid — 72/100

This is an intentionally narrow _event-capability_ cell, not a sprawling sub-library, so the bar is "does it cover the canonical lifecycle surface an app needs to react to host state changes" rather than "is it a 40-function library." Within that scope it is well-formed and idiomatic, but it is at the leaner end of its own package class and a few canonical lifecycle concerns are absent.

## Present capabilities

The full event-capability quartet plus backend seam, all idiomatic to the platform suite:

- `createAppLifecycle()` — allocates the entity with four inert signals.
- `attachAppLifecycle(app)` / `detachAppLifecycle(app)` / `disposeAppLifecycle(app)` — delivery lifecycle; `attach` is idempotent (tears down a prior subscription first), `detach` is safe when not attached, `dispose` correctly aliases detach (signals are plain GC memory).
- `getAppLifecycleState()` — synchronous state reader.
- Signals: `onStateChange(state)`, `onResume()`, `onPause()`, `onBackButton()`.
- Backend seam: `getLifecycleBackend()` (lazy web default — there is always a backend), `setLifecycleBackend(backend | null)` (install native / reset to web), `createWebLifecycleBackend()`.
- Web backend over `document.visibilitychange` + `window.pagehide`/`pageshow`, degrading to `'active'` + no-op subscribe when `document`/`window` are absent (SSR/jsdom safe).
- Derived edge events: `onResume`/`onPause` are computed from `active`↔non-`active` transitions rather than requiring the backend to report them — good design, the backend only needs raw state.
- Tests cover every export including the aliased dispose, the active-edge derivation in both directions, and the web-fallback paths.

This matches the canonical shape of its siblings (`@flighthq/network`, `@flighthq/power`): entity of signals + `create`/`attach`/`detach`/`dispose` + `get`/`set`/`createWeb*Backend`.

## Gaps vs an authoritative application-lifecycle library

Measuring against what mobile/desktop lifecycle APIs (Capacitor `App`, Android `Lifecycle`, iOS `UIApplication`/`scenePhase`, Electron app events) canonically expose:

- **The `'inactive'` state is declared but never produced.** `AppLifecycleState` includes `'inactive'`, and `onResume`/`onPause` are keyed on `'active'` vs non-`'active'` — but the web backend only ever yields `'active'` / `'background'` (it maps `document.hidden`). There is no path to `'inactive'` (the transient "visible but not focused" / interruption state: app switcher, phone call, control-center overlay). On the web this is reachable via `window.blur`/`focus`, which the backend does not wire. So the three-state model is real in the type but two-state in practice — an authoritative library distinguishes pause (backgrounded) from the lighter "resigned active" interruption, which apps treat differently (dim vs. fully suspend).
- **No back-button delivery on the only shipped backend.** `onBackButton` exists but the web backend never emits it (documented as native-only). That is defensible for the web seam, but it means the signature is present without any in-box producer; the canonical Android `backButton` (with the "exit app vs. navigate" handling, often a vetoable/handled return) is entirely deferred to a native host that does not exist here.
- **No app-state convenience accessors.** No `isAppActive()` / `isAppBackground()` boolean readers to match the sibling `isNetworkOnline()` pattern; callers must compare `getAppLifecycleState()` against a string literal.
- **No first-launch / cold-start vs. resume distinction**, and no `onResume` payload indicating time-in-background. Mature lifecycle APIs surface "was this a cold start or a warm resume" and often "how long were we backgrounded," which drive cache-invalidation and re-auth decisions.
- **No low-memory / memory-warning signal.** iOS `didReceiveMemoryWarning` and Android `onTrimMemory` are a canonical part of the lifecycle surface (the app's cue to drop caches). Arguably this could belong elsewhere, but in most platform abstractions it rides alongside background/foreground.
- **No `restoreState`/`saveState` (state-restoration) hook** — the moment to persist/restore UI state across a backgrounded kill, a standard lifecycle concern.
- **`onBackButton` is a bare `() => void` with no veto / handled mechanism.** A back button is canonically _handled-or-not_ (return true to consume, else default navigation/exit). The map's own windowing API models close-with-veto via `onCloseRequest`; the back button has no equivalent here.

None of these require breaking the cellular model — most are additional signals on the entity or additional backend `subscribe`/`getState` surface, all tree-shakable.

## Naming / API-shape notes

- Naming is clean and self-identifying: `attachAppLifecycle`, `getAppLifecycleState`, `LifecycleBackend`, `AppLifecycleState`. Functions carry the full type word; exports are alphabetized; loose state (`_backend`, `_subscriptions`) sits at the bottom of the file per style.
- Minor asymmetry vs. siblings: `network`/`power` expose a status _struct_ read into an `out` param (`getNetworkStatus(out)`) plus a boolean convenience (`isNetworkOnline`). Lifecycle's state is a single string enum, so a struct is unnecessary, but the missing `isAppActive()` boolean convenience is a small consistency gap.
- `onStateChange` fires on every backend change (including `pageshow`/`pagehide` that may not change the derived state); it always re-reads and re-emits. That is fine, but an authoritative API might debounce no-op transitions or document that `onStateChange` is "raw change, not deduped."
- The entity/runtime + free-function + swappable-backend shape is exactly right for the domain and ports cleanly to the Rust `flighthq-lifecycle` event seam.

## Recommendation

Keep the architecture as-is; it is a correct, idiomatic event-capability cell. To reach **authoritative** for the lifecycle domain (not merely "consistent with its siblings"), add, in priority order: (1) wire `window.focus`/`blur` so the declared `'inactive'` state is actually produced and `onResume`/`onPause` distinguish interruption from backgrounding; (2) add `isAppActive()` / `isAppBackground()` boolean conveniences; (3) give `onBackButton` a handled/veto contract mirroring `onCloseRequest`; (4) add a low-memory / `onMemoryWarning` signal and a cold-start-vs-resume indication (e.g. an `onResume` payload or `getAppLaunchKind()`), since cache-drop and re-auth on resume are core reasons apps consult lifecycle at all. The current package is a faithful, well-tested skeleton of the domain; it is missing the secondary-but-canonical states and events that separate a "foreground/background flag" from a full lifecycle library.
