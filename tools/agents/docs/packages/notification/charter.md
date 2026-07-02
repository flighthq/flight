---
package: '@flighthq/notification'
crate: flighthq-notification
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# notification — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

System/OS notifications over a swappable backend — permission introspection, show/identity/update/close, scheduling, Android-class channels, and lifecycle subscriptions (`onNotificationShow / Click / Dismiss / Action / Reply`). Ships a lazy web `Notification`-API backend plus a service-worker backend (the only web path that can deliver action buttons). The cross-package type header (`NotificationRequest`, `NotificationBackend`, enums, capabilities) lives in `@flighthq/types`. Native delivery (Electron/Tauri/Capacitor) fills the seam via `host-*` packages.

## Decisions

- **[2026-07-02] Extract shared listener registry/scheduler primitive.** The two backend factories (web `Notification` API and service-worker) share ~95% of their code (~230 lines each) — a shared listener-registry/scheduler primitive should be extracted so the backends are thin wrappers over the common core.

## Open directions

1. **Inert-infrastructure policy.** `subscribeReply` / `onNotificationReply` and `getActiveNotifications` ship surface no included backend can fulfill. Is shipping host-ready-but-currently-dead API the blessed posture, or should the web tier expose only what it can deliver?
2. **Lossy `getActiveNotifications`.** The SW backend returns `{ title, tag }` cast to a full `NotificationRequest`. Accept the partial cast, introduce an explicit `ActiveNotification` summary type, or narrow the return?
3. **`progress?` / ongoing notifications.** `updateNotification`'s doc promises progress-bar support that `NotificationRequest` cannot express. In or out?
