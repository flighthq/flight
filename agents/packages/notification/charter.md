---
package: '@flighthq/notification'
role: package
crate: flighthq-notification
draft: false
lastDirection: 2026-08-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# notification — Charter

See [platform integration shared principles](../platform-integration.md) and the
[explicit dependency model](../../explicit-dependency-model.md).

## What it is

System-notification commands and events over an explicit `Host.notification` group. The group has eleven
independently optional traits: `permission`, `delivery`, `close`, `activeList`, `scheduling`, `lifecycle`,
`action`, `click`, `dismiss`, `reply`, and `received`. A provider claims only the traits its injected native
API and execution context actually implement.

Delivery and scheduling return stable `Notification` and `ScheduledNotification` Entity resources. Native
handles and numeric ids remain provider-private. Per-resource `closeNotification(notification)` and
`cancelScheduledNotification(scheduled)` are origin-pinned and never accept a replacement Host; provider-wide
close, enumeration, permission, scheduling, and lifecycle operations dispatch through an exact Host trait.

Event observation uses five Entity subscription families with Signals and explicit async
create/attach/detach/dispose operations. Attach and release failures remain named and observable. Provider
destroy is terminal and idempotent, attempts every live release, and retains only failures for retry.

## Decisions

- **[2026-07-02] Extract shared listener registry/scheduler primitive.** The two backend factories (web `Notification` API and service-worker) share ~95% of their code (~230 lines each) — a shared listener-registry/scheduler primitive should be extracted so the backends are thin wrappers over the common core.

- **[2026-08-30] Derive eleven traits from provider coverage and shape.** Command and event traits stay
  separate even where their coverage matches. Deleted update/capability-query/launch/channel surfaces do not
  survive as stubs or a parallel API era.
- **[2026-08-30] Exact injected profiles.** Web page = click/close/delivery/dismiss/lifecycle/permission/received;
  Web Service Worker = action/activeList/click/close/delivery/dismiss/lifecycle/permission; Electron common =
  click/close/delivery/dismiss/lifecycle/received, with action/reply only on macOS; Tauri =
  delivery/lifecycle/permission; Capacitor = action/click/delivery/lifecycle/permission/scheduling.
- **[2026-08-30] Permission belongs to this native seam.** `Host.notification.permission` is the sole native
  owner of notification permission. A generic Permissions surface may delegate to it, but must not make a
  second native notification-permission call. Electron claims no permission trait.
- **[2026-08-30] Acceptance is not display success.** Every operation returns a named outcome. Delivery is
  accepted only after provider acquisition succeeds; Electron waits for the native `show` event. Invalid or
  rejected request fields are returned by name instead of being silently dropped.
- **[2026-08-30] Tray is outside this domain.** Notification does not own tray icons, menus, or tray events.
- **[2026-08-30] The 2026-07-02 extraction premise is superseded.** The duplicated factories and fake
  schedulers were deleted. Web page and Service Worker are separate injected providers with different exact
  profiles; only genuinely shared Entity binding/subscription mechanics remain in notification core.

## Open directions

1. Add request vocabulary such as provisional authorization, progress, grouping, or ongoing delivery only
   alongside a provider that can prove it; current providers reject unsupported fields.
2. A Rust `flighthq-notification` crate remains cross-repository conformance work.
