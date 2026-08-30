---
package: '@flighthq/app'
role: package
crate: flighthq-app
draft: false
lastDirection: 2026-08-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# app — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Process-level application identity and OS integration -- the layer that answers "what the running application is to the OS." Owns application identity (name, version, locale triad, install paths via `AppPathKind`), process lifecycle control (quit + quit-veto, relaunch, focus, hide/show, activation policy), single-instance locking, dock/taskbar badging and attention, recent-document and login-item registration, and OS-level app events (`onActivate`, `onAllWindowsClosed`, `onOpenFile`, `onQuitRequest`, `onReady`, `onSecondInstance`). Distinct from `@flighthq/application` (main loop + windowing): `app` = who you are, `application` = how you run. Every command, query, and event attachment takes the exact `HasApp*` Host witness it needs. `createApp()` returns an Entity; attach/detach/dispose retain and release the exact originating event subscriptions. Unsupported operations are absent Host slots, never sentinels.

## Decisions

- **[2026-07-02] Keep both `app` and `application` names.** `app` (process identity, OS integration, 42 exports) and `application` (main loop, windowing, frame control) are distinct domains with a clear boundary. The names stay.
- **[2026-07-02] 42 exports is the scope ceiling for process identity.** The current export count covers the full process-identity surface. Growth beyond this should be scrutinized for scope creep into `application`, `lifecycle`, or `tray` territory.
- **[2026-08-30] Application capabilities are explicit and method-tight.** `Host.app` has independent optional slots for each real command/query/event vector. Web publishes badge, focus, locale, name, quit, ready, and relaunch; native hosts publish only the slots supported by their injected OS profile. The ambient resolver, diagnostics, Web enabler, and sentinel surface are deleted.
- **[2026-08-30] OS-profile-dependent native shapes are structural.** Electron construction takes an injected desktop profile; Capacitor construction takes an injected mobile profile. Neither adapter guesses the platform. macOS/Windows/Linux and Android/iOS differences appear in the returned Host type and slot presence.

## Open directions

- Seam to `@flighthq/lifecycle`: `onActivate` / `onAllWindowsClosed` here overlap conceptually with lifecycle's active/background events. The boundary needs an explicit ruling.
- Memory-pressure and launch-kind events: `AppMemoryPressure` and `AppLaunchKind` exist as types in `@flighthq/types` with no implementer. Wire them here or move to `@flighthq/lifecycle`.
- Jump-list / dock-menu unification across platforms.
- Five parked rulings in status.md (quit-veto mechanism, locale triad split, filesystem-paths boundary, tray-vs-badge ownership, `setAppUserModelId` ownership) are candidates for promotion to Decisions.
