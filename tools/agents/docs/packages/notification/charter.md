---
package: '@flighthq/notification'
crate: flighthq-notification
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# notification — Charter

## What it is

System / OS notifications over a swappable backend — the platform-suite command capability for toast/desktop/mobile notifications. It owns permission introspection (`getNotificationPermission`, `requestNotificationPermission`), showing and identity (`showNotification` returning an id, `close*`, `updateNotification`), scheduling (`scheduleNotification` / `cancelScheduledNotification` / `getPendingNotifications`), Android-class channels, and the full lifecycle subscription set (`onNotificationShow / Click / Dismiss / Action / Reply`). It ships a lazy web `Notification`-API backend plus a service-worker backend (the only path that can deliver action buttons), and exposes the standard `get*Backend` / `set*Backend` / `createWeb*Backend` seam.

The line vs. neighbors: notification is a **thin subject** — one capability, one seam, no `-formats` split. Native delivery (Electron/Tauri/Capacitor) lives in `host-*` packages and fills this package's seam; notification itself defines the surface and the web tier. The cross-package type header (`NotificationRequest`, `NotificationBackend`, the enums, capabilities) lives in `@flighthq/types`, not here. It ends where a host adapter begins and where signals dispatch (`@flighthq/signals`) would begin if adopted.

## North star (proposed)

_Proposed, not blessed — edit or contest each line._

- **Header-first, sentinel-throughout, side-effect-free.** Types are designed in `@flighthq/types` first; every unsupported path returns a sentinel (`''`, `false`, `null`, `[]`, no-op) rather than throwing — denial is an expected outcome, not an error; the web backend is created lazily, never at module top level.
- **One self-identifying command capability.** Every export carries the full `Notification` type word and follows the platform-suite command grammar exactly (`get*/set*/createWeb*Backend` + `on*` over backend `subscribe*`). A reader lands in the notification domain from any name in isolation.
- **A complete, honest web tier.** The web/service-worker backends should deliver everything the browser platform actually supports, and the _type_ should tell the truth about what is delivered (no field promised that no shipped backend can fulfill).
- **Thin subject, single root export.** No `-formats`/`-backend` package split; a healthy plurality of backends (basic web + service-worker) lives behind one seam. The package stays a thin barrel re-export with `"sideEffects": false`.
- **Backend seam as the native door.** Richer/native delivery arrives by registering a backend, never by coupling this package to a host — "Electron support" is one backend, not a dependency.

## Boundaries (proposed)

_Proposed, not blessed._

**In scope**

- The notification surface: permission, show/identity/update/close, scheduling, channels, lifecycle events, capability descriptor.
- The web `Notification`-API backend and the service-worker backend.
- The `NotificationBackend` seam and its `get*/set*/createWeb*` accessors.

**Non-goals (proposed)**

- Native delivery implementations (Electron/Tauri/Capacitor) — those are `host-*` packages filling this seam.
- Defining cross-package types inline — `NotificationRequest`/`NotificationBackend`/enums belong in `@flighthq/types`.
- A `-formats` or `-backend` sub-package split — notification is a thin subject (structural-forks triad plurality guard).

## Decisions

None blessed yet.

## Open directions

The charter is a stub today; these are the questions a direction pass must settle. Each is surfaced because the review (or a structural fork) had to assume an answer.

1. **What is the bar — "web-tier authoritative" or native parity?** Is notification's North star "the seam + a complete web backend" (native lives in `host-*`), or "feature-complete across hosts"? The package is excellent on web with zero native delivery of its own.
2. **Inert-infrastructure policy (recurs across the platform suite — fork-worthy).** `subscribeReply` / `onNotificationReply` and `getActiveNotifications` ship surface no included backend can fulfill (the SW backend has no `_dispatchReply`; web `getActiveNotifications` returns `[]`). Is shipping host-ready-but-currently-dead API the blessed posture, or should the web tier expose only what it can deliver and let native hosts widen the type?
3. **Lossy `getActiveNotifications`.** Accept the partial cast (SW returns `{ title, tag }` cast to a full `Readonly<NotificationRequest>`), introduce an explicit `ActiveNotification` summary type, or narrow the return? Determines whether the type tells the truth.
4. **`progress?` / ongoing notifications — in or out?** The one canonical rich field still missing; `updateNotification`'s own doc promises progress-bar support that `NotificationRequest` cannot express.
5. **Signals opt-in.** Does notification get an `enableNotificationSignals` group (per the codebase-map signals rule for multi-listener loose notification), or stay callback-only? A cross-package `@flighthq/signals` dependency — a direction decision, not a sweep.
6. **Channel methods on the `NotificationBackend` interface.** Promote the optional channel trio (`createNotificationChannel` / `deleteNotificationChannel` / `getNotificationChannels`) onto the header type, or keep them as documented off-interface structural-cast extensions? A small but real API-shape fork.
7. **Service-worker dispatch handles vs. monkey-patched casts.** `createServiceWorkerNotificationBackend` bolts `_dispatch*` onto the returned object via a cast (the legacy `internal.ts` pattern the codebase map warns against), read back by `notifyServiceWorkerBackendAction`. Bless the cast (forced for a backend factory with no runtime object), or move to a typed companion handle (`{ backend, dispatch }`)?
8. **Native permission gaps.** `'provisional'` (Apple) is absent from the `NotificationPermission` union — native-only and minor; settle whether the union tracks native states the web tier never reports.

**Structural forks touching this package:**

- **Fork D (runtime backend seam).** Textbook fork-D: the `*Backend` + `set*Backend` seam with two web backends (basic + service-worker). No `-formats`/`-backend` split — notification is a thin subject, not a triad (plurality guard satisfied by backend plurality alone). Confirm this stays the shape.
- **Fork E (bedrock + built-unblessed register).** notification is now `solid` but unblessed; it is a candidate register entry under the seam dimension (D) and the bedrock track (E). The bedrock test (substantial/irreducible, well-homed, honestly named) should be applied as part of blessing.
- **Cross-cutting doc drift (candidate revisions, user-gated).** The Package Map one-liner ("OS notifications and permission") is stale for what shipped (rich content, scheduling, channels, lifecycle, SW backend, capability descriptor); and `structural-forks.md`'s register does not yet track notification's built state. Both are candidate revisions to raise when direction is set.
- **Rust crate (conformance).** `flighthq-notification` does not exist yet; the conformance map should track the seam (`notify` / `get_permission` / `close` / `schedule` / `get_pending` / `get_active` / `update` / `on_*` over a `NotificationBackend` trait, native default behind the `native` feature).
