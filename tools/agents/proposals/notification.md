---
id: notification
title: '@flighthq/notification'
type: depth
target: notification
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/notification.md
  - tools/agents/docs/reviews/depth/notification.md
depends_on: []
updated: 2026-06-23
---

## Summary

partial — 52/100. A clean, correct, well-guarded seam over the host notification surface that covers the basic ask-permission/show/tap loop but exposes only the most basic notification shape and omits most canonical capabilities (tri-state permission, dismiss/update, scheduling, channels, rich content, lifecycle, action delivery on web).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% that closes the most glaring correctness/usability gaps. Shippable but basic.

- **Tri-state permission.** Add `NotificationPermission = 'default' | 'granted' | 'denied'` to `@flighthq/types`. Add backend method `getPermission(): NotificationPermission` and free function `getNotificationPermission(): NotificationPermission`. The web backend reads `Notification.permission` (returns `'denied'` when unsupported). This restores the distinction between "not yet asked" and "denied" — the single highest-value addition.
- **Notification identity / return handle.** Change `notify`/`showNotification` to return `Promise<string>` — the notification id (echo `request.tag` if provided, else a backend-generated id; `''` is the not-shown sentinel, preserving the throw-free contract). Add optional `id?: string` to `NotificationRequest` so callers can supply a stable id. Clicks/actions key off this id, fixing the "untagged notifications are uncorrelatable" gap.
- **Dismiss / clear.** Add backend methods `close(id)` and `closeAll()`; free functions `closeNotification(id: string): void` and `closeAllNotifications(): void`. Web backend keeps a live `Map<id, Notification>` of instances it created so it can actually `.close()` them and wire per-instance `onclick`.
- **Make web click delivery real.** Wire each created `Notification` instance's `onclick` into the `subscribeClick` listener set, keyed by id. This closes the "click never fires on the only included backend" gap for the non-service-worker path. `subscribeAction` stays no-op on the basic web backend (documented), since action buttons genuinely require the Service Worker variant (Silver).
- **Honesty on `actions`.** Until the SW backend lands, document on `NotificationRequest.actions` that it is delivered only by the service-worker web backend and native hosts — keep the type, remove the silent type-vs-behavior trap.

### Silver

Competitive and solid — matches a good notifications library and covers common professional use.

- **`-formats`-free rich content (widen `NotificationRequest`).** Add optional, plain-data fields, each a documented capability tier: `image?: string` (big-picture), `badge?: string` (monochrome status icon), `sound?: string`, `vibrate?: ReadonlyArray<number>`, `timestamp?: number`, `requireInteraction?: boolean`, `renotify?: boolean`, `dir?: 'auto' | 'ltr' | 'rtl'`, `lang?: string`, `data?: unknown` (round-tripped to click/action callbacks). Web backend maps the subset the `Notification` API supports; the rest are honored only by capable backends.
- **Priority / importance.** Add `NotificationPriority = 'min' | 'low' | 'default' | 'high' | 'max'` and `interruptionLevel?: 'passive' | 'active' | 'timeSensitive' | 'critical'` (Apple) to `@flighthq/types`; add `priority?` / `interruptionLevel?` to `NotificationRequest`.
- **Channels / categories.** Add `NotificationChannel` (`{ id, name, importance, description?, sound?, vibrate?, badge?, group? }`) and `NotificationCategory` (id + ordered actions) to `@flighthq/types`. Add `channelId?` / `categoryId?` to `NotificationRequest` and command functions `createNotificationChannel(channel)`, `deleteNotificationChannel(id)`, `getNotificationChannels(): ReadonlyArray<NotificationChannel>`. No-op/sentinel on web (web has no channel model); load-bearing on Android-class native hosts.
- **Grouping / stacking.** Add `group?: string` (thread/collapse id) and `groupSummary?: boolean` to `NotificationRequest`; document collapse semantics per backend.
- **Local scheduling.** Add `NotificationSchedule` (`{ at: number, repeat?: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' }`) and `ScheduledNotification` (request + schedule + id) to `@flighthq/types`. Backend methods `schedule`, `cancelScheduled`, `getPending`. Free functions `scheduleNotification(request, schedule): Promise<string>`, `cancelScheduledNotification(id): void`, `getPendingNotifications(): Promise<ReadonlyArray<ScheduledNotification>>`. Web backend implements a best-effort `setTimeout`-backed scheduler (cleared on reload, documented) so the API works everywhere; native hosts use the OS scheduler.
- **Service-worker web backend (`-formats`-style neighbor or in-package variant).** Add `createServiceWorkerNotificationBackend(registration)` that uses `registration.showNotification` / `getNotifications` so `actions`, `closeAll`, and `onNotificationAction` are genuinely delivered on the web via `notificationclick`/`notificationactionclick`. This closes the last type-vs-behavior gap on the web tier.
- **Lifecycle events.** Add backend `subscribeShow` / `subscribeClose` / `subscribeDismiss` and free functions `onNotificationShow(listener)`, `onNotificationClose(listener)`, `onNotificationDismiss(listener)` — each delivering the notification id. Web backend wires `onshow`/`onclose` per instance.
- **Cold-start entry path.** Add `getLaunchNotification(): Promise<NotificationRequest | null>` — the notification an app was launched from (null on web / when not launched from one). Critical mobile entry path; native-host-served.
- **Optional signals group.** For multi-listener / priority / cancellable consumption, add `enableNotificationSignals()` in this package exposing a `NotificationSignals` entity (show/click/action/dismiss/reply) over `@flighthq/signals`, mirroring the suite's `enable*` opt-in pattern. Keep the plain `on*` callbacks as the default zero-cost path.

