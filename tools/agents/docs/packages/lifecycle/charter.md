---
package: '@flighthq/lifecycle'
crate: flighthq-lifecycle
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# lifecycle — Charter

## What it is

`@flighthq/lifecycle` is the **event capability** for application lifecycle: the foreground/background/active-inactive state of the app and the transition events an app reacts to — resume/pause, the Android-style hardware back button, OS memory-pressure warnings, and save/restore-state across a web or native host. It follows the platform-suite event-capability shape: an `AppLifecycle` entity of inert signals, with `createAppLifecycle` / `attachAppLifecycle` / `detachAppLifecycle` / `disposeAppLifecycle` for delivery, and a swappable `LifecycleBackend` (`get*`/`set*`/`createWeb*`) that a native host fills.

Where it ends and a neighbor begins:

- **vs `@flighthq/application`** — `application` owns the main loop and the _window_ (`ApplicationWindow` size/position/state + `onCloseRequest`). `lifecycle` owns the _application-process_ phase that sits above any one window: is the whole app foreground/background, did the OS warn on memory, is this a cold or warm launch. The back-button veto idiom is a 1:1 reuse of `application`'s `onCloseRequest`/`requestCloseWindow`, not a second veto system.
- **vs `@flighthq/app`** — `app` is host-shell identity/control (quit/relaunch, badge, single-instance, `onActivate`/`onOpenFile`). `lifecycle` is the runtime _phase_ the app moves through, not its identity.
- **vs `@flighthq/power`** — `power` owns battery/charging/keep-awake. Memory-pressure currently lives here because it rides alongside background/foreground on most platforms; the home is a live open direction below.
- **vs `@flighthq/input`** — `input` owns raw user-input events. Idle / user-inactivity detection overlaps both and is deliberately unbuilt pending an ownership ruling.

## North star (proposed)

_Proposed durable principles, inferred from the design and the structural forks. Edit or reject in review._

- **Phase, not storage.** `lifecycle` reports _when_ phase changes and lets the app act; it never owns persistence. `onSaveState` hands listeners a mutable bag and replays it on `onRestoreState`, but the app makes the storage call. The cell stays dependency-light.
- **Derived edges over a state machine the user must run.** Expose the raw `onStateChange` plus the few high-value deduped edges (`onResume`/`onPause`) so the common app reacts without re-deriving them, while the raw stream stays available for apps that need every notification.
- **Seam-first, web-honest.** Every signal works through a `LifecycleBackend`; the lazy web default serves what the browser can serve and degrades to sentinels/no-ops in SSR rather than throwing. Signals that only a native host can reliably produce (hardware back button, memory pressure) keep their signatures so a host backend lights them up without an API change.
- **Event-capability conformance.** Match the platform-suite event shape exactly — entity-of-signals, `create/attach/detach/dispose`, `is*` boolean conveniences, sentinels not throws, `"sideEffects": false`, no top-level wiring — so the cell is interchangeable with its siblings and 1:1 portable to `flighthq-lifecycle`.

## Boundaries (proposed)

_Proposed scope lines, drawn from the review and neighbors. Edit in review._

**In scope (proposed):**

- App phase state (`active` / `inactive` / `background`) and its read accessors + `is*` booleans.
- Transition events: `onStateChange`, `onResume`/`onPause`, `onBackButton` (vetoable), `onMemoryWarning`, `onSaveState`/`onRestoreState`.
- Cold/warm launch classification (`getAppLaunchKind`).
- The `LifecycleBackend` seam + lazy web backend.

**Non-goals (proposed):**

- Persistence/storage of saved state (the app owns the storage call).
- The main loop and per-window controls (those are `application`).
- Battery/power and keep-awake (`power`).
- Native backend implementations and the Rust crate (the `host-*` / `rust` worktrees).

## Decisions

None blessed yet.

## Open directions

Every candidate question the review surfaced, plus the structural forks that touch this cell. Each is a real decision for the direction session — not yet answered.

- **Is the 4-edge signal set in scope?** Should `lifecycle` expose first-class `onBackground`/`onForeground` (and `onActivate`/`onResignActive`) edges, or is deriving them from `onStateChange` the blessed answer? This is the single largest "is the surface complete" question and maps to **fork F** (thin-by-design vs under-built).
- **Where does memory-warning live?** Keep `onMemoryWarning` in `lifecycle`, or move it to a `@flighthq/power`-adjacent home? The lean from the review is to keep it here (it rides alongside background/foreground on most platforms), but the boundary is uncharted.
- **Idle / user-inactivity ownership.** `lifecycle` vs `@flighthq/input` for `onUserIdle`/`onUserActive` — resolve before anyone builds it (overlaps input events).
- **State-restoration payload shape.** Confirm the mutable `Record<string, unknown>` bag is the blessed shape (vs the `out`-param struct the roadmap floated), and that the app — not `lifecycle` — owns the storage call.
- **Is `timeInBackground` wanted?** A ms-in-background payload on `onResume` (`-1` when unknown) is cheap to add and canonical for cache-TTL / re-auth, but it is a surface addition the charter has not asked for. Decide before adding.
- **`enableAppLifecycleSignals` convention.** The signals are plain `createSignal()` and zero-cost until connected, so no `enable*` opt-in is needed. Confirm this so it can become a one-line Decision rather than an implicit assumption.
- **Native-producer expectation for seam-only signals.** Two of seven signals (`onBackButton`, `onMemoryWarning`) have no reliably-firing web producer. Confirm that carrying their signatures ahead of a `host-electron`/`host-capacitor` producer is the intended posture (**fork D** — runtime backend seam).
- **Package Map line is stale-by-omission.** The `tools/agents/docs/index.md` entry predates `onMemoryWarning`, save/restore-state, and launch-kind — a doc revision to surface to the user, not an in-cell change.
- **Property/fuzz coverage for state storms.** Whether rapid blur/focus coalescing deserves property tests is a Gold-tier item pending direction.
