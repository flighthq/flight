---
package: '@flighthq/lifecycle'
crate: flighthq-lifecycle
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# lifecycle — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

`@flighthq/lifecycle` is the event capability for application lifecycle: the foreground/background/active-inactive state of the app and the transition events an app reacts to — resume/pause, the Android-style hardware back button, OS memory-pressure warnings, and save/restore-state across a web or native host. It follows the platform-suite event-capability shape: an `AppLifecycle` entity of inert signals, with `createAppLifecycle`/`attachAppLifecycle`/`detachAppLifecycle`/`disposeAppLifecycle` for delivery, and a swappable `LifecycleBackend`. Highest suite review score (58). SSR-safe — the web default guards every API and degrades to sentinels in non-browser environments.

## Decisions

- **[2026-07-02] No specific issues to fix.** The package is the highest-scoring in the suite and has no known bugs or convention violations. No changes required at this time.

## Open directions

- Whether `onBackground`/`onForeground` (and `onActivate`/`onResignActive`) edges should be first-class signals or derived from `onStateChange`.
- Memory-warning ownership: keep `onMemoryWarning` here (it rides alongside background/foreground on most platforms) or move to a `power`-adjacent home.
- Idle/user-inactivity ownership vs `@flighthq/input`.
- State-restoration payload shape: confirm the mutable `Record<string, unknown>` bag is blessed.
- Whether `timeInBackground` (ms-in-background payload on `onResume`) is wanted.