### Gold

Authoritative / AAA — the canonical reference for the notifications domain.

- **Inline reply / text input actions.** Add `NotificationAction.input?: { placeholder?: string }` and `subscribeReply` / `onNotificationReply(listener: (id, actionId, text) => void)`. Round-trip reply text from native (Android `RemoteInput`, Apple `UNTextInputNotificationAction`, Electron `reply`) and the SW backend.
- **Progress / ongoing / sticky.** Add `progress?: { value: number; max: number; indeterminate?: boolean }`, `ongoing?: boolean`, `autoCancelMs?: number` to `NotificationRequest`; add `updateNotification(id, partial)` for live progress updates (download/upload bars).
- **Active-notification introspection.** `getActiveNotifications(): Promise<ReadonlyArray<NotificationRequest>>` (currently-displayed), beyond pending/scheduled — the full delivered/pending/active triad every mature API exposes.
- **Action ergonomics & icons.** `NotificationAction.icon?: string`, `destructive?` / `authenticationRequired?` (Apple), `foreground?` (whether tapping foregrounds the app).
- **Per-backend capability descriptor.** `getNotificationCapabilities(): NotificationCapabilities` — a plain-data record (`{ actions, image, channels, scheduling, reply, progress, badge, sound, vibrate }`) so callers can branch on what the active backend supports instead of guessing. Replaces ad-hoc `isSupported()` checks with a precise capability surface.
- **`*Kind` identity for extensibility.** Introduce string kinds where the domain warrants extension (e.g. `NotificationActionKind` for built-in vs reply vs custom action shapes) following the SDK's string-registry kind model, enabling vendor-prefixed custom action types.
- **Exhaustive host backends.** `@flighthq/host-electron` already in scope; ensure full Electron `Notification` coverage (actions, reply, close, toast events) and document the Tauri / Capacitor / Cordova `LocalNotifications` and Android `NotificationCompat` / Apple `UNUserNotificationCenter` mappings as the canonical native target matrix.
- **Permission flow polish.** `requestNotificationPermission` returns the tri-state `NotificationPermission` (not just boolean) for native hosts that report provisional/ephemeral grants; add `'provisional'` to the permission union where supported.
- **Tests & docs.** Per-function colocated tests including: tri-state permission transitions, id echo vs generated, alias-safe `updateNotification`, scheduler fire/cancel, SW backend action delivery (mocked `ServiceWorkerRegistration`), capability descriptor per backend, and a documented native-mapping reference table.
- **Rust parity.** Full `flighthq-notification` crate mirror: `notify`/`get_permission`/`close`/`schedule`/`get_pending`/`get_active`/`on_*` over a `NotificationBackend` trait, native default backend behind the `native` feature, plus host-winit/host-web fills. Add to the conformance map and parity matrix.

## Sequencing & effort

Recommended order (each tier cumulative):

1. **Bronze first, in `@flighthq/types` then package** (small, ~1 session). Tri-state permission, id return + `closeNotification`/`closeAllNotifications`, real per-instance web click wiring. These are local, no new dependencies, and remove the two worst gaps (boolean permission, inert clicks). The `notify` return-type change from `boolean` → `string` is a breaking signature change — do it now while pre-release, not later.
2. **Silver type widening before behavior** (medium). Land all the widened `NotificationRequest` fields, `NotificationPermission`/`NotificationPriority`/`NotificationChannel`/`NotificationCategory`/`NotificationSchedule`/`ScheduledNotification` types in `@flighthq/types` in one pass (the header is the design surface), then implement the web backend subset + scheduler. The service-worker backend and channels are the larger sub-efforts.
3. **Silver SW backend + lifecycle + cold-start** (medium). The service-worker variant is the key web-tier unlock for `actions`; lifecycle and `getLaunchNotification` are mostly type + backend plumbing.
4. **Gold last** (large, spread across host backends). Reply, progress/update, active-notification introspection, capability descriptor, and the full native host matrix. Rust parity tracks alongside each tier rather than as a final lump.

Cross-package / design-decision items to surface before acting:

- **`notify` return type change (`boolean` → `string`)** is a public API reshape. Confirm the `''`-as-not-shown sentinel convention is acceptable vs `null` (string union with `null` would be more explicit). Pre-release, so safe to break — but it ripples into the Rust seam and any examples.
- **Service-worker backend placement.** Decide whether it ships in-package as `createServiceWorkerNotificationBackend(registration)` (preferred — no new package, still tree-shakable since the web/native/SW backends are separate exported factories) or as a `-formats`/host neighbor. It is not an importer/parser, so it does not fit the `-formats` pattern; an in-package factory is the right call.
- **Channels & scheduling are native-leaning.** Their web implementations are no-op/best-effort. Confirm shipping them with documented web-tier degradation (rather than withholding the API) matches the suite's "web backend guards and returns sentinels" rule — it does, but worth an explicit decision since `setTimeout`-backed scheduling does not survive reload.
- **`enableNotificationSignals` ownership.** The `enable*` signal group lives in this package per the owning-package rule; confirm it does not pull `@flighthq/signals` into the default bundle (it must stay behind the opt-in `enable*` call to preserve tree-shaking).
- **Coordinate with `@flighthq/app`.** Badge count stays in `@flighthq/app` (`setAppBadgeCount`); ensure the `badge?` field added to `NotificationRequest` (the per-notification status icon) is documented as distinct from the app badge to avoid confusion.
- **`@flighthq/host-electron`** already lists the notification seam in scope (index.md); the Gold native coverage should be coordinated with that crate's owner rather than implemented blindly here.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/notification` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
